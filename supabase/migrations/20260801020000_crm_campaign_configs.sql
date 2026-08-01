-- Metadados de campanha que o CRM (Wavy) provavelmente não ecoa de volta em
-- list/detail — segmentação por etapa do pipeline, movimentação pós-envio,
-- mídia anexada e pacing (pausar a cada N mensagens / retomar após X min).
-- campaign_id é o id remoto do Wavy (texto, sem FK real pro CRM externo).
CREATE TABLE public.crm_campaign_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id text NOT NULL,
  source_stage_id text,
  target_stage_id text,
  media_url text,
  media_kind text NOT NULL DEFAULT 'image',
  pause_after_count integer,
  resume_after_minutes integer,
  audience_contact_ids jsonb,
  save_audience_list boolean NOT NULL DEFAULT false,
  -- ids de pipeline item ainda não movidos pra target_stage_id; rede de
  -- segurança pra retomar se a aba fechar no meio do loop de movimentação.
  move_pending_contact_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_crm_campaign_configs_owner_campaign
  ON public.crm_campaign_configs (owner_id, campaign_id);

ALTER TABLE public.crm_campaign_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm_campaign_configs_owner ON public.crm_campaign_configs;
CREATE POLICY crm_campaign_configs_owner ON public.crm_campaign_configs
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
