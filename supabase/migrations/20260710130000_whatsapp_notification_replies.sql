-- Log de respostas inbound (hoje só WhatsApp, via Brevo Conversations webhook)
-- casadas com um paciente/agendamento, pra dar visibilidade na tela de
-- Notificações e permitir auditoria de como cada confirmação automática
-- foi decidida.
CREATE TABLE IF NOT EXISTS public.appointment_notification_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'whatsapp',
  from_phone text NOT NULL,
  message_text text NOT NULL,
  action text NOT NULL, -- 'confirmed' | 'unmatched' | 'ambiguous' | 'no_appointment_found'
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointment_notification_replies_owner
  ON public.appointment_notification_replies (owner_id, created_at DESC);

ALTER TABLE public.appointment_notification_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY appointment_notification_replies_owner
  ON public.appointment_notification_replies
  FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
