-- Agente de IA da NÓS: o manual de vendas aprendido e o agente que atende.
--
-- ── A ideia ────────────────────────────────────────────────────────────────
--
-- As conversas que fecharam venda já contêm o método de vendas da clínica.
-- Ninguém precisa escrever roteiro: basta ler o que funcionou e extrair o
-- padrão. O manual sai daí, e vira a instrução do agente que atende no
-- WhatsApp.
--
-- ── Duas decisões que valem mais que o resto do arquivo ────────────────────
--
-- 1. `learned` e `overrides` são colunas SEPARADAS. O que a IA extraiu e o que
--    uma pessoa corrigiu moram em lugares diferentes, e o reaprendizado só
--    reescreve o primeiro. Se a correção humana fosse gravada por cima do
--    aprendido, a rodada seguinte a apagaria — e ninguém confia num sistema
--    que apaga a correção que a pessoa acabou de fazer.
--
-- 2. NÃO existe tabela de produtos aqui. O catálogo da clínica já é
--    `clinic_procedures`, com nome, preço, custo e duração. O agente recebe um
--    SUBCONJUNTO dele (`ai_agent_procedures`). Duas listas de preço
--    divergiriam, e preço errado dito a um paciente é o pior defeito possível
--    num negócio de serviço.

-- ── O agente ───────────────────────────────────────────────────────────────
--
-- Um por clínica. A regra de "um agente por conta" vem do CRM de referência e
-- é mantida: dois agentes ativos na mesma caixa disputariam a mesma mensagem, e
-- o paciente receberia duas respostas diferentes para a mesma pergunta.
CREATE TABLE IF NOT EXISTS public.ai_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Assistente da NÓS',

  -- Desligado ao nascer, sempre. Um agente que começa atendendo é um agente
  -- que atende antes de alguém ler o que ele aprendeu.
  enabled boolean NOT NULL DEFAULT false,

  -- Quais etapas do funil significam "vendeu". É o ÚNICO ajuste obrigatório do
  -- sistema inteiro: sem ele o coletor não sabe o que procurar e o manual
  -- nasce vazio.
  winning_stage_ids jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- ── Humanização ──────────────────────────────────────────────────────────
  -- Estes quatro campos não têm nada a ver com inteligência, e são o que separa
  -- "um robô respondendo" de "alguém digitando do outro lado". Um agente que
  -- responde em 200 ms com oito parágrafos se denuncia por melhor que seja o
  -- texto.
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

-- Um agente por clínica, garantido pelo banco e não pela tela.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_agents_um_por_dono
  ON public.ai_agents (owner_id);

-- ── O manual de vendas ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_sales_playbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- O que o modelo extraiu das conversas. Reescrito INTEIRO a cada rodada:
  -- aprendizado incremental deriva devagar para longe da realidade sem ninguém
  -- perceber, e refazer do zero custa o mesmo.
  learned jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- O que uma pessoa corrigiu. A IA NUNCA escreve aqui.
  overrides jsonb NOT NULL DEFAULT '{}'::jsonb,

  last_learned_at timestamptz,
  -- Por que a última rodada não aprendeu, quando não aprendeu. Some quando dá
  -- certo. Sem isto, "rodou e não mudou nada" vira mistério.
  last_skip_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_playbooks_um_por_dono
  ON public.ai_sales_playbooks (owner_id);

-- ── As fontes ──────────────────────────────────────────────────────────────
--
-- Uma linha por venda já aprendida. Serve a duas coisas: não reprocessar a
-- mesma conversa, e mostrar quantas vendas sustentam o manual — que é a
-- resposta honesta para "dá para confiar nisso?".
CREATE TABLE IF NOT EXISTS public.ai_playbook_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  playbook_id uuid NOT NULL REFERENCES public.ai_sales_playbooks(id) ON DELETE CASCADE,

  -- Id da conversa no CRM. `text` e sem FK, como `pipeline_deals.item_id` e
  -- `contact_tags.crm_contact_id`: a conversa vive no CRM, não aqui.
  conversation_id text NOT NULL,
  contact_name text,

  -- Como a venda foi reconhecida. `pessoa` = alguém moveu o card;
  -- `agente` = o próprio agente moveu.
  --
  -- Esta coluna existe por causa de uma armadilha real: o agente pode ter regra
  -- de mover card sozinho, e o coletor procura exatamente cards que entraram
  -- numa etapa de vitória. Sem separar as duas origens, o agente geraria a
  -- própria matéria-prima de treino — marcaria como ganho o que não foi,
  -- aprenderia com o próprio erro e o reforçaria. Só se aprende de `pessoa`
  -- até haver confiança.
  moved_by text NOT NULL DEFAULT 'pessoa',

  learned_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ai_playbook_sources_origem CHECK (moved_by IN ('pessoa', 'agente'))
);

-- Mesma conversa não vira fonte duas vezes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_sources_conversa_unica
  ON public.ai_playbook_sources (playbook_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_sources_recentes
  ON public.ai_playbook_sources (playbook_id, learned_at DESC);

-- ── O recorte do catálogo ──────────────────────────────────────────────────
--
-- O que o agente pode citar, oferecer e precificar. Sem isto ele inventa preço.
CREATE TABLE IF NOT EXISTS public.ai_agent_procedures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  procedure_id uuid NOT NULL REFERENCES public.clinic_procedures(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_agent_procedures_unico
  ON public.ai_agent_procedures (agent_id, procedure_id);

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Escopo de clínica inteira, não de unidade: o método de vender é o mesmo na
-- NÓS Floripa e na NÓS Porto Alegre, e um manual por unidade dividiria a
-- matéria-prima em duas metades pequenas demais para aprender de qualquer uma.
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

-- As fontes o app só LÊ. Quem escreve é a Edge Function com service role, como
-- no resto do módulo de CRM — a lista de vendas aprendidas não é editável à
-- mão, senão o número de fontes deixa de significar alguma coisa.
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
