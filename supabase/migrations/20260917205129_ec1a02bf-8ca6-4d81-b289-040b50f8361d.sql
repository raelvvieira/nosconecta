CREATE TABLE IF NOT EXISTS public.wa_instances (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_name  text NOT NULL,
  phone_e164     text,
  status         text NOT NULL DEFAULT 'desconhecido'
                   CHECK (status IN ('open', 'connecting', 'close', 'desconhecido')),
  connected_at   timestamptz,
  last_event_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_instances_nome
  ON public.wa_instances (instance_name);

ALTER TABLE public.wa_instances ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
              WHERE schemaname='public' AND tablename='wa_instances' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.wa_instances;', pol.policyname);
  END LOOP;
  EXECUTE 'CREATE POLICY wa_instances_owner_read ON public.wa_instances '
       || 'FOR SELECT TO authenticated USING (owner_id = auth.uid());';
END $$;

GRANT SELECT ON public.wa_instances TO authenticated;
GRANT ALL ON public.wa_instances TO service_role;

ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS unread_at_sync integer;

COMMENT ON COLUMN public.wa_conversations.unread_at_sync IS
  'O unread_count do CRM no momento em que as mensagens desta conversa foram copiadas. '
  'Diferente do atual = chegou mensagem nova, recopiar.';

UPDATE public.wa_conversations
   SET unread_at_sync = unread_count
 WHERE messages_synced_at IS NOT NULL AND unread_at_sync IS NULL;

CREATE OR REPLACE VIEW public.wa_conversas_a_sincronizar AS
SELECT
  owner_id,
  crm_conversation_id,
  unread_count,
  messages_synced_at,
  CASE
    WHEN messages_synced_at IS NULL THEN 0
    WHEN unread_count IS DISTINCT FROM unread_at_sync THEN 1
    ELSE 2
  END AS prioridade
FROM public.wa_conversations
WHERE origem = 'wavy'
  AND (
    messages_synced_at IS NULL
    OR unread_count IS DISTINCT FROM unread_at_sync
    OR messages_synced_at < now() - interval '24 hours'
  );

GRANT SELECT ON public.wa_conversas_a_sincronizar TO service_role;

CREATE INDEX IF NOT EXISTS idx_wa_conversations_sync_lento
  ON public.wa_conversations (owner_id, messages_synced_at)
  WHERE origem = 'wavy';