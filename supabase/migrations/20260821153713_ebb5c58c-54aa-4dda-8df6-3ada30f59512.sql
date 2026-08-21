-- patient_clinical_record.sql
CREATE TABLE public.patient_anamnesis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  professional_name text,
  template jsonb NOT NULL DEFAULT '[]'::jsonb,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  filled_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_patient_anamnesis_patient
  ON public.patient_anamnesis (patient_id, filled_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_anamnesis TO authenticated;
GRANT ALL ON public.patient_anamnesis TO service_role;

ALTER TABLE public.patient_anamnesis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS patient_anamnesis_scoped ON public.patient_anamnesis;
CREATE POLICY patient_anamnesis_scoped ON public.patient_anamnesis FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = patient_id AND public.can_access_row(p.owner_id, p.unit_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = patient_id AND public.can_access_row(p.owner_id, p.unit_id)
  ));

CREATE TABLE public.patient_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  professional_name text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_patient_notes_patient
  ON public.patient_notes (patient_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_notes TO authenticated;
GRANT ALL ON public.patient_notes TO service_role;

ALTER TABLE public.patient_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS patient_notes_scoped ON public.patient_notes;
CREATE POLICY patient_notes_scoped ON public.patient_notes FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = patient_id AND public.can_access_row(p.owner_id, p.unit_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = patient_id AND public.can_access_row(p.owner_id, p.unit_id)
  ));

-- patient_files.sql
CREATE TABLE public.patient_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('image', 'document')),
  title text NOT NULL,
  storage_path text NOT NULL,
  mime text,
  size_bytes bigint,
  professional_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_patient_files_patient
  ON public.patient_files (patient_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_files TO authenticated;
GRANT ALL ON public.patient_files TO service_role;

ALTER TABLE public.patient_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS patient_files_scoped ON public.patient_files;
CREATE POLICY patient_files_scoped ON public.patient_files FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = patient_id AND public.can_access_row(p.owner_id, p.unit_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = patient_id AND public.can_access_row(p.owner_id, p.unit_id)
  ));

-- treatment_plans.sql
CREATE TABLE public.treatment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  professional_name text,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'rejected')),
  notes text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_treatment_plans_patient
  ON public.treatment_plans (patient_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_plans TO authenticated;
GRANT ALL ON public.treatment_plans TO service_role;

ALTER TABLE public.treatment_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS treatment_plans_scoped ON public.treatment_plans;
CREATE POLICY treatment_plans_scoped ON public.treatment_plans FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = patient_id AND public.can_access_row(p.owner_id, p.unit_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = patient_id AND public.can_access_row(p.owner_id, p.unit_id)
  ));

CREATE TABLE public.treatment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.treatment_plans(id) ON DELETE CASCADE,
  procedure_id uuid REFERENCES public.clinic_procedures(id) ON DELETE SET NULL,
  procedure_name text NOT NULL,
  tooth text,
  amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  done_at timestamptz,
  transaction_id uuid REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_treatment_items_plan
  ON public.treatment_items (plan_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_items TO authenticated;
GRANT ALL ON public.treatment_items TO service_role;

ALTER TABLE public.treatment_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS treatment_items_scoped ON public.treatment_items;
CREATE POLICY treatment_items_scoped ON public.treatment_items FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.treatment_plans tp
    JOIN public.patients p ON p.id = tp.patient_id
    WHERE tp.id = plan_id AND public.can_access_row(p.owner_id, p.unit_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.treatment_plans tp
    JOIN public.patients p ON p.id = tp.patient_id
    WHERE tp.id = plan_id AND public.can_access_row(p.owner_id, p.unit_id)
  ));