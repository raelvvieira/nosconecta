-- Tracks email/SMS sending status per appointment for the Brevo integration:
-- one row per (appointment, kind, channel) — kind is
-- 'confirmation' | 'reminder_day_before' | 'reminder_day_of',
-- channel is 'email' | 'sms'. Status starts 'pending' and becomes
-- 'sent' | 'failed' | 'skipped' once the Edge Function processes it.

CREATE TABLE public.appointment_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (appointment_id, kind, channel)
);

ALTER TABLE public.appointment_notifications ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_notifications TO authenticated;
GRANT ALL ON public.appointment_notifications TO service_role;
DROP POLICY IF EXISTS "Owner manage appointment notifications" ON public.appointment_notifications;
CREATE POLICY "Owner manage appointment notifications" ON public.appointment_notifications
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_appt_notif_appointment
  ON public.appointment_notifications (appointment_id);
CREATE INDEX IF NOT EXISTS idx_appt_notif_owner
  ON public.appointment_notifications (owner_id);
