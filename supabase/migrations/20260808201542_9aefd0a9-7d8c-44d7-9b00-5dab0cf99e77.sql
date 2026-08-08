CREATE TABLE IF NOT EXISTS public.meta_capi_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  pixel_id text,
  offline_event_set_id text,
  access_token text,
  test_event_code text,
  api_version text NOT NULL DEFAULT 'v24.0',
  enabled boolean NOT NULL DEFAULT false,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.meta_capi_credentials TO service_role;
ALTER TABLE public.meta_capi_credentials ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.meta_capi_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  system_event text NOT NULL,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  meta_event_name text NOT NULL,
  value_source text NOT NULL DEFAULT 'none',
  fixed_value numeric,
  currency text NOT NULL DEFAULT 'BRL',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meta_capi_triggers_owner_event
  ON public.meta_capi_triggers (owner_id, system_event) WHERE active;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_capi_triggers TO authenticated;
GRANT ALL ON public.meta_capi_triggers TO service_role;
ALTER TABLE public.meta_capi_triggers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS meta_capi_triggers_owner ON public.meta_capi_triggers;
CREATE POLICY meta_capi_triggers_owner ON public.meta_capi_triggers
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.meta_capi_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger_id uuid REFERENCES public.meta_capi_triggers(id) ON DELETE SET NULL,
  system_event text NOT NULL,
  meta_event_name text NOT NULL,
  event_id text NOT NULL,
  status text NOT NULL,
  payload jsonb,
  response jsonb,
  dropped_keys jsonb,
  error text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meta_capi_events_owner_sent
  ON public.meta_capi_events (owner_id, sent_at DESC);
GRANT SELECT ON public.meta_capi_events TO authenticated;
GRANT ALL ON public.meta_capi_events TO service_role;
ALTER TABLE public.meta_capi_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS meta_capi_events_owner_read ON public.meta_capi_events;
CREATE POLICY meta_capi_events_owner_read ON public.meta_capi_events
  FOR SELECT TO authenticated USING (owner_id = auth.uid());