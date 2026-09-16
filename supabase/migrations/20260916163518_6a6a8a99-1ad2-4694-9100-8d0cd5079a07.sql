ALTER TABLE public.wa_contacts
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'wavy'
  CHECK (origem IN ('wavy', 'evolution'));
ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'wavy'
  CHECK (origem IN ('wavy', 'evolution'));
ALTER TABLE public.wa_messages
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'wavy'
  CHECK (origem IN ('wavy', 'evolution'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_contacts_origem_crm
  ON public.wa_contacts (owner_id, origem, crm_contact_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_conversations_origem_crm
  ON public.wa_conversations (owner_id, origem, crm_conversation_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_messages_origem_crm
  ON public.wa_messages (owner_id, origem, crm_message_id);

CREATE OR REPLACE VIEW public.wa_conversas_por_pessoa AS
SELECT
  c.owner_id,
  COALESCE(
    NULLIF(w.phone_e164, ''),
    c.origem || ':' || c.crm_contact_id,
    'conversa:' || c.crm_conversation_id
  ) AS pessoa,
  w.phone_e164,
  c.origem,
  c.crm_conversation_id,
  c.crm_contact_id,
  w.name AS contact_name,
  w.avatar_url,
  w.patient_id,
  c.status,
  c.unread_count,
  c.last_message_at,
  c.last_message_preview
FROM public.wa_conversations c
LEFT JOIN public.wa_contacts w
  ON w.owner_id = c.owner_id
 AND w.origem = c.origem
 AND w.crm_contact_id = c.crm_contact_id;

GRANT SELECT ON public.wa_conversas_por_pessoa TO authenticated;
GRANT SELECT ON public.wa_conversas_por_pessoa TO service_role;