-- Agenda module: real persistence for appointments, blocked times and the
-- waiting list. Previously served entirely from mock data
-- (src/components/agenda/mock-data.ts) — this migration is the backing store
-- that the "/agenda" route now reads/writes for real.

CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  patient_name text NOT NULL,
  procedure_id uuid REFERENCES public.clinic_procedures(id) ON DELETE SET NULL,
  procedure_name text NOT NULL,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  professional_name text NOT NULL,
  room_id uuid REFERENCES public.clinic_chairs(id) ON DELETE SET NULL,
  room_name text,
  date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  type text NOT NULL DEFAULT 'consultation',
  expected_revenue numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  generate_financial boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
DROP POLICY IF EXISTS "Owner manage appointments" ON public.appointments;
CREATE POLICY "Owner manage appointments" ON public.appointments
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_appointments_owner_date
  ON public.appointments (owner_id, date);
CREATE INDEX IF NOT EXISTS idx_appointments_owner_professional_date
  ON public.appointments (owner_id, professional_id, date);
CREATE INDEX IF NOT EXISTS idx_appointments_patient
  ON public.appointments (patient_id) WHERE patient_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_appointments_updated_at ON public.appointments;
CREATE TRIGGER set_appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.blocked_times (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  room_id uuid REFERENCES public.clinic_chairs(id) ON DELETE SET NULL,
  date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.blocked_times ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocked_times TO authenticated;
GRANT ALL ON public.blocked_times TO service_role;
DROP POLICY IF EXISTS "Owner manage blocked times" ON public.blocked_times;
CREATE POLICY "Owner manage blocked times" ON public.blocked_times
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_blocked_times_owner_date
  ON public.blocked_times (owner_id, date);

CREATE TABLE public.waiting_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  patient_name text NOT NULL,
  procedure_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.waiting_list ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.waiting_list TO authenticated;
GRANT ALL ON public.waiting_list TO service_role;
DROP POLICY IF EXISTS "Owner manage waiting list" ON public.waiting_list;
CREATE POLICY "Owner manage waiting list" ON public.waiting_list
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_waiting_list_owner
  ON public.waiting_list (owner_id, created_at);
