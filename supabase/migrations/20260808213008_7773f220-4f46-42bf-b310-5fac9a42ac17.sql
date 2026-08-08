CREATE TABLE public.pipeline_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  status text NOT NULL DEFAULT 'negotiating',
  loss_reason text,
  value numeric,
  currency text NOT NULL DEFAULT 'BRL',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, item_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipeline_deals TO authenticated;
GRANT ALL ON public.pipeline_deals TO service_role;
ALTER TABLE public.pipeline_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their deals" ON public.pipeline_deals
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER set_pipeline_deals_updated_at
  BEFORE UPDATE ON public.pipeline_deals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.pipeline_deal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  kind text NOT NULL DEFAULT 'note',
  body text,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pipeline_deal_events_owner_item_idx
  ON public.pipeline_deal_events (owner_id, item_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipeline_deal_events TO authenticated;
GRANT ALL ON public.pipeline_deal_events TO service_role;
ALTER TABLE public.pipeline_deal_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their deal events" ON public.pipeline_deal_events
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);