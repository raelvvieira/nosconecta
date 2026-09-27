-- A IA passa a ser a da OpenAI, e o modelo é escolhido pela clínica.
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS model text;

COMMENT ON COLUMN public.ai_agents.model IS
  'O modelo da OpenAI que atende. Escolhido na tela, a partir da lista que a própria chave da clínica pode usar. Vazio = nada roda, e o erro diz isso.';

UPDATE public.ai_agents
   SET api_key = NULL, updated_at = now()
 WHERE api_key LIKE 'sk-ant-%';