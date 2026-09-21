-- Migração 20260921220000 (duplicata da já aplicada — idempotente)
CREATE TABLE IF NOT EXISTS public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  content text NOT NULL DEFAULT '',
  media_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_message_templates_owner_nome
  ON public.message_templates (owner_id, lower(btrim(name)));

CREATE TABLE IF NOT EXISTS public.whatsapp_send_settings (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_send_limit integer NOT NULL DEFAULT 200,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.whatsapp_send_settings (owner_id, daily_send_limit)
SELECT owner_id, COALESCE(daily_send_limit, 200)
FROM public.crm_credentials
WHERE owner_id IS NOT NULL
ON CONFLICT (owner_id) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_templates TO authenticated;
GRANT ALL ON public.message_templates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_send_settings TO authenticated;
GRANT ALL ON public.whatsapp_send_settings TO service_role;

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_send_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS message_templates_scoped ON public.message_templates;
CREATE POLICY message_templates_scoped ON public.message_templates
  FOR ALL TO authenticated
  USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

DROP POLICY IF EXISTS whatsapp_send_settings_scoped ON public.whatsapp_send_settings;
CREATE POLICY whatsapp_send_settings_scoped ON public.whatsapp_send_settings
  FOR ALL TO authenticated
  USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

DROP TRIGGER IF EXISTS update_message_templates_updated_at ON public.message_templates;
CREATE TRIGGER update_message_templates_updated_at BEFORE UPDATE ON public.message_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_whatsapp_send_settings_updated_at ON public.whatsapp_send_settings;
CREATE TRIGGER update_whatsapp_send_settings_updated_at BEFORE UPDATE ON public.whatsapp_send_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Migração 20260921230000: desliga os crons que consultavam o CRM
SELECT cron.unschedule('wa-espelho')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wa-espelho');

SELECT cron.unschedule('push-poll-conversations')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'push-poll-conversations');