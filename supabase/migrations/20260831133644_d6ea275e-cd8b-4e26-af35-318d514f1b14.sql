CREATE TABLE IF NOT EXISTS public.ai_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Assistente da NÓS',
  enabled boolean NOT NULL DEFAULT false,
  winning_stage_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  debounce_seconds integer NOT NULL DEFAULT 5,
  segment_enabled boolean NOT NULL DEFAULT true,
  segment_limit integer NOT NULL DEFAULT 300,
  segment_min_size integer NOT NULL DEFAULT 50,
  delay_per_character numeric NOT NULL DEFAULT 50,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_agents_humanizacao_sana CHECK (
    debounce_seconds BETWEEN 0 AND 120
    AND segment_limit BETWEEN 80 AND 2000
    AND segment_min_size BETWEEN 0 AND 500
    AND delay_per_character BETWEEN 0 AND 300
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_agents_um_por_dono
  ON public.ai_agents (owner_id);

CREATE TABLE IF NOT EXISTS public.ai_sales_playbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  learned jsonb NOT NULL DEFAULT '{}'::jsonb,
  overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_learned_at timestamptz,
  last_skip_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_playbooks_um_por_dono
  ON public.ai_sales_playbooks (owner_id);

CREATE TABLE IF NOT EXISTS public.ai_playbook_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  playbook_id uuid NOT NULL REFERENCES public.ai_sales_playbooks(id) ON DELETE CASCADE,
  conversation_id text NOT NULL,
  contact_name text,
  moved_by text NOT NULL DEFAULT 'pessoa',
  learned_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_playbook_sources_origem CHECK (moved_by IN ('pessoa', 'agente'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_sources_conversa_unica
  ON public.ai_playbook_sources (playbook_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_sources_recentes
  ON public.ai_playbook_sources (playbook_id, learned_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_agent_procedures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  procedure_id uuid NOT NULL REFERENCES public.clinic_procedures(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_agent_procedures_unico
  ON public.ai_agent_procedures (agent_id, procedure_id);

ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_agents_scoped ON public.ai_agents;
CREATE POLICY ai_agents_scoped ON public.ai_agents
  FOR ALL TO authenticated
  USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

ALTER TABLE public.ai_sales_playbooks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_playbooks_scoped ON public.ai_sales_playbooks;
CREATE POLICY ai_playbooks_scoped ON public.ai_sales_playbooks
  FOR ALL TO authenticated
  USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

ALTER TABLE public.ai_playbook_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_sources_read ON public.ai_playbook_sources;
CREATE POLICY ai_sources_read ON public.ai_playbook_sources
  FOR SELECT TO authenticated
  USING (public.can_access_row(owner_id));

ALTER TABLE public.ai_agent_procedures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_agent_procedures_scoped ON public.ai_agent_procedures;
CREATE POLICY ai_agent_procedures_scoped ON public.ai_agent_procedures
  FOR ALL TO authenticated
  USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_sales_playbooks TO authenticated;
GRANT SELECT ON public.ai_playbook_sources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_procedures TO authenticated;
GRANT ALL ON public.ai_agents TO service_role;
GRANT ALL ON public.ai_sales_playbooks TO service_role;
GRANT ALL ON public.ai_playbook_sources TO service_role;
GRANT ALL ON public.ai_agent_procedures TO service_role;

ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'eco',
  ADD COLUMN IF NOT EXISTS echo_message text NOT NULL
    DEFAULT 'Recebi sua mensagem! Já te respondo.',
  ADD COLUMN IF NOT EXISTS failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS circuit_open_until timestamptz,
  ADD CONSTRAINT ai_agents_modo CHECK (mode IN ('eco', 'ia'));

CREATE TABLE IF NOT EXISTS public.ai_agent_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  kind text NOT NULL,
  active boolean NOT NULL DEFAULT false,
  instruction text NOT NULL DEFAULT '',
  after_minutes integer,
  action text,
  stage_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_agent_rules_tipo
    CHECK (kind IN ('inatividade', 'transferencia', 'contato', 'pipeline')),
  CONSTRAINT ai_agent_rules_acao
    CHECK (action IS NULL OR action IN ('cutucar', 'encerrar')),
  CONSTRAINT ai_agent_rules_inatividade_completa CHECK (
    kind <> 'inatividade'
    OR (after_minutes IS NOT NULL AND after_minutes BETWEEN 1 AND 43200 AND action IS NOT NULL)
  ),
  CONSTRAINT ai_agent_rules_pipeline_tem_etapa
    CHECK (kind <> 'pipeline' OR stage_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_rules_agente
  ON public.ai_agent_rules (agent_id, kind);

CREATE TABLE IF NOT EXISTS public.ai_agent_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  conversation_id text NOT NULL,
  contact_id text,
  contact_name text,
  human_took_over_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_sessions_conversa_unica
  ON public.ai_agent_sessions (agent_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_recentes
  ON public.ai_agent_sessions (owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_agent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.ai_agent_sessions(id) ON DELETE CASCADE,
  direction text NOT NULL,
  content text,
  skipped_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_agent_messages_direcao
    CHECK (direction IN ('entrada', 'saida', 'ignorada'))
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_sessao
  ON public.ai_agent_messages (session_id, created_at DESC);

ALTER TABLE public.ai_agent_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_agent_rules_scoped ON public.ai_agent_rules;
CREATE POLICY ai_agent_rules_scoped ON public.ai_agent_rules
  FOR ALL TO authenticated
  USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

ALTER TABLE public.ai_agent_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_sessions_read ON public.ai_agent_sessions;
CREATE POLICY ai_sessions_read ON public.ai_agent_sessions
  FOR SELECT TO authenticated
  USING (public.can_access_row(owner_id));
DROP POLICY IF EXISTS ai_sessions_devolver ON public.ai_agent_sessions;
CREATE POLICY ai_sessions_devolver ON public.ai_agent_sessions
  FOR UPDATE TO authenticated
  USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

ALTER TABLE public.ai_agent_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_messages_read ON public.ai_agent_messages;
CREATE POLICY ai_messages_read ON public.ai_agent_messages
  FOR SELECT TO authenticated
  USING (public.can_access_row(owner_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_rules TO authenticated;
GRANT SELECT, UPDATE ON public.ai_agent_sessions TO authenticated;
GRANT SELECT ON public.ai_agent_messages TO authenticated;
GRANT ALL ON public.ai_agent_rules TO service_role;
GRANT ALL ON public.ai_agent_sessions TO service_role;
GRANT ALL ON public.ai_agent_messages TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule('ai-playbook-diario')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai-playbook-diario');

SELECT cron.schedule(
  'ai-playbook-diario',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ddfteoeehsticjhojpka.supabase.co/functions/v1/ai-playbook',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkZnRlb2VlaHN0aWNqaG9qcGthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NDA4MjcsImV4cCI6MjA5NzIxNjgyN30.FBVpoyMqMZXm9ARh0Do1IlhPuWQSVkhjf1E_uXsAPMM'
    ),
    body := jsonb_build_object('ownerId', a.owner_id::text, 'action', 'ciclo')
  )
  FROM public.ai_agents a
  $$
);