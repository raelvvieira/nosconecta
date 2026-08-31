-- O atendimento do Agente de IA: sessões, mensagens, regras e o ciclo diário.
--
-- ── O que esta migration assume, e o que não ───────────────────────────────
--
-- O aprendizado (migration anterior) é território verificado: o ciclo roda e
-- produz manuais a partir de conversas reais. O ATENDIMENTO não é — no sistema
-- de referência foram cinco agentes criados, zero vinculados a uma caixa e zero
-- sessões executadas. Por isso tudo aqui nasce desligado e auditável: cada
-- mensagem que entra e cada resposta que sai ficam gravadas, porque a primeira
-- pergunta quando algo der errado vai ser "a IA respondeu isso mesmo?".

-- ── Como o agente atende ───────────────────────────────────────────────────
ALTER TABLE public.ai_agents
  -- `eco` responde sempre a mesma frase; `ia` chama o modelo.
  --
  -- Existe porque a especificação recomenda fechar o circuito ANTES de pensar
  -- em inteligência: um agente que responde sempre igual, mas responde, prova o
  -- contrato inteiro — vínculo com a caixa, entrega, autenticação, criação da
  -- mensagem. Com isso de pé, trocar a frase fixa pela chamada ao modelo é a
  -- parte fácil, e nunca se depura contrato e prompt ao mesmo tempo.
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'eco',
  ADD COLUMN IF NOT EXISTS echo_message text NOT NULL
    DEFAULT 'Recebi sua mensagem! Já te respondo.',

  -- ── Disjuntor ────────────────────────────────────────────────────────────
  -- Sem ele, uma IA fora do ar empilha fila e a clínica vê o WhatsApp travar
  -- sem entender por quê. Cinco falhas seguidas abrem o disjuntor; ele fecha
  -- sozinho depois da janela.
  ADD COLUMN IF NOT EXISTS failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS circuit_open_until timestamptz,

  CONSTRAINT ai_agents_modo CHECK (mode IN ('eco', 'ia'));

-- ── As regras de comportamento ─────────────────────────────────────────────
--
-- Todas no mesmo formato: uma CONDIÇÃO e um texto em linguagem natural. Não é
-- código, e não deveria ser: quem escreve isso é quem atende, não quem programa.
--
-- Ficam separadas das REGRAS DE REPASSE, que moram em código
-- (`_shared/instrucao-do-agente.ts`) e ninguém edita. Estas aqui são o irmão
-- configurável daquelas: aquelas dizem quando o agente PRECISA parar; estas,
-- quando a clínica QUER que ele faça algo.
CREATE TABLE IF NOT EXISTS public.ai_agent_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,

  -- inatividade | transferencia | contato | pipeline
  kind text NOT NULL,

  -- Nasce DESLIGADA. Vale para todas, e especialmente para `pipeline`: um
  -- agente que move card sozinho gera a própria matéria-prima de treino, porque
  -- o coletor procura exatamente cards que entraram numa etapa de vitória. Se
  -- ele marcar como ganho o que não foi, aprende com o próprio erro e o
  -- reforça. Por isso `ai_playbook_sources.moved_by` separa `pessoa` de
  -- `agente`, e o aprendizado lê só as de pessoa.
  active boolean NOT NULL DEFAULT false,

  -- A instrução, em português. "Quando o paciente disser que vai pensar,
  -- pergunte o que ficou em dúvida antes de encerrar."
  instruction text NOT NULL DEFAULT '',

  -- Só para `inatividade`: depois de quantos minutos, e o que fazer.
  after_minutes integer,
  -- cutucar | encerrar
  action text,

  -- Só para `pipeline`: para qual etapa o agente pode mover.
  stage_id text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ai_agent_rules_tipo
    CHECK (kind IN ('inatividade', 'transferencia', 'contato', 'pipeline')),
  CONSTRAINT ai_agent_rules_acao
    CHECK (action IS NULL OR action IN ('cutucar', 'encerrar')),
  -- Inatividade sem minutos nem ação é uma regra que não sabe quando disparar.
  CONSTRAINT ai_agent_rules_inatividade_completa CHECK (
    kind <> 'inatividade'
    OR (after_minutes IS NOT NULL AND after_minutes BETWEEN 1 AND 43200 AND action IS NOT NULL)
  ),
  CONSTRAINT ai_agent_rules_pipeline_tem_etapa
    CHECK (kind <> 'pipeline' OR stage_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_rules_agente
  ON public.ai_agent_rules (agent_id, kind);

-- ── Uma sessão por conversa atendida ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_agent_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,

  -- Id da conversa no CRM. `text` e sem FK: a conversa vive lá, não aqui.
  conversation_id text NOT NULL,
  contact_id text,
  contact_name text,

  -- ── A regra que mais importa depois de "não invente preço" ───────────────
  -- A IA se cala assim que uma pessoa responde a conversa, e não volta sozinha.
  --
  -- É diferente dos outros filtros porque é PERMANENTE, não por mensagem:
  -- quando a recepção assume um atendimento, a IA não pode voltar a falar na
  -- mensagem seguinte só porque aquela mensagem passou nos filtros. Quem
  -- devolve é uma pessoa, na tela.
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

-- ── O que entrou e o que saiu ──────────────────────────────────────────────
--
-- Auditoria, não histórico de conversa (esse vive no CRM). Sem isto, "a IA
-- respondeu isso?" e "por que ela não respondeu?" não têm resposta — e as duas
-- perguntas vão aparecer no primeiro dia de uso.
CREATE TABLE IF NOT EXISTS public.ai_agent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.ai_agent_sessions(id) ON DELETE CASCADE,

  -- entrada | saida | ignorada
  direction text NOT NULL,
  content text,

  -- Preenchido em `ignorada`: qual filtro barrou. É o campo que transforma
  -- "a IA não respondeu" de mistério em linha lida.
  skipped_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ai_agent_messages_direcao
    CHECK (direction IN ('entrada', 'saida', 'ignorada'))
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_sessao
  ON public.ai_agent_messages (session_id, created_at DESC);

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.ai_agent_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_agent_rules_scoped ON public.ai_agent_rules;
CREATE POLICY ai_agent_rules_scoped ON public.ai_agent_rules
  FOR ALL TO authenticated
  USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

-- Sessões e mensagens o app só LÊ, e a de sessões aceita UPDATE por uma razão
-- só: devolver a conversa para a IA depois de um humano ter assumido. Quem
-- escreve o resto é a Edge Function com service role — registro de auditoria
-- editável à mão deixa de ser auditoria.
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

-- ── O ciclo diário ─────────────────────────────────────────────────────────
--
-- 4h da manhã em Brasília = 7h UTC. De madrugada porque a rodada lê conversas
-- no CRM e chama o modelo: fazer isso no horário de atendimento disputaria
-- banda com quem está trabalhando.
--
-- Autentica com a chave anon, mesmo padrão e mesma justificativa do cron de
-- disparo (20260812210500): a chave já vai dentro do bundle do cliente e só
-- satisfaz a checagem de "é um JWT válido?" da plataforma. A função lê a
-- service role key do próprio ambiente dela.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule('ai-playbook-diario')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ai-playbook-diario');

-- O cron dispara uma vez por DONO: a função aprende por conta, e um disparo
-- global não saberia de quem é o manual a reconstruir.
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
