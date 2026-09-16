-- Uma marca booleana para "esta mensagem tem anexo".
--
-- A fila da mídia precisa perguntar isso, e perguntar por
-- `attachments <> '[]'` através do PostgREST significa mandar a comparação de
-- um jsonb com um literal de texto pela querystring. Funciona em SQL; pela
-- API é o tipo de detalhe que muda de comportamento numa atualização da
-- biblioteca e leva junto a cópia das mídias — calada, porque uma fila vazia
-- parece uma fila que terminou.
--
-- Coluna gerada: não há o que manter em dia, e não há como divergir do
-- conteúdo de `attachments`.
--
-- Migration separada da que criou as tabelas porque aquela pode já ter sido
-- aplicada. `ADD COLUMN IF NOT EXISTS` vale nos dois casos.

ALTER TABLE public.wa_messages
  ADD COLUMN IF NOT EXISTS tem_anexo boolean
  GENERATED ALWAYS AS (attachments IS NOT NULL AND attachments <> '[]'::jsonb) STORED;

-- Substitui o índice parcial anterior, que dependia da mesma comparação.
DROP INDEX IF EXISTS public.idx_wa_messages_midia_pendente;
CREATE INDEX IF NOT EXISTS idx_wa_messages_midia_pendente
  ON public.wa_messages (owner_id, sent_at DESC)
  WHERE media_path IS NULL AND tem_anexo;
