-- Patient management module: operational profile, treatment progress and care timeline.
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS allergy_notes text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS responsible_professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_patients_company_name
  ON public.patients (company_id, name);
CREATE INDEX IF NOT EXISTS idx_patients_company_status
  ON public.patients (company_id, status);

DROP TRIGGER IF EXISTS set_patients_updated_at ON public.patients;
CREATE TRIGGER set_patients_updated_at
  BEFORE UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Demo environment: allow the current unauthenticated app to manage patients.
GRANT INSERT, UPDATE, DELETE ON public.patients TO anon, authenticated;
DROP POLICY IF EXISTS "Public write patients" ON public.patients;
CREATE POLICY "Public write patients" ON public.patients
  FOR ALL TO public USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.patient_treatments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  completed_sessions integer NOT NULL DEFAULT 0,
  total_sessions integer NOT NULL DEFAULT 1,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  started_at date NOT NULL DEFAULT CURRENT_DATE,
  next_session_at date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.patient_treatments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_treatments TO anon, authenticated;
GRANT ALL ON public.patient_treatments TO service_role;
DROP POLICY IF EXISTS "Public manage patient treatments" ON public.patient_treatments;
CREATE POLICY "Public manage patient treatments" ON public.patient_treatments
  FOR ALL TO public USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_patient_treatments_patient
  ON public.patient_treatments (company_id, patient_id, status);
DROP TRIGGER IF EXISTS set_patient_treatments_updated_at ON public.patient_treatments;
CREATE TRIGGER set_patient_treatments_updated_at
  BEFORE UPDATE ON public.patient_treatments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.patient_care_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'completed',
  event_at timestamptz NOT NULL DEFAULT now(),
  source_type text,
  source_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.patient_care_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_care_events TO anon, authenticated;
GRANT ALL ON public.patient_care_events TO service_role;
DROP POLICY IF EXISTS "Public manage patient care events" ON public.patient_care_events;
CREATE POLICY "Public manage patient care events" ON public.patient_care_events
  FOR ALL TO public USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_patient_care_events_patient_date
  ON public.patient_care_events (company_id, patient_id, event_at DESC);
