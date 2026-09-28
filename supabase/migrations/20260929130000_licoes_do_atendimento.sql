-- O que a Luna aprende com cada conversa que terminou.
--
-- ── Por que gravar, em vez de só aprender ────────────────────────────────
--
-- A clínica pediu duas coisas: que a IA analise a conversa quando consegue
-- agendar, e que se autoavalie quando não consegue, "e essas informações do
-- porquê ela não conseguiu ficam registradas para fins de melhorias nas versões
-- da md". A segunda parte é o que faz isto ser uma TABELA e não um prompt: a
-- lição existe para uma PESSOA ler e mudar o manual. Aprendizado que não deixa
-- rastro não dá para conferir nem para discordar.

CREATE TABLE IF NOT EXISTS public.ai_agent_licoes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- A conversa de onde a lição saiu. `CASCADE` porque uma lição sobre uma
  -- conversa apagada não significa mais nada.
  session_id     uuid NOT NULL REFERENCES public.ai_agent_sessions(id) ON DELETE CASCADE,
  conversation_id text,
  contact_name   text,
  -- 'agendou' = a Luna conduziu até a consulta marcada, sem ninguém assumir no
  -- meio. 'nao_agendou' cobre tanto a conversa que morreu quanto a que uma
  -- pessoa teve de fechar — nos dois casos a pergunta é a mesma: o que faltou
  -- para ela fechar sozinha.
  desfecho       text NOT NULL CHECK (desfecho IN ('agendou', 'nao_agendou')),
  -- A prova do desfecho positivo. Sem ela, "agendou" seria palavra do modelo.
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  -- Uma pessoa entrou no meio. Guardado porque muda a leitura da lição: não é
  -- a mesma coisa a conversa morrer sozinha e a recepção ter de resgatá-la.
  humano_assumiu boolean NOT NULL DEFAULT false,
  -- A autoavaliação, em campos. Ver `FORMATO_DA_LICAO` em
  -- `_shared/licoes-do-atendimento.ts`.
  o_que_funcionou text,
  o_que_faltou    text,
  -- SEM `CHECK`, de propósito, mesmo a lista sendo fechada no formato pedido ao
  -- modelo: uma categoria inesperada não pode fazer a gravação falhar e perder
  -- a lição inteira. Quem normaliza é `licaoDoJson`, antes de chegar aqui.
  motivo          text,
  momento_decisivo text,
  sugestao        text,
  confianca       text,
  -- O tamanho da conversa, para a tela poder desconfiar de uma lição tirada de
  -- três mensagens sem precisar abrir a conversa.
  mensagens       integer,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Uma lição por conversa ───────────────────────────────────────────────
--
-- É o que impede a mesma conversa de ser avaliada a cada rodada do cron: duas
-- lições da mesma conversa se contradizendo é pior que nenhuma, e cada rodada
-- custa uma chamada de modelo. O `ON CONFLICT DO NOTHING` da Edge Function
-- depende deste índice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_licoes_sessao
  ON public.ai_agent_licoes (session_id);
-- A ordem da tela.
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

-- ── O sinal do desfecho positivo ─────────────────────────────────────────
--
-- "A Luna conseguiu agendar" não existe como campo em lugar nenhum: hoje ela
-- conduz e uma pessoa marca na agenda. O sinal honesto é um agendamento que
-- apareceu para o telefone desta conversa DEPOIS de a conversa começar.
--
-- Pelo telefone normalizado, e não por `patient_id`: quem vem de anúncio não
-- tem ficha quando a conversa começa — a ficha nasce junto com o agendamento.
-- Ligar por ficha perderia exatamente o caso que interessa.
--
-- Gêmea de `agendamento_por_telefone` (20260927120000) na forma de receber as
-- variantes do número; a pergunta é outra (foi CRIADO depois de, em vez de
-- acontece a partir de hoje), e juntar as duas daria uma função com dois
-- sentidos e nenhum claro.
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
    -- SEM filtro de status, e isto é uma decisão.
    --
    -- A tentação é excluir cancelada e faltou. Mas o que esta função responde é
    -- "a conversa virou consulta MARCADA?", e marcar é o que a Luna faz; quem
    -- comparece ou desmarca depois não está na mão dela. Filtrar por status
    -- faria uma conversa que converteu cair no silêncio de 24 horas e render uma
    -- lição NEGATIVA — "o que faltou para você fechar?" numa conversa que
    -- fechou. Errar para esse lado é pior: ensina a coisa errada, e ninguém vai
    -- reler cem lições para descobrir.
    AND public.telefone_br_normalizado(p.phone) = ANY (_variantes)
  ORDER BY a.created_at
  LIMIT 1;
$$;

-- O default do Supabase concede EXECUTE para `anon` em toda função pública, e
-- um `SECURITY DEFINER` alcançável sem autenticação lê a agenda inteira da
-- clínica (ver 20260814143815).
REVOKE EXECUTE ON FUNCTION public.agendamento_criado_apos(uuid, text[], timestamptz) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.agendamento_criado_apos(uuid, text[], timestamptz) TO authenticated, service_role;

COMMENT ON FUNCTION public.agendamento_criado_apos(uuid, text[], timestamptz) IS
  'O primeiro agendamento criado para este telefone depois de um instante, em qualquer status. É o sinal de que a conversa da Luna virou consulta marcada.';

-- ── O relógio das lições ─────────────────────────────────────────────────
--
-- De hora em hora, e não de minuto em minuto: a definição de "conversa
-- encerrada" é 24 horas de silêncio, então rodar mais vezes só produziria
-- rodadas que não acham nada. A Edge Function decide sozinha o que avaliar e
-- não avalia a mesma conversa duas vezes.
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
