-- Operational settings shared by agenda, finance and access control.
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS specialty text,
  ADD COLUMN IF NOT EXISTS registration_number text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#8B5CF6',
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP POLICY IF EXISTS "Public demo manage professionals" ON public.professionals;
CREATE POLICY "Public demo manage professionals" ON public.professionals
  FOR ALL USING (company_id = 'demo') WITH CHECK (company_id = 'demo');

CREATE TABLE IF NOT EXISTS public.clinic_chairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL,
  name text NOT NULL,
  room_name text,
  color text NOT NULL DEFAULT '#FF7A59',
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clinic_procedures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL,
  name text NOT NULL,
  category text,
  duration_minutes integer NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  price numeric(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  cost numeric(12,2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clinic_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL,
  auth_user_id uuid,
  name text NOT NULL,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'reception' CHECK (role IN ('admin','reception','dentist','finance')),
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, email)
);

ALTER TABLE public.clinic_chairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_procedures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public demo manage chairs" ON public.clinic_chairs;
CREATE POLICY "Public demo manage chairs" ON public.clinic_chairs
  FOR ALL USING (company_id = 'demo') WITH CHECK (company_id = 'demo');

DROP POLICY IF EXISTS "Public demo manage procedures" ON public.clinic_procedures;
CREATE POLICY "Public demo manage procedures" ON public.clinic_procedures
  FOR ALL USING (company_id = 'demo') WITH CHECK (company_id = 'demo');

DROP POLICY IF EXISTS "Public demo manage members" ON public.clinic_members;
CREATE POLICY "Public demo manage members" ON public.clinic_members
  FOR ALL USING (company_id = 'demo') WITH CHECK (company_id = 'demo');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_chairs TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_procedures TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_members TO anon, authenticated;

CREATE INDEX IF NOT EXISTS clinic_chairs_company_idx ON public.clinic_chairs(company_id, active);
CREATE INDEX IF NOT EXISTS clinic_procedures_company_idx ON public.clinic_procedures(company_id, active);
CREATE INDEX IF NOT EXISTS clinic_members_company_idx ON public.clinic_members(company_id, active);

DROP TRIGGER IF EXISTS set_updated_at_clinic_chairs ON public.clinic_chairs;
CREATE TRIGGER set_updated_at_clinic_chairs BEFORE UPDATE ON public.clinic_chairs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_clinic_procedures ON public.clinic_procedures;
CREATE TRIGGER set_updated_at_clinic_procedures BEFORE UPDATE ON public.clinic_procedures
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_clinic_members ON public.clinic_members;
CREATE TRIGGER set_updated_at_clinic_members BEFORE UPDATE ON public.clinic_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
