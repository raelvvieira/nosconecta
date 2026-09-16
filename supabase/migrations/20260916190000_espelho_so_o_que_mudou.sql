-- Para de recopiar conversa que não mudou.
--
-- ── O desperdício ────────────────────────────────────────────────────────
--
-- Enquanto havia carga inicial, `sync-mensagens` pegava 40 conversas NUNCA
-- copiadas por rodada. Com tudo copiado, ele passou a pegar as 40 mais
-- ANTIGAS e recopiar — refazendo a volta nas 1.031 a cada ~2h10, para
-- sempre. São ~11 mil chamadas por dia ao CRM para rebuscar conversa
-- idêntica à que já está aqui.
--
-- ── Por que não dá para olhar `last_message_at` ──────────────────────────
--
-- Seria o teste óbvio: "copiar quando a conversa tem mensagem mais nova que
-- a última cópia". Só que `last_message_at` é mantido por gatilho a partir
-- das mensagens que NÓS copiamos. Ele nunca sabe de uma mensagem que ainda
-- não veio — a comparação é circular e daria sempre "nada mudou".
--
-- ── O sinal que funciona ─────────────────────────────────────────────────
--
-- `unread_count`, que vem da LISTA do CRM e é atualizado a cada rodada pelo
-- `sync-conversas` — uma chamada paginada, barata, que já acontece. Mensagem
-- nova do paciente mexe nesse contador.
--
-- Ele não cobre tudo: mensagem que a clínica manda não mexe em não-lidas. Por
-- isso fica também uma varredura lenta, de 24 em 24 horas, que recopia o que
-- não é revisitado há um dia. Passa de ~11.000 para ~1.000 chamadas diárias,
-- e o caso que importa (chegou mensagem) continua sendo pego na hora.

ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS unread_at_sync integer;

COMMENT ON COLUMN public.wa_conversations.unread_at_sync IS
  'O unread_count do CRM no momento em que as mensagens desta conversa foram copiadas. '
  'Diferente do atual = chegou mensagem nova, recopiar.';

-- O que já está copiado ganha o contador de agora: sem isto, as 1.031
-- conversas apareceriam como "mudou" (nulo <> número) e fariam uma volta
-- inteira à toa logo no primeiro deploy.
UPDATE public.wa_conversations
   SET unread_at_sync = unread_count
 WHERE messages_synced_at IS NOT NULL AND unread_at_sync IS NULL;

-- ── A fila, como uma view ────────────────────────────────────────────────
--
-- Em view porque a regra compara DUAS COLUNAS entre si, e o PostgREST não
-- expressa isso num filtro de querystring. Aqui a regra fica num lugar só,
-- legível, e a Edge Function só pede as N primeiras.
CREATE OR REPLACE VIEW public.wa_conversas_a_sincronizar AS
SELECT
  owner_id,
  crm_conversation_id,
  unread_count,
  messages_synced_at,
  CASE
    WHEN messages_synced_at IS NULL THEN 0                        -- nunca copiada
    WHEN unread_count IS DISTINCT FROM unread_at_sync THEN 1      -- chegou mensagem
    ELSE 2                                                        -- varredura lenta
  END AS prioridade
FROM public.wa_conversations
-- Só o que veio do Wavy: esta fila busca no CRM, e conversa da Evolution
-- seria pedida a uma API que nunca ouviu falar dela.
WHERE origem = 'wavy'
  AND (
    messages_synced_at IS NULL
    OR unread_count IS DISTINCT FROM unread_at_sync
    OR messages_synced_at < now() - interval '24 hours'
  );

GRANT SELECT ON public.wa_conversas_a_sincronizar TO service_role;

-- O índice que a view usa para achar as atrasadas sem varrer a tabela.
CREATE INDEX IF NOT EXISTS idx_wa_conversations_sync_lento
  ON public.wa_conversations (owner_id, messages_synced_at)
  WHERE origem = 'wavy';
