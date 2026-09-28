CREATE TABLE IF NOT EXISTS public.ai_agent_licoes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id     uuid NOT NULL REFERENCES public.ai_agent_sessions(id) ON DELETE CASCADE,
  conversation_id text,
  contact_name   text,
  desfecho       text NOT NULL CHECK (desfecho IN ('agendou', 'nao_agendou')),
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  humano_assumiu boolean NOT NULL DEFAULT false,
  o_que_funcionou text,
  o_que_faltou    text,
  motivo          text,
  momento_decisivo text,
  sugestao        text,
  confianca       text,
  mensagens       integer,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_licoes_sessao
  ON public.ai_agent_licoes (session_id);
CREATE INDEX IF NOT EXISTS idx_ai_licoes_recentes
  ON public.ai_agent_licoes (owner_id, created_at DESC);

ALTER TABLE public.ai_agent_licoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_agent_licoes_acesso ON public.ai_agent_licoes;
CREATE POLICY ai_agent_licoes_acesso ON public.ai_agent_licoes
  FOR ALL USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_licoes TO authenticated;

COMMENT ON TABLE public.ai_agent_licoes IS
  'Uma lição por conversa encerrada que a Luna conduziu: o que funcionou, o que faltou e o que mudar no manual. Serve para uma pessoa ler e editar o LUNA V1.';

CREATE OR REPLACE FUNCTION public.agendamento_criado_apos(
  _owner uuid,
  _variantes text[],
  _desde timestamptz
)
RETURNS TABLE (
  appointment_id uuid,
  patient_name text,
  data date,
  hora time,
  criado_em timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, p.name, a.date, a.start_time, a.created_at
  FROM appointments a
  JOIN patients p ON p.id = a.patient_id
  WHERE a.owner_id = _owner
    AND a.created_at >= _desde
    AND public.telefone_br_normalizado(p.phone) = ANY (_variantes)
  ORDER BY a.created_at
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.agendamento_criado_apos(uuid, text[], timestamptz) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.agendamento_criado_apos(uuid, text[], timestamptz) TO authenticated, service_role;

COMMENT ON FUNCTION public.agendamento_criado_apos(uuid, text[], timestamptz) IS
  'O primeiro agendamento criado para este telefone depois de um instante, em qualquer status. É o sinal de que a conversa da Luna virou consulta marcada.';

SELECT cron.unschedule('agente-licoes')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agente-licoes');

SELECT cron.schedule(
  'agente-licoes',
  '17 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ddfteoeehsticjhojpka.supabase.co/functions/v1/agente-licoes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkZnRlb2VlaHN0aWNqaG9qcGthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NDA4MjcsImV4cCI6MjA5NzIxNjgyN30.FBVpoyMqMZXm9ARh0Do1IlhPuWQSVkhjf1E_uXsAPMM'
    ),
    body := '{}'::jsonb
  );
  $$
);