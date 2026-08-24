-- Migration 20260823140000_broadcast_ritmo_e_midia.sql
-- Ritmo em faixa, pausa por bloco e imagem no disparo.
ALTER TABLE public.whatsapp_broadcasts
  ADD COLUMN IF NOT EXISTS interval_min_seconds integer,
  ADD COLUMN IF NOT EXISTS interval_max_seconds integer,
  ADD COLUMN IF NOT EXISTS pause_after integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resume_after_minutes integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS media_path text;

ALTER TABLE public.whatsapp_broadcasts
  DROP CONSTRAINT IF EXISTS whatsapp_broadcasts_faixa_coerente;
ALTER TABLE public.whatsapp_broadcasts
  ADD CONSTRAINT whatsapp_broadcasts_faixa_coerente CHECK (
    (interval_min_seconds IS NULL AND interval_max_seconds IS NULL)
    OR (
      interval_min_seconds BETWEEN 1 AND 300
      AND interval_max_seconds BETWEEN 1 AND 300
      AND interval_max_seconds >= interval_min_seconds
    )
  );

ALTER TABLE public.whatsapp_broadcasts
  DROP CONSTRAINT IF EXISTS whatsapp_broadcasts_pausa_sana;
ALTER TABLE public.whatsapp_broadcasts
  ADD CONSTRAINT whatsapp_broadcasts_pausa_sana CHECK (
    pause_after >= 0 AND pause_after <= 500
    AND resume_after_minutes >= 0 AND resume_after_minutes <= 240
  );

ALTER TABLE public.whatsapp_broadcast_targets
  ADD COLUMN IF NOT EXISTS media_skipped_reason text;

-- Migration 20260823160000_tags.sql
-- Tags de contato: o vocabulário e as atribuições.
CREATE TABLE IF NOT EXISTS public.clinic_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT 'coral',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_tags_nome_unico
  ON public.clinic_tags (owner_id, lower(name));

DROP TRIGGER IF EXISTS set_clinic_tags_updated_at ON public.clinic_tags;
CREATE TRIGGER set_clinic_tags_updated_at
  BEFORE UPDATE ON public.clinic_tags
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.clinic_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clinic_tags_scoped ON public.clinic_tags;
CREATE POLICY clinic_tags_scoped ON public.clinic_tags
  FOR ALL TO authenticated
  USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_tags TO authenticated;
GRANT ALL ON public.clinic_tags TO service_role;

CREATE TABLE IF NOT EXISTS public.contact_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.clinic_tags(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE,
  crm_contact_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_tags_um_destino
    CHECK ((patient_id IS NOT NULL) <> (crm_contact_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_tags_paciente_unico
  ON public.contact_tags (tag_id, patient_id) WHERE patient_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_tags_crm_unico
  ON public.contact_tags (tag_id, crm_contact_id) WHERE crm_contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contact_tags_por_paciente
  ON public.contact_tags (owner_id, patient_id) WHERE patient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contact_tags_por_crm
  ON public.contact_tags (owner_id, crm_contact_id) WHERE crm_contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contact_tags_por_tag
  ON public.contact_tags (owner_id, tag_id);

ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contact_tags_scoped ON public.contact_tags;
CREATE POLICY contact_tags_scoped ON public.contact_tags
  FOR ALL TO authenticated
  USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_tags TO authenticated;
GRANT ALL ON public.contact_tags TO service_role;

-- Migration 20260823180000_broadcast_nome.sql
-- Nome do disparo.
ALTER TABLE public.whatsapp_broadcasts
  ADD COLUMN IF NOT EXISTS name text;

-- Migration 20260824205236_81790859-bd9e-43ff-821d-782c32eda95e.sql
-- Reforço da normalização de telefone dos pacientes.
CREATE OR REPLACE FUNCTION public.normalize_br_phone(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  d text;
BEGIN
  IF raw IS NULL THEN RETURN NULL; END IF;
  d := regexp_replace(raw, '\D', '', 'g');
  IF d = '' THEN RETURN NULL; END IF;
  IF left(d, 1) = '0' THEN d := substr(d, 2); END IF;
  IF length(d) IN (10, 11) THEN d := '55' || d; END IF;
  RETURN d;
END;
$$;

CREATE OR REPLACE FUNCTION public.patients_normalize_phone()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.phone := public.normalize_br_phone(NEW.phone);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS patients_normalize_phone ON public.patients;
CREATE TRIGGER patients_normalize_phone
  BEFORE INSERT OR UPDATE OF phone ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.patients_normalize_phone();

DO $$
DECLARE
  afetados integer;
BEGIN
  UPDATE public.patients p
  SET
    phone = public.normalize_br_phone(p.phone),
    crm_contact_id = CASE
      WHEN regexp_replace(p.phone, '\D', '', 'g')
             IS DISTINCT FROM public.normalize_br_phone(p.phone)
        THEN NULL
      ELSE p.crm_contact_id
    END
  WHERE p.phone IS NOT NULL
    AND public.normalize_br_phone(p.phone) IS DISTINCT FROM p.phone;

  GET DIAGNOSTICS afetados = ROW_COUNT;
  RAISE NOTICE 'Telefones de paciente normalizados: %', afetados;
END;
$$;