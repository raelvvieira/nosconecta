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