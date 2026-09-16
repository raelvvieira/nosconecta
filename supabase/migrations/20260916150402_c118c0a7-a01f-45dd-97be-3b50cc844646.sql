ALTER TABLE public.wa_messages
  ADD COLUMN IF NOT EXISTS media jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.wa_messages.media IS
  'Nossa cópia dos anexos: [{id, path, erro}]. Casada com attachments pelo id. '
  'Nunca reescrita pela leitura do CRM.';
COMMENT ON COLUMN public.wa_messages.attachments IS
  'Espelho fiel do que o CRM devolve. Reescrita a cada leitura — não guardar nada nosso aqui.';