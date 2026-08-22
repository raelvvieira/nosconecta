CREATE TABLE IF NOT EXISTS public.clinic_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  url text,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clinic_notifications_owner
  ON public.clinic_notifications (owner_id, read_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clinic_notifications_appointment
  ON public.clinic_notifications (appointment_id)
  WHERE appointment_id IS NOT NULL;

ALTER TABLE public.clinic_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_notifications_owner_read ON public.clinic_notifications;
CREATE POLICY clinic_notifications_owner_read ON public.clinic_notifications
  FOR SELECT TO authenticated USING (owner_id = auth.uid());

DROP POLICY IF EXISTS clinic_notifications_owner_update ON public.clinic_notifications;
CREATE POLICY clinic_notifications_owner_update ON public.clinic_notifications
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

GRANT SELECT, UPDATE ON public.clinic_notifications TO authenticated;
GRANT ALL ON public.clinic_notifications TO service_role;