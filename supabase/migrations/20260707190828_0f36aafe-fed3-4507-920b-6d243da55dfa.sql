ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS neighborhood text,
  ADD COLUMN IF NOT EXISTS zip_code text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS address_complement text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS legacy_patient_id text,
  ADD COLUMN IF NOT EXISTS guardian_name text,
  ADD COLUMN IF NOT EXISTS guardian_cpf text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_legacy_patient_id
  ON public.patients (legacy_patient_id)
  WHERE legacy_patient_id IS NOT NULL;