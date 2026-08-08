-- Status, valor e observações de cada negociação do funil.
--
-- O funil vive no CRM externo (Wavy) e ele não expõe conceito de negociação
-- ganha/perdida por card — o único ganho/perdido que existe lá é o
-- `stage_type` da ETAPA, não do card. Então isso mora aqui, chaveado pelo id
-- remoto do item, mesmo padrão sidecar de crm_campaign_configs.
--
-- item_id é o id do pipeline_item no CRM: texto, sem FK real (o registro
-- correspondente não está neste banco).
CREATE TABLE public.pipeline_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  status text NOT NULL DEFAULT 'negotiating', -- negotiating | won | lost
  loss_reason text,
  value numeric,
  currency text NOT NULL DEFAULT 'BRL',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_pipeline_deals_owner_item
  ON public.pipeline_deals (owner_id, item_id);

ALTER TABLE public.pipeline_deals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pipeline_deals_owner ON public.pipeline_deals;
CREATE POLICY pipeline_deals_owner ON public.pipeline_deals
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- Linha do tempo da negociação, append-only. Resolve "observações" e
-- "histórico" de uma vez: a observação escrita à mão e a troca de status
-- entram na mesma lista, em ordem, e é isso que permite entender depois por
-- que uma negociação terminou como terminou.
CREATE TABLE public.pipeline_deal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  kind text NOT NULL, -- note | status | stage | appointment
  body text,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pipeline_deal_events_owner_item
  ON public.pipeline_deal_events (owner_id, item_id, created_at DESC);

ALTER TABLE public.pipeline_deal_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pipeline_deal_events_owner ON public.pipeline_deal_events;
CREATE POLICY pipeline_deal_events_owner ON public.pipeline_deal_events
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
