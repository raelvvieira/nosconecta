DROP TABLE IF EXISTS public.whatsapp_messages CASCADE;
DROP TABLE IF EXISTS public.whatsapp_conversations CASCADE;
DROP TABLE IF EXISTS public.whatsapp_instances CASCADE;

CREATE TABLE public.crm_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  crm_email text NOT NULL,
  crm_password text NOT NULL,
  access_token text,
  token_expires_at timestamptz,
  inbox_id text,
  evolution_instance_name text,
  pipeline_id text,
  whatsapp_status text NOT NULL DEFAULT 'disconnected',
  phone_number text,
  qr_code text,
  qr_expires_at timestamptz,
  last_error text,
  daily_send_limit integer NOT NULL DEFAULT 200,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.crm_credentials TO service_role;
ALTER TABLE public.crm_credentials ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.crm_campaign_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id text NOT NULL,
  recipient_count integer NOT NULL,
  executed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_crm_campaign_sends_owner_day
  ON public.crm_campaign_sends (owner_id, executed_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_campaign_sends TO authenticated;
GRANT ALL ON public.crm_campaign_sends TO service_role;
ALTER TABLE public.crm_campaign_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_campaign_sends_owner ON public.crm_campaign_sends
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS crm_contact_id text;