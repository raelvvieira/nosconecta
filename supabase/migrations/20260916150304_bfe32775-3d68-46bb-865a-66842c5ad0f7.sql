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

CREATE TABLE IF NOT EXISTS public.wa_contacts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  crm_contact_id  text NOT NULL,
  name            text,
  phone_raw       text,
  phone_e164      text GENERATED ALWAYS AS (public.wa_e164_br(phone_raw)) STORED,
  avatar_url      text,
  patient_id      uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  crm_created_at  timestamptz,
  payload         jsonb,
  synced_at       timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_contacts_crm
  ON public.wa_contacts (owner_id, crm_contact_id);
CREATE INDEX IF NOT EXISTS idx_wa_contacts_fone
  ON public.wa_contacts (owner_id, phone_e164) WHERE phone_e164 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_contacts_paciente
  ON public.wa_contacts (patient_id) WHERE patient_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.wa_conversations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  crm_conversation_id  text NOT NULL,
  crm_contact_id       text,
  inbox_id             text,
  status               text NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open', 'resolved', 'pending')),
  unread_count         integer NOT NULL DEFAULT 0,
  last_message_at      timestamptz,
  last_message_preview text,
  crm_created_at       timestamptz,
  payload              jsonb,
  messages_synced_at   timestamptz,
  synced_at            timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS messages_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_wa_conversations_fila
  ON public.wa_conversations (owner_id, messages_synced_at NULLS FIRST);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_conversations_crm
  ON public.wa_conversations (owner_id, crm_conversation_id);
CREATE INDEX IF NOT EXISTS idx_wa_conversations_recentes
  ON public.wa_conversations (owner_id, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_wa_conversations_contato
  ON public.wa_conversations (owner_id, crm_contact_id);

CREATE TABLE IF NOT EXISTS public.wa_messages (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  crm_message_id       text NOT NULL,
  crm_conversation_id  text NOT NULL,
  from_me              boolean NOT NULL DEFAULT false,
  body                 text,
  is_private           boolean NOT NULL DEFAULT false,
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
CREATE INDEX IF NOT EXISTS idx_wa_messages_midia_pendente
  ON public.wa_messages (owner_id, sent_at)
  WHERE media_path IS NULL AND attachments <> '[]'::jsonb;

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