-- Plano, teste e franquia de conversas da assistente.
--
-- A regra mora em `supabase/functions/_shared/plano-do-consultorio.ts`; aqui
-- só o que ela precisa no banco.

-- Que aviso de franquia já foi dado, e em que mês ("2026-10"). Um aviso por
-- nível (80%, 100%) por mês.
ALTER TABLE public.clinicas
  ADD COLUMN IF NOT EXISTS aviso_franquia_mes text,
  ADD COLUMN IF NOT EXISTS aviso_franquia_nivel integer NOT NULL DEFAULT 0;

-- Quantas conversas diferentes a assistente respondeu desde `_desde`. É a
-- conta da franquia: conversa, não mensagem nem token. Só a chave de serviço
-- chama (as Edge Functions e o servidor do site).
CREATE OR REPLACE FUNCTION public.conversas_do_mes(_owner uuid, _desde timestamptz)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT count(DISTINCT session_id)::int
  FROM public.ai_agent_messages
  WHERE owner_id = _owner AND direction = 'saida' AND created_at >= _desde
$function$;

REVOKE ALL ON FUNCTION public.conversas_do_mes(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.conversas_do_mes(uuid, timestamptz) TO service_role;

-- Ler as conversas do mês é por consultório; o índice deixa a conta barata
-- mesmo com meses de histórico.
CREATE INDEX IF NOT EXISTS ai_agent_messages_saida_do_mes
  ON public.ai_agent_messages (owner_id, created_at)
  WHERE direction = 'saida';
