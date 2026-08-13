alter table public.appointments
  add column if not exists actual_revenue numeric(12,2);

comment on column public.appointments.actual_revenue is
  'Valor cobrado no atendimento. NULL = atendimento ainda não confirmado como realizado; 0 = gratuito.';

alter table public.pipeline_deals
  add column if not exists realized_on date,
  add column if not exists appointment_id uuid;

create index if not exists idx_pipeline_deals_owner_realized
  on public.pipeline_deals (owner_id, realized_on);

CREATE TABLE IF NOT EXISTS public.whatsapp_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL,
  interval_seconds integer NOT NULL DEFAULT 8,
  status text NOT NULL DEFAULT 'running',
  total integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_broadcast_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES public.whatsapp_broadcasts(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id text NOT NULL,
  conversation_id text,
  contact_name text,
  phone text,
  status text NOT NULL DEFAULT 'pending',
  sent_via text,
  error text,
  scheduled_for timestamptz NOT NULL,
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_broadcast_targets_due
  ON public.whatsapp_broadcast_targets (status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_broadcast_targets_lote
  ON public.whatsapp_broadcast_targets (broadcast_id);
CREATE INDEX IF NOT EXISTS idx_broadcasts_owner
  ON public.whatsapp_broadcasts (owner_id, created_at DESC);

ALTER TABLE public.whatsapp_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_broadcast_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_broadcasts_owner_read ON public.whatsapp_broadcasts;
CREATE POLICY whatsapp_broadcasts_owner_read ON public.whatsapp_broadcasts
  FOR SELECT USING (owner_id = auth.uid());

DROP POLICY IF EXISTS whatsapp_broadcast_targets_owner_read ON public.whatsapp_broadcast_targets;
CREATE POLICY whatsapp_broadcast_targets_owner_read ON public.whatsapp_broadcast_targets
  FOR SELECT USING (owner_id = auth.uid());

GRANT SELECT ON public.whatsapp_broadcasts TO authenticated;
GRANT SELECT ON public.whatsapp_broadcast_targets TO authenticated;
GRANT ALL ON public.whatsapp_broadcasts TO service_role;
GRANT ALL ON public.whatsapp_broadcast_targets TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule('whatsapp-broadcast-tick')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-broadcast-tick');

SELECT cron.schedule(
  'whatsapp-broadcast-tick',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ddfteoeehsticjhojpka.supabase.co/functions/v1/whatsapp-broadcast',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkZnRlb2VlaHN0aWNqaG9qcGthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NDA4MjcsImV4cCI6MjA5NzIxNjgyN30.FBVpoyMqMZXm9ARh0Do1IlhPuWQSVkhjf1E_uXsAPMM'
    ),
    body := '{"action":"tick"}'::jsonb
  );
  $$
);