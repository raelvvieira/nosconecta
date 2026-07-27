-- "Atendimentos": inbox de WhatsApp espelhado via Evolution API (self-hosted,
-- WhatsApp Web/Baileys — separado da integração oficial Brevo/Meta). Uma
-- instância por clínica (owner_id), conversas e mensagens espelhadas via
-- webhook da Evolution API.

CREATE TABLE IF NOT EXISTS public.whatsapp_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_name text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'disconnected', -- disconnected | connecting | open | error
  qr_code text,
  qr_expires_at timestamptz,
  phone_number text,
  last_connected_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  remote_jid text NOT NULL,
  phone_digits text NOT NULL,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  contact_name text,
  last_message_preview text,
  last_message_at timestamptz,
  unread_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, remote_jid)
);

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  evolution_message_id text,
  from_me boolean NOT NULL,
  body text,
  message_type text NOT NULL DEFAULT 'text',
  status text NOT NULL DEFAULT 'received', -- sending | sent | received | failed
  sent_by_user_id uuid REFERENCES auth.users(id),
  "timestamp" timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, evolution_message_id)
);

CREATE INDEX IF NOT EXISTS idx_wa_conversations_owner_lastmsg
  ON public.whatsapp_conversations (owner_id, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_wa_conversations_phone
  ON public.whatsapp_conversations (owner_id, phone_digits);
CREATE INDEX IF NOT EXISTS idx_wa_messages_conversation
  ON public.whatsapp_messages (conversation_id, "timestamp");
CREATE INDEX IF NOT EXISTS idx_wa_messages_owner
  ON public.whatsapp_messages (owner_id);

ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_instances_owner ON public.whatsapp_instances;
CREATE POLICY whatsapp_instances_owner ON public.whatsapp_instances
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS whatsapp_conversations_owner ON public.whatsapp_conversations;
CREATE POLICY whatsapp_conversations_owner ON public.whatsapp_conversations
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS whatsapp_messages_owner ON public.whatsapp_messages;
CREATE POLICY whatsapp_messages_owner ON public.whatsapp_messages
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
