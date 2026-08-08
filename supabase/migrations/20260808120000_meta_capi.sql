-- Integração com a Conversions API da Meta: credenciais do Pixel, gatilhos
-- configuráveis (evento interno -> evento da Meta) e log de entrega.

-- Credenciais. Mesmo padrão de segurança de crm_credentials: RLS habilitada
-- e ZERO policies = deny-all pra authenticated/anon. Só o service role (a
-- Edge Function meta-capi) lê/escreve, pra que o access token nunca seja
-- alcançável por uma query feita com o JWT do usuário.
CREATE TABLE public.meta_capi_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  pixel_id text,
  access_token text,
  test_event_code text,
  api_version text NOT NULL DEFAULT 'v21.0',
  enabled boolean NOT NULL DEFAULT false,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.meta_capi_credentials ENABLE ROW LEVEL SECURITY;
-- Sem CREATE POLICY: proposital, ver comentário acima.

-- Gatilhos. Não guardam segredo nenhum, então RLS de dono normal (mesmo
-- padrão de crm_campaign_configs) — a tela lê e escreve direto.
--
-- system_event: evento interno observado pelo app
--   pipeline.stage_changed | appointment.created | appointment.status_changed
--   | receivable.paid | patient.created
-- conditions: filtro opcional do evento, {} quando não se aplica
--   {"stageId": "..."} pra pipeline.stage_changed  <- é assim que "Ganho" é
--   representado: a clínica escolhe qual etapa conta como ganho, já que o
--   CRM externo não expõe hoje um conceito de etapa ganha/perdida.
--   {"status": "completed"} pra appointment.status_changed
-- value_source: none | event | fixed
CREATE TABLE public.meta_capi_triggers (
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

-- Vários gatilhos podem observar o mesmo evento interno (ex.: mandar Purchase
-- e Lead na mesma mudança de etapa), então não é índice único.
CREATE INDEX idx_meta_capi_triggers_owner_event
  ON public.meta_capi_triggers (owner_id, system_event) WHERE active;

ALTER TABLE public.meta_capi_triggers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS meta_capi_triggers_owner ON public.meta_capi_triggers;
CREATE POLICY meta_capi_triggers_owner ON public.meta_capi_triggers
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- Log de entrega, mesmo papel de appointment_notifications: dá pra depurar
-- "por que esse evento não chegou na Meta" sem sair do sistema.
-- payload guarda o que foi enviado (com os dados pessoais JÁ hasheados, nunca
-- e-mail/telefone em claro).
CREATE TABLE public.meta_capi_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger_id uuid REFERENCES public.meta_capi_triggers(id) ON DELETE SET NULL,
  system_event text NOT NULL,
  meta_event_name text NOT NULL,
  event_id text NOT NULL,
  status text NOT NULL, -- sent | failed
  payload jsonb,
  response jsonb,
  error text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_meta_capi_events_owner_sent
  ON public.meta_capi_events (owner_id, sent_at DESC);

ALTER TABLE public.meta_capi_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS meta_capi_events_owner_read ON public.meta_capi_events;
-- Só leitura pelo dono: quem escreve é a Edge Function com service role.
CREATE POLICY meta_capi_events_owner_read ON public.meta_capi_events
  FOR SELECT USING (owner_id = auth.uid());
