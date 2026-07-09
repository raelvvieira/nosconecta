-- Adds TUSS reference fields to clinic_procedures, to support importing
-- the standard Brazilian dental procedure/pricing table (Terminologia
-- Unificada da Saúde Suplementar) used for insurance billing.
ALTER TABLE public.clinic_procedures
  ADD COLUMN IF NOT EXISTS tuss_code text,
  ADD COLUMN IF NOT EXISTS tuss_name text;

CREATE INDEX IF NOT EXISTS idx_clinic_procedures_tuss_code
  ON public.clinic_procedures (tuss_code)
  WHERE tuss_code IS NOT NULL;
