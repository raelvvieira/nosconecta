-- Separa a NOSSA cópia da mídia do espelho do CRM.
--
-- ── O bug que isto evita ─────────────────────────────────────────────────
--
-- A cópia da mídia gravava o caminho do Storage DENTRO de `attachments`, que
-- é o espelho fiel do que o CRM devolve. Só que `attachments` é reescrita
-- toda vez que as mensagens daquela conversa são lidas de novo — e passaram a
-- ser, a cada abertura da conversa na tela.
--
-- O resultado seria silencioso e feio: o arquivo continua no Storage, o
-- `media_path` continua preenchido (então a mensagem NÃO volta para a fila),
-- e o caminho de cada anexo some. Mídia baixada, paga, e inalcançável.
--
-- A regra que sai disto: coluna que espelha o CRM é só do CRM. O que é nosso
-- mora ao lado.

ALTER TABLE public.wa_messages
  ADD COLUMN IF NOT EXISTS media jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.wa_messages.media IS
  'Nossa cópia dos anexos: [{id, path, erro}]. Casada com attachments pelo id. '
  'Nunca reescrita pela leitura do CRM.';
COMMENT ON COLUMN public.wa_messages.attachments IS
  'Espelho fiel do que o CRM devolve. Reescrita a cada leitura — não guardar nada nosso aqui.';
