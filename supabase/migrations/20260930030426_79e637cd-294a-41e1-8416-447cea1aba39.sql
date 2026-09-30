-- A Luna volta em quem sumiu.
--
-- ── O que não existia ────────────────────────────────────────────────────
--
-- Nada. Medido em 30/09: nenhuma função de follow-up, e as três automações do
-- sistema são todas de agenda. O custo, nas 549 conversas que falam de
-- clareamento: em 262 a clínica falou por último e a pessoa sumiu entre 7 e 30
-- dias atrás. Ninguém voltou em nenhuma.

-- ── O contador, por conversa ─────────────────────────────────────────────
--
-- Duas colunas em vez de tabela nova porque a pergunta é sempre "quantos
-- toques esta conversa já levou e quando foi o último" — nunca "liste os
-- toques". O TEXTO de cada toque já fica em `ai_agent_messages`, como toda
-- mensagem que a Luna manda; aqui só mora o contador.
ALTER TABLE public.ai_agent_sessions
  ADD COLUMN IF NOT EXISTS followups_enviados integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultimo_followup_em timestamptz;

COMMENT ON COLUMN public.ai_agent_sessions.followups_enviados IS
  'Quantas vezes a Luna voltou nesta conversa depois do silêncio. O máximo é decidido em ai_agents.';
COMMENT ON COLUMN public.ai_agent_sessions.ultimo_followup_em IS
  'Quando foi o último toque. O relógio do toque seguinte conta DAQUI, não do silêncio — senão os dois sairiam quase juntos.';

-- ── A configuração, por clínica ──────────────────────────────────────────
ALTER TABLE public.ai_agents
  -- Nasce DESLIGADO, e isto não é conservadorismo: é o único jeito honesto de
  -- pôr no ar uma coisa que manda mensagem no WhatsApp de gente real sozinha.
  ADD COLUMN IF NOT EXISTS followup_ligado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS followup_horas_1 integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS followup_horas_2 integer NOT NULL DEFAULT 72,
  ADD COLUMN IF NOT EXISTS followup_ligado_desde timestamptz;

-- ── A coluna que impede o acidente ───────────────────────────────────────
--
-- `followup_ligado_desde` é a peça mais importante desta migration.
--
-- Sem ela, o cron acharia toda conversa parada e voltaria nela. No dia em que
-- a clínica ligasse a chave, 262 pessoas receberiam mensagem da Luna ao mesmo
-- tempo, muitas sobre uma conversa de dois meses atrás que elas já esqueceram.
--
-- Isso não é follow-up, é disparo. E disparo que a pessoa não espera vira
-- bloqueio — que no WhatsApp derruba a reputação do número e leva embora
-- também as conversas que funcionavam.
--
-- Com ela, o cron só volta em conversa que ficou parada DEPOIS de alguém
-- ligar a chave. Recuperar o que já estava parado é trabalho deliberado,
-- revisado por uma pessoa, e não coisa de cron.
COMMENT ON COLUMN public.ai_agents.followup_ligado_desde IS
  'Quando a clínica ligou o follow-up. Conversa que já estava parada antes disto NÃO é acordada pelo cron — ligar não pode virar disparo para o acervo inteiro.';
COMMENT ON COLUMN public.ai_agents.followup_ligado IS
  'A Luna volta em quem sumiu? Nasce desligado de propósito.';
COMMENT ON COLUMN public.ai_agents.followup_horas_1 IS
  'Horas de silêncio antes do primeiro toque.';
COMMENT ON COLUMN public.ai_agents.followup_horas_2 IS
  'Horas depois do PRIMEIRO toque para o segundo. Conta do toque, não do silêncio.';

-- A consulta do cron: as candidatas de uma clínica, sem humano no meio, com
-- menos toques que o máximo. Índice parcial porque quem tem toque pendente é
-- minoria e a varredura roda de hora em hora.
CREATE INDEX IF NOT EXISTS idx_ai_sessions_followup
  ON public.ai_agent_sessions (agent_id, last_outbound_at)
  WHERE human_took_over_at IS NULL AND followups_enviados < 2;

-- ── O cron NÃO é agendado aqui ───────────────────────────────────────────
--
-- Os cinco agendamentos que já existem embutem a chave de autenticação dentro
-- do próprio comando (`cron.job.command`), porque é assim que `net.http_post`
-- chama uma Edge Function. Repetir isso aqui colocaria a chave num arquivo do
-- repositório — e um arquivo de migration é lido, copiado e versionado.
--
-- Então o agendamento é feito fora, junto do deploy, no mesmo molde do
-- `agente-licoes`:
--
--   SELECT cron.schedule('agente-followup', '43 * * * *', ...);
--
-- Minuto 43 de propósito: `agente-licoes` roda no 17 e o disparo no minuto
-- cheio. Duas Edge Functions pesadas no mesmo instante disputam o mesmo
-- runtime.
--
-- De hora em hora, e não de minuto em minuto como o disparo: follow-up não tem
-- pressa, e a janela de horário (9h às 19h, em dia de atendimento) já limita a
-- umas dez rodadas por dia.
--
-- Enquanto o agendamento não existir, nada acontece — e como `followup_ligado`
-- nasce `false`, nada aconteceria mesmo que existisse. Os dois freios são
-- independentes de propósito.