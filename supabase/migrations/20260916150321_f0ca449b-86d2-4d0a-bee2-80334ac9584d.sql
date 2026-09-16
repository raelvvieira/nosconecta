ALTER TABLE public.wa_messages
  ADD COLUMN IF NOT EXISTS tem_anexo boolean
  GENERATED ALWAYS AS (attachments IS NOT NULL AND attachments <> '[]'::jsonb) STORED;

DROP INDEX IF EXISTS public.idx_wa_messages_midia_pendente;
CREATE INDEX IF NOT EXISTS idx_wa_messages_midia_pendente
  ON public.wa_messages (owner_id, sent_at DESC)
  WHERE media_path IS NULL AND tem_anexo;