-- Extend patients table with all fields used by the app
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS allergy_notes text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS responsible_professional_id uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP POLICY IF EXISTS "patients authenticated" ON public.patients;
DROP POLICY IF EXISTS "patients_owner" ON public.patients;
CREATE POLICY "patients_owner" ON public.patients FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- Extend professionals
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS specialty text,
  ADD COLUMN IF NOT EXISTS registration_number text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#8B5CF6',
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP POLICY IF EXISTS "professionals authenticated" ON public.professionals;
DROP POLICY IF EXISTS "professionals_owner" ON public.professionals;
CREATE POLICY "professionals_owner" ON public.professionals FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- Make company_id nullable for legacy columns we no longer use as filter
ALTER TABLE public.patients ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE public.professionals ALTER COLUMN company_id DROP NOT NULL;

-- Clinic chairs
CREATE TABLE IF NOT EXISTS public.clinic_chairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  room_name text,
  color text NOT NULL DEFAULT '#FF6B57',
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_chairs TO authenticated;
GRANT ALL ON public.clinic_chairs TO service_role;
ALTER TABLE public.clinic_chairs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chairs_owner" ON public.clinic_chairs FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER trg_clinic_chairs_updated BEFORE UPDATE ON public.clinic_chairs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Clinic procedures
CREATE TABLE IF NOT EXISTS public.clinic_procedures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  duration_minutes integer NOT NULL DEFAULT 60,
  price numeric NOT NULL DEFAULT 0,
  cost numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_procedures TO authenticated;
GRANT ALL ON public.clinic_procedures TO service_role;
ALTER TABLE public.clinic_procedures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "procedures_owner" ON public.clinic_procedures FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER trg_clinic_procedures_updated BEFORE UPDATE ON public.clinic_procedures
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Clinic members (team roster — does not create auth users)
CREATE TABLE IF NOT EXISTS public.clinic_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'reception',
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_members TO authenticated;
GRANT ALL ON public.clinic_members TO service_role;
ALTER TABLE public.clinic_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_owner" ON public.clinic_members FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER trg_clinic_members_updated BEFORE UPDATE ON public.clinic_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
