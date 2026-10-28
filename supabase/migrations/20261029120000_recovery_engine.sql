-- O Recovery Engine: a Luna volta em quem parou de responder no tempo que a
-- tela configurar, por trilha.
--
-- ── Sem tabela nova ──────────────────────────────────────────────────────
--
-- A sequência de uma conversa mora na própria conversa (`ai_agent_sessions`):
-- o calendário inteiro, calculado quando ela nasce, e o índice da próxima
-- etapa. Guardar o calendário pronto é o que versiona a configuração: mudar os
-- minutos na tela vale para as sequências que nascerem depois, e quem está no
-- meio segue com o calendário com que começou.
--
-- O que cada etapa mandou continua em `ai_agent_messages`, como toda mensagem
-- da Luna; três colunas novas dizem de qual trilha, etapa e mecanismo ela veio.
-- É dali que sai a medição.
--
-- ── Nada liga sozinho ────────────────────────────────────────────────────
--
-- `recovery_config` nasce NULL, e NULL quer dizer motor desligado. Quem cria a
-- primeira configuração é a tela, quando alguém liga. O follow-up antigo
-- (`followup_*`) continua como está até lá.

ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS recovery_config jsonb;

COMMENT ON COLUMN public.ai_agents.recovery_config IS
  'Recovery Engine: janela, tolerância e as etapas de cada trilha. NULL = desligado. Formato em supabase/functions/_shared/recuperacao.ts (normalizarConfig).';

ALTER TABLE public.ai_agent_sessions
  ADD COLUMN IF NOT EXISTS recovery_status text,
  ADD COLUMN IF NOT EXISTS recovery_trilha text,
  ADD COLUMN IF NOT EXISTS recovery_intensidade text,
  ADD COLUMN IF NOT EXISTS recovery_origem_em timestamptz,
  ADD COLUMN IF NOT EXISTS recovery_plano jsonb,
  ADD COLUMN IF NOT EXISTS recovery_passo integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recovery_proximo_em timestamptz,
  ADD COLUMN IF NOT EXISTS recovery_mecanismos text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS recovery_tentativas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recovery_enviando_desde timestamptz,
  ADD COLUMN IF NOT EXISTS recovery_pergunta_aberta text,
  ADD COLUMN IF NOT EXISTS recovery_motivo text,
  ADD COLUMN IF NOT EXISTS retorno_combinado_em date,
  ADD COLUMN IF NOT EXISTS nao_contatar_em timestamptz;

ALTER TABLE public.ai_agent_sessions
  DROP CONSTRAINT IF EXISTS ai_agent_sessions_recovery_status_check;
ALTER TABLE public.ai_agent_sessions
  ADD CONSTRAINT ai_agent_sessions_recovery_status_check
  CHECK (recovery_status IS NULL OR recovery_status IN ('ativa', 'enviando', 'encerrada', 'cancelada'));

COMMENT ON COLUMN public.ai_agent_sessions.recovery_plano IS
  'O calendário da sequência, calculado quando ela nasceu: [{passo, venceEm, mecanismo, tipo, juntou}].';
COMMENT ON COLUMN public.ai_agent_sessions.recovery_passo IS
  'Índice da próxima etapa em recovery_plano. Uma rodada só envia depois de trocar ativa→enviando NESTE passo: é o que impede envio duplicado.';
COMMENT ON COLUMN public.ai_agent_sessions.nao_contatar_em IS
  'A pessoa pediu para não receber mensagens. Nenhuma retomada sai depois disto.';

-- A rodada de cada minuto: as conversas com etapa vencida. Parcial porque
-- sequência ativa é minoria.
CREATE INDEX IF NOT EXISTS idx_ai_sessions_recovery_vencidas
  ON public.ai_agent_sessions (agent_id, recovery_proximo_em)
  WHERE recovery_status IN ('ativa', 'enviando');

ALTER TABLE public.ai_agent_messages
  ADD COLUMN IF NOT EXISTS recovery_trilha text,
  ADD COLUMN IF NOT EXISTS recovery_passo integer,
  ADD COLUMN IF NOT EXISTS recovery_mecanismo text;

COMMENT ON COLUMN public.ai_agent_messages.recovery_passo IS
  'Preenchido quando a mensagem é uma retomada do Recovery Engine: a etapa (1, 2…). A medição por trilha, etapa e mecanismo sai daqui.';

-- ── O cron NÃO é alterado aqui ───────────────────────────────────────────
--
-- Pela mesma razão das outras migrations de cron: o agendamento é feito no
-- deploy (scripts/migracao/rotinas.sql), que passa a rodar `agente-followup`
-- a cada minuto. O follow-up antigo, para quem não ligou o motor, continua
-- saindo só no minuto 43 de cada hora (ver agente-followup/index.ts).
