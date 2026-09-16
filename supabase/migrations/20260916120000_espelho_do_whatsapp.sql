-- O espelho das conversas do WhatsApp, dentro de casa.
--
-- ── Por que ───────────────────────────────────────────────────────────────
--
-- Hoje a corrente é NÓS → Wavy → Evolution → WhatsApp, e o elo do meio é
-- nosso. O que o Wavy guarda de insubstituível são as conversas: ~17 mil
-- mensagens e ~4,5 mil contatos que só existem lá.
--
-- Estas tabelas são o passo que não dá para pular antes de qualquer troca de
-- fornecedor: COPIAR o que é nosso para o nosso banco, enquanto o Wavy segue
-- funcionando normalmente. Nada é desligado aqui. A tela continua atendendo
-- pelo mesmo caminho até o espelho estar provado.
--
-- ── Três coisas que o espelho conserta de graça ──────────────────────────
--
-- 1. `push-poll-conversations` existe porque "o CRM não tem webhook de
--    entrada — as conversas só existem por consulta". Mensagem nova é
--    descoberta comparando contadores de não-lidas entre rodadas de cron.
--    É a causa da lentidão do chat.
-- 2. `mapConversation` grava `lastMessagePreview: null` — fixo. A listagem do
--    CRM não traz a última mensagem, e é por isso que toda linha da caixa de
--    entrada mostra "—". Com as mensagens aqui, a prévia sai de um gatilho.
-- 3. `lastMessageAt` recebe o `created_at` da CONVERSA, não o da última
--    mensagem. A ordem da caixa de entrada está errada desde sempre.
--
-- ── A base é Chatwoot ────────────────────────────────────────────────────
--
-- O CRM é Chatwoot com Evolution API na frente: mesmos `inbox_id`,
-- `contact_inbox`, `source_id`, `message_type` 0/1, anexos no ActiveStorage
-- do Rails. Os nomes de coluna aqui seguem os nossos, e o `payload` guarda a
-- linha crua — o que não modelamos hoje não se perde.

-- ── A regra do telefone, uma vez só ──────────────────────────────────────
--
-- `crm-contacts/index.ts` registra que "comparar as strings cruas era o que
-- fazia a busca por telefone nunca achar nada, mesmo com o contato certo na
-- página certa". O espelho não pode nascer com esse bug dentro: o número
-- entra cru E normalizado, e é pelo normalizado que se procura.
--
-- Mesma decisão do `normalizeBrazilianPhone` do app: pelo COMPRIMENTO, não
-- pelo prefixo. 10 ou 11 dígitos significa que falta o país mesmo quando
-- começa com 55 — aí o 55 é o DDD (Santa Maria, Uruguaiana).
CREATE OR REPLACE FUNCTION public.wa_e164_br(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN d = '' THEN NULL
    WHEN length(d) IN (10, 11) THEN '55' || d
    ELSE d
  END
  FROM (
    SELECT regexp_replace(regexp_replace(coalesce(raw, ''), '\D', '', 'g'), '^0+', '') AS d
  ) x;
$$;

-- ── Contatos ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wa_contacts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- O id do CRM é a chave do espelho, e não um id novo nosso: é o que faz a
  -- carga poder rodar de novo sem duplicar, e o que permite casar o espelho
  -- com o que já está gravado em `patients.crm_contact_id`.
  crm_contact_id  text NOT NULL,
  name            text,
  phone_raw       text,
  phone_e164      text GENERATED ALWAYS AS (public.wa_e164_br(phone_raw)) STORED,
  avatar_url      text,
  -- O vínculo com a ficha. É ISTO que responde "esse agendamento é da mesma
  -- pessoa daquela conversa?" — hoje a pergunta atravessa dois sistemas por
  -- telefone; com o espelho, vira uma junção.
  --
  -- Anulável de propósito: contato sem ficha continua sendo um contato.
  patient_id      uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  crm_created_at  timestamptz,
  -- A linha como o CRM devolveu. O espelho copia tudo e modela o que usa —
  -- um campo que ninguém leu hoje não pode virar dado perdido amanhã.
  payload         jsonb,
  synced_at       timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_contacts_crm
  ON public.wa_contacts (owner_id, crm_contact_id);
-- O índice que a busca por telefone nunca teve: `patients` não tem índice em
-- `phone` nem em `crm_contact_id`, e toda procura por contato hoje é
-- varredura da tabela inteira.
CREATE INDEX IF NOT EXISTS idx_wa_contacts_fone
  ON public.wa_contacts (owner_id, phone_e164) WHERE phone_e164 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_contacts_paciente
  ON public.wa_contacts (patient_id) WHERE patient_id IS NOT NULL;

-- ── Conversas ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wa_conversations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  crm_conversation_id  text NOT NULL,
  crm_contact_id       text,
  -- Por qual NÚMERO a conversa entrou. O modelo do CRM é um número = uma
  -- caixa, então trocar de número deixa a caixa antiga com as conversas dela.
  inbox_id             text,
  status               text NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open', 'resolved', 'pending')),
  unread_count         integer NOT NULL DEFAULT 0,
  -- Mantidos por gatilho a partir das mensagens (ver abaixo), não copiados:
  -- é o conserto dos dois defeitos da listagem de hoje.
  last_message_at      timestamptz,
  last_message_preview text,
  crm_created_at       timestamptz,
  payload              jsonb,
  -- Quando as mensagens DESTA conversa foram copiadas pela última vez.
  --
  -- É o que torna a carga inicial retomável sem tabela de estado: 17 mil
  -- mensagens não cabem numa única execução de Edge Function, então cada
  -- rodada pega as N conversas com a cópia mais antiga (nulo primeiro) e
  -- avança. Cair no meio custa uma rodada, não a carga inteira.
  messages_synced_at   timestamptz,
  synced_at            timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- `CREATE TABLE IF NOT EXISTS` não altera tabela que já existe: numa base
-- onde ela já foi criada, uma coluna acrescentada ao corpo acima seria
-- ignorada em silêncio. Por isso toda coluna nova ganha seu ALTER explícito.
ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS messages_synced_at timestamptz;

-- A fila da cópia de mensagens, na ordem em que ela deve andar.
CREATE INDEX IF NOT EXISTS idx_wa_conversations_fila
  ON public.wa_conversations (owner_id, messages_synced_at NULLS FIRST);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_conversations_crm
  ON public.wa_conversations (owner_id, crm_conversation_id);
-- A ordem da caixa de entrada, que é a consulta mais quente da tela.
-- `NULLS LAST` porque conversa sem mensagem nenhuma vai para o fim, não para
-- o topo.
CREATE INDEX IF NOT EXISTS idx_wa_conversations_recentes
  ON public.wa_conversations (owner_id, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_wa_conversations_contato
  ON public.wa_conversations (owner_id, crm_contact_id);

-- ── Mensagens ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wa_messages (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  crm_message_id       text NOT NULL,
  crm_conversation_id  text NOT NULL,
  -- `message_type` 0/1 do Chatwoot já resolvido aqui. O mapeamento do app
  -- aceita número E string porque em teste real o valor chegou como string, e
  -- com a comparação estrita toda mensagem caía como recebida.
  from_me              boolean NOT NULL DEFAULT false,
  body                 text,
  -- Nota interna: fica na conversa dentro do CRM e nunca foi enviada ao
  -- contato. Precisa continuar distinguível, senão vira uma mensagem que o
  -- paciente nunca recebeu aparecendo como recebida.
  is_private           boolean NOT NULL DEFAULT false,
  -- Os anexos como o CRM os descreve. As URLs são ASSINADAS e servidas pelo
  -- CRM: copiar só o endereço não preserva o arquivo. Enquanto o Wavy estiver
  -- de pé elas funcionam; `media_path` abaixo é onde a cópia de verdade vai
  -- morar quando o conteúdo for baixado para o Storage.
  attachments          jsonb NOT NULL DEFAULT '[]'::jsonb,
  media_path           text,
  sent_at              timestamptz NOT NULL,
  payload              jsonb,
  synced_at            timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_messages_crm
  ON public.wa_messages (owner_id, crm_message_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_thread
  ON public.wa_messages (owner_id, crm_conversation_id, sent_at DESC);
-- Anexo ainda não baixado: é a fila da cópia de mídia, e some sozinha à
-- medida que ela roda.
CREATE INDEX IF NOT EXISTS idx_wa_messages_midia_pendente
  ON public.wa_messages (owner_id, sent_at)
  WHERE media_path IS NULL AND attachments <> '[]'::jsonb;

-- ── A prévia e a hora, mantidas pelo banco ───────────────────────────────
--
-- Mesmo desenho da soma da fatura do cartão e do resumo dos procedimentos, e
-- pelo mesmo motivo: o banco é o único lugar por onde TODAS as escritas
-- passam — a carga inicial, o delta do cron e, depois, o webhook da Evolution.
-- Recalcular no app significaria escrever a mesma regra em três caminhos e
-- esquecer num deles.
--
-- Nota interna não vira prévia: ela nunca foi enviada ao contato, e ver o
-- rascunho da equipe como última mensagem da conversa confundiria quem lê a
-- lista. Mas ela CONTA para a hora — a conversa foi mexida.

CREATE OR REPLACE FUNCTION public.wa_recalc_conversa(p_owner uuid, p_conversa text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_quando timestamptz;
  v_previa text;
  v_ultima RECORD;
BEGIN
  SELECT max(sent_at) INTO v_quando
    FROM public.wa_messages
   WHERE owner_id = p_owner AND crm_conversation_id = p_conversa;

  -- A ÚLTIMA mensagem, e só então decide-se o que mostrar dela.
  --
  -- A primeira versão disto procurava "a última COM TEXTO", e caía no anexo
  -- só quando não havia texto nenhum na conversa. Uma foto mandada agora,
  -- depois de uma conversa escrita, deixava a lista mostrando a frase de
  -- ontem — como se nada tivesse chegado.
  SELECT m.body, m.attachments INTO v_ultima
    FROM public.wa_messages m
   WHERE m.owner_id = p_owner
     AND m.crm_conversation_id = p_conversa
     AND NOT m.is_private
   ORDER BY m.sent_at DESC, m.crm_message_id DESC
   LIMIT 1;

  IF v_ultima.body IS NOT NULL AND btrim(v_ultima.body) <> '' THEN
    v_previa := v_ultima.body;
  ELSE
    -- Mensagem só de anexo tem `body` vazio, e "—" na lista esconderia que
    -- chegou uma foto. O texto sai do tipo do primeiro anexo.
    v_previa := CASE jsonb_extract_path_text(v_ultima.attachments -> 0, 'tipo')
                  WHEN 'image' THEN '📷 Foto'
                  WHEN 'audio' THEN '🎤 Áudio'
                  WHEN 'video' THEN '🎬 Vídeo'
                  WHEN 'file'  THEN '📎 Arquivo'
                  ELSE NULL
                END;
  END IF;

  UPDATE public.wa_conversations c
     SET last_message_at = v_quando,
         last_message_preview = v_previa
   WHERE c.owner_id = p_owner AND c.crm_conversation_id = p_conversa;
END;
$$;

CREATE OR REPLACE FUNCTION public.wa_messages_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Mensagem que muda de conversa não deve acontecer, mas o gatilho não pode
  -- depender disso: recalcula as DUAS, senão a antiga fica com a prévia de
  -- uma mensagem que não está mais lá.
  IF TG_OP <> 'INSERT' THEN
    PERFORM public.wa_recalc_conversa(OLD.owner_id, OLD.crm_conversation_id);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM public.wa_recalc_conversa(NEW.owner_id, NEW.crm_conversation_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS wa_messages_sync ON public.wa_messages;
CREATE TRIGGER wa_messages_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.wa_messages
  FOR EACH ROW EXECUTE FUNCTION public.wa_messages_sync();

-- ── Vínculo com a ficha do paciente ──────────────────────────────────────
--
-- `patients.crm_contact_id` já existe e já liga 1.311 fichas a um contato.
-- Esta carga aproveita o que já foi ligado, em vez de refazer o trabalho.
--
-- Por telefone NÃO se liga automaticamente, e isto é o ponto mais importante
-- deste arquivo: dos 203 números que aparecem em mais de uma ficha da base,
-- 147 têm NOMES DIFERENTES — mãe e filho, marido e mulher, responsável e
-- criança, o normal em odontologia. Casar por número sozinho agendaria o
-- Arthur na ficha da Sue Ellen. O telefone serve para SUGERIR na tela, com
-- alguém confirmando; nunca para decidir aqui.

CREATE OR REPLACE FUNCTION public.wa_vincular_por_crm_contact(p_owner uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE afetados integer;
BEGIN
  UPDATE public.wa_contacts w
     SET patient_id = p.id
    FROM public.patients p
   WHERE w.owner_id = p_owner
     AND w.patient_id IS NULL
     AND p.owner_id = p_owner
     AND p.crm_contact_id = w.crm_contact_id;
  GET DIAGNOSTICS afetados = ROW_COUNT;
  RETURN afetados;
END;
$$;

-- ── RLS e privilégios ────────────────────────────────────────────────────
--
-- Os GRANTs de tabela não são opcionais: sem eles a política existe e o
-- acesso é negado antes dela. Foi o que faltou na migration do cartão e o
-- Lovable teve que consertar.
--
-- Escopo por dono, e não por unidade: conversa de WhatsApp entra pelo número
-- da clínica, que é um só para todas as unidades — não há unidade a que
-- atribuí-la sem inventar.

ALTER TABLE public.wa_contacts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_messages      ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text; pol RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY['wa_contacts', 'wa_conversations', 'wa_messages'] LOOP
    FOR pol IN SELECT policyname FROM pg_policies
                WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', pol.policyname, t);
    END LOOP;
    -- Só leitura pelo dono. Quem escreve é a Edge Function com service role,
    -- mesmo padrão de `meta_capi_events`: o espelho é um reflexo, e reflexo
    -- não se edita pela tela.
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (owner_id = auth.uid());',
      t || '_owner_read', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated;', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role;', t);
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.wa_recalc_conversa(uuid, text) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.wa_messages_sync() FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.wa_vincular_por_crm_contact(uuid) FROM PUBLIC, authenticated;
