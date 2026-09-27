-- A IA passa a ser a da OpenAI, e o modelo é escolhido pela clínica.
--
-- ── Por que o modelo virou coluna ───────────────────────────────────────
--
-- Antes o modelo estava escrito no código, nos três pontos que chamam a IA.
-- Com a Anthropic isso funcionava porque era um nome só, nosso, e ele mudava
-- num commit.
--
-- Com a chave da OpenAI é diferente: quais modelos existem depende da CONTA —
-- do plano, do que a organização liberou, do que a OpenAI lançou depois deste
-- commit. Um nome fixo aqui erraria calado: a chamada falha com "model not
-- found" no meio de um atendimento, e quem espera é o paciente.
--
-- Então a tela busca a lista na conta da própria clínica e grava a escolha
-- aqui. Sem padrão de propósito — o código recusa com uma frase legível quando
-- está vazio, na tela de configuração, onde alguém pode agir.
--
-- NULL e não `''`: "ninguém escolheu ainda" é diferente de "escolheu vazio", e
-- o código checa `trim()` de qualquer forma.
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS model text;

COMMENT ON COLUMN public.ai_agents.model IS
  'O modelo da OpenAI que atende. Escolhido na tela, a partir da lista que a própria chave da clínica pode usar. Vazio = nada roda, e o erro diz isso.';

-- A chave que estava gravada era da Anthropic e não serve mais na OpenAI. Se
-- ainda for uma `sk-ant-`, apagar é o caminho honesto: mantê-la faria toda
-- chamada falhar com "chave inválida", e o erro apontaria para o lugar errado.
--
-- Chave da OpenAI (`sk-proj-` ou `sk-` comum) fica onde está.
UPDATE public.ai_agents
   SET api_key = NULL, updated_at = now()
 WHERE api_key LIKE 'sk-ant-%';
