-- (O número desta migration ficou depois da 20260831133644 de propósito: o
-- Lovable reaplicou as tabelas do agente naquele arquivo, e uma migration com
-- data anterior à última já aplicada corre o risco de ser tratada como fora de
-- ordem e nunca rodar. As colunas abaixo não existem no banco sem ela.)

-- O agente passa a aprender também com as conversas marcadas como GANHO.
--
-- ── Por que isto não é um detalhe ──────────────────────────────────────────
--
-- O coletor lia só movimentação de etapa do funil. Só que nesta clínica o
-- desfecho é marcado no CHAT, direto na conversa, e muitas vezes sem card
-- nenhum no funil — foi assim que o "marcar ganho sem card" foi construído.
-- `pipeline_deals.item_id` guarda `conv:<id da conversa>` nesses casos.
--
-- Consequência: a maior parte das vitórias da clínica estava INVISÍVEL para o
-- aprendizado. O manual aprendia de uma amostra enviesada — só de quem por
-- acaso teve card movido — e ninguém teria como perceber, porque um manual
-- construído de poucas conversas parece igual a um construído de muitas.
--
-- As duas fontes convivem: quem usa o funil continua sendo lido por etapa.

ALTER TABLE public.ai_agents
  -- Ligado por padrão, ao contrário do resto do módulo. Aqui o padrão seguro é
  -- ligado: é a fonte MAIS confiável de "fechou" nesta clínica, e desligá-la
  -- por precaução deixaria o manual aprendendo de menos.
  ADD COLUMN IF NOT EXISTS learn_from_won boolean NOT NULL DEFAULT true;

-- De onde cada fonte veio. `ganho` = marcado como Ganho na conversa ou no card;
-- `etapa` = o card entrou numa etapa de vitória.
--
-- Serve para a tela dizer de onde o manual aprendeu, e para responder a
-- pergunta que aparece quando o número surpreende: "aprendeu com o quê?".
ALTER TABLE public.ai_playbook_sources
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'etapa';

ALTER TABLE public.ai_playbook_sources
  DROP CONSTRAINT IF EXISTS ai_playbook_sources_origem_da_fonte;
ALTER TABLE public.ai_playbook_sources
  ADD CONSTRAINT ai_playbook_sources_origem_da_fonte
    CHECK (source IN ('ganho', 'etapa'));

-- A consulta do coletor: os ganhos, do mais recente para o mais antigo.
CREATE INDEX IF NOT EXISTS idx_pipeline_deals_ganhos
  ON public.pipeline_deals (owner_id, status, updated_at DESC);
