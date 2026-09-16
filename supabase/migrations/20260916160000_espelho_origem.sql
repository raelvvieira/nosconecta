-- De onde veio cada linha do espelho: do Wavy ou da Evolution própria.
--
-- ── Por que isto não é enfeite ───────────────────────────────────────────
--
-- Os ids das duas origens são numéricos e independentes. A conversa 1234 do
-- Chatwoot e a conversa 1234 da Evolution são coisas diferentes, e hoje a
-- chave única é só `(owner_id, crm_conversation_id)` — então a segunda
-- SOBRESCREVERIA a primeira num upsert. Histórico de um paciente substituído
-- pelo de outro, sem erro nenhum aparecendo.
--
-- Esta é a primeira metade da ponte entre os dois mundos. A segunda é o
-- telefone, que já está aqui normalizado e indexado desde a primeira
-- migration: é ele que faz a conversa nova da Evolution colar no histórico
-- antigo do Wavy, porque no WhatsApp o NÚMERO é a identidade da conversa.
--
-- ── Por que os índices novos convivem com os velhos ──────────────────────
--
-- A carga está rodando enquanto isto sobe. A Edge Function faz upsert com
-- `onConflict: "owner_id,crm_conversation_id"`, e trocar o índice único de
-- baixo dela faria o PostgREST não achar a restrição citada: a rodada
-- inteira passaria a estourar.
--
-- Então os dois convivem: este arquivo só ACRESCENTA. A Edge Function passa a
-- usar a chave nova no deploy seguinte, e só depois disso os índices antigos
-- são removidos — numa migration própria, quando ninguém mais os cita.

ALTER TABLE public.wa_contacts
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'wavy'
  CHECK (origem IN ('wavy', 'evolution'));
ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'wavy'
  CHECK (origem IN ('wavy', 'evolution'));
ALTER TABLE public.wa_messages
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'wavy'
  CHECK (origem IN ('wavy', 'evolution'));

-- `wavy` como padrão porque é verdade: tudo que já está espelhado veio de lá.
-- Coluna com default constante é mudança só de catálogo no Postgres moderno —
-- não reescreve a tabela, então não briga com a carga que está rodando.

CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_contacts_origem_crm
  ON public.wa_contacts (owner_id, origem, crm_contact_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_conversations_origem_crm
  ON public.wa_conversations (owner_id, origem, crm_conversation_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_messages_origem_crm
  ON public.wa_messages (owner_id, origem, crm_message_id);

-- ── A ponte: uma pessoa, as conversas das duas origens ───────────────────
--
-- No WhatsApp o número É a identidade da conversa: se mãe e filho usam o
-- mesmo celular, existe UM chat, não dois. Então agrupar conversa por número
-- não junta quem deveria estar separado — reproduz a realidade.
--
-- (Isso é diferente de ligar o número a uma FICHA de paciente, onde o mesmo
-- telefone pode corresponder a duas pessoas. Lá a ambiguidade é real e a tela
-- pergunta; aqui não há ambiguidade nenhuma.)
--
-- Contato sem telefone é GRUPO do WhatsApp — "#NÓS Floripa - Gestão",
-- "Grupo de Estudos". Grupo não tem número, tem id de grupo: fica fora da
-- ponte de propósito, e continua alcançável pelo id de origem.
CREATE OR REPLACE VIEW public.wa_conversas_por_pessoa AS
SELECT
  c.owner_id,
  -- A chave da pessoa: o telefone quando há, e o id da origem quando não há
  -- (grupo). Nunca nula, para nenhuma conversa sumir do agrupamento.
  COALESCE(
    NULLIF(w.phone_e164, ''),
    c.origem || ':' || c.crm_contact_id,
    'conversa:' || c.crm_conversation_id
  ) AS pessoa,
  w.phone_e164,
  c.origem,
  c.crm_conversation_id,
  c.crm_contact_id,
  w.name AS contact_name,
  w.avatar_url,
  w.patient_id,
  c.status,
  c.unread_count,
  c.last_message_at,
  c.last_message_preview
FROM public.wa_conversations c
LEFT JOIN public.wa_contacts w
  ON w.owner_id = c.owner_id
 AND w.origem = c.origem
 AND w.crm_contact_id = c.crm_contact_id;

GRANT SELECT ON public.wa_conversas_por_pessoa TO authenticated;
GRANT SELECT ON public.wa_conversas_por_pessoa TO service_role;
