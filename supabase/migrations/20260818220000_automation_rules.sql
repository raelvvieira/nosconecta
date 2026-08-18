-- Automações personalizadas: gatilho -> condições -> ações, construídas
-- visualmente na tela /atendimentos/automacoes. Mesmo padrão de
-- meta_capi_triggers/meta_capi_events (20260808120000_meta_capi.sql) — os
-- mesmos 6 eventos internos (SYSTEM_EVENTS em meta-capi.functions.ts) agora
-- têm um segundo consumidor.

-- Regras. Não guardam segredo nenhum, então RLS de dono normal — a tela lê e
-- escreve direto, sem passar pela Edge Function (que só cuida de execução).
--
-- trigger_event: mesmo vocabulário de meta_capi_triggers.system_event
--   patient.created | appointment.created | appointment.status_changed
--   | receivable.paid | deal.status_changed | pipeline.stage_changed
-- trigger_conditions: {} quando não se aplica, mesmo formato de
--   meta_capi_triggers.conditions ({"stageId"}/{"status"}/{"dealStatus"})
-- actions: lista ordenada, cada item {"type": "send_whatsapp", "message": "..."}
--   ou {"type": "move_pipeline_stage", "stageId": "..."}
-- canvas_layout: posição x/y de cada nó do canvas, só pra desenho voltar
--   como a clínica organizou — {"acionamento": {"x":0,"y":0}, ...}
CREATE TABLE public.automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  trigger_event text NOT NULL,
  trigger_conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  canvas_layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Várias automações podem observar o mesmo evento (ex.: duas mensagens
-- diferentes pro mesmo gatilho, com condições diferentes) — não é índice único.
CREATE INDEX idx_automation_rules_owner_event
  ON public.automation_rules (owner_id, trigger_event) WHERE active;

ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS automation_rules_owner ON public.automation_rules;
CREATE POLICY automation_rules_owner ON public.automation_rules
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- Log de execução, mesmo papel de meta_capi_events: depurar "por que essa
-- automação não rodou" sem sair do sistema. rule_name é um snapshot (a regra
-- pode ter sido excluída depois — o log continua legível).
CREATE TABLE public.automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_id uuid REFERENCES public.automation_rules(id) ON DELETE SET NULL,
  rule_name text,
  trigger_event text NOT NULL,
  action_type text NOT NULL,
  status text NOT NULL, -- sent | failed | skipped_no_contact | skipped_depth_limit
  error text,
  ran_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_automation_runs_owner_ran
  ON public.automation_runs (owner_id, ran_at DESC);

ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS automation_runs_owner_read ON public.automation_runs;
-- Só leitura pelo dono: quem escreve é a Edge Function com service role.
CREATE POLICY automation_runs_owner_read ON public.automation_runs
  FOR SELECT USING (owner_id = auth.uid());
