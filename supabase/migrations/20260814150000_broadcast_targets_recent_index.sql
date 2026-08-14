-- Índice para a consulta de "quem recebeu disparo recente" (getRecentRecipients,
-- broadcast.functions.ts) — filtra whatsapp_broadcast_targets por
-- owner_id + status='sent' + sent_at >= janela.
CREATE INDEX IF NOT EXISTS idx_broadcast_targets_owner_sent
  ON public.whatsapp_broadcast_targets (owner_id, status, sent_at);
