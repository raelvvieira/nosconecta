-- Duas coisas que a tabela de preços do agente não sabia dizer.
--
-- ── "A partir de" ────────────────────────────────────────────────────────
--
-- A clínica anuncia o NÓS Prevent (botox em 3 regiões) como "a partir de R$ 800
-- ou 12x de R$ 85" — e essa frase saiu 200 vezes no WhatsApp em agosto. O valor
-- final depende da avaliação.
--
-- Sem esta coluna, liberar o item para a IA faria a instrução dizer
-- "- Toxina botulínica: R$ 800,00", e a IA cotaria oitocentos reais FECHADOS
-- para um procedimento que começa em oitocentos. Cotar um teto como se fosse o
-- preço é promessa, e promessa de preço não tem volta na cadeira.
--
-- É também o que o manual da Luna pede no item de valores variáveis: quando o
-- valor depende de marca, quantidade ou extensão do caso, explique que varia em
-- vez de inventar uma média.
--
-- ── O parcelamento ───────────────────────────────────────────────────────
--
-- O manual manda informar o parcelamento JUNTO do valor, para o paciente não
-- descobrir depois que existia condição melhor. A clínica diz "todos os
-- tratamentos podem ser parcelados em até 10x no cartão" — é regra da clínica,
-- não de cada procedimento, então mora no agente e não em 278 linhas de
-- catálogo que precisariam ser mantidas iguais.
--
-- Texto livre de propósito: "em até 10x no cartão" hoje pode virar "em até 12x,
-- ou 5% de desconto no pix" amanhã, e isso não deve exigir migration.

ALTER TABLE public.clinic_procedures
  ADD COLUMN IF NOT EXISTS price_from boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clinic_procedures.price_from IS
  'O preço é um piso ("a partir de"), não um valor fechado. A IA precisa dizer "a partir de" — cotar o piso como preço final é promessa que a clínica não fez.';

ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS parcelamento text;

COMMENT ON COLUMN public.ai_agents.parcelamento IS
  'Condição de parcelamento que a IA pode informar junto do valor, em texto livre. Vazio = a IA não fala de parcelamento.';
