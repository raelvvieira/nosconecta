CREATE TABLE IF NOT EXISTS public.appointment_procedures (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         uuid NOT NULL DEFAULT auth.uid(),
  unit_id          uuid NOT NULL REFERENCES public.clinic_units(id) ON DELETE CASCADE,
  appointment_id   uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  procedure_id     uuid REFERENCES public.clinic_procedures(id) ON DELETE SET NULL,
  procedure_name   text NOT NULL,
  price            numeric(12,2) NOT NULL DEFAULT 0,
  duration_minutes integer NOT NULL DEFAULT 0 CHECK (duration_minutes >= 0),
  position         integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointment_procedures_agendamento
  ON public.appointment_procedures (appointment_id, position);

CREATE OR REPLACE FUNCTION public.appointment_recalc_procedures(p_appointment_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_nome text;
  v_valor numeric(12,2);
BEGIN
  SELECT
    NULLIF(string_agg(NULLIF(btrim(ap.procedure_name), ''), ' + ' ORDER BY ap.position, ap.created_at), ''),
    COALESCE(SUM(ap.price), 0)
  INTO v_nome, v_valor
  FROM public.appointment_procedures ap
  WHERE ap.appointment_id = p_appointment_id;

  UPDATE public.appointments a
     SET procedure_name = COALESCE(v_nome, 'Consulta'),
         expected_revenue = COALESCE(v_valor, 0),
         procedure_id = (
           SELECT ap.procedure_id FROM public.appointment_procedures ap
            WHERE ap.appointment_id = p_appointment_id
            ORDER BY ap.position, ap.created_at LIMIT 1
         ),
         updated_at = now()
   WHERE a.id = p_appointment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.appointment_procedures_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.appointment_id IS NOT NULL THEN
    PERFORM public.appointment_recalc_procedures(OLD.appointment_id);
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.appointment_id IS DISTINCT FROM
     (CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.appointment_id END) THEN
    PERFORM public.appointment_recalc_procedures(NEW.appointment_id);
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.appointment_recalc_procedures(NEW.appointment_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS appointment_procedures_sync ON public.appointment_procedures;
CREATE TRIGGER appointment_procedures_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.appointment_procedures
  FOR EACH ROW EXECUTE FUNCTION public.appointment_procedures_sync();

ALTER TABLE public.appointment_procedures ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
              WHERE schemaname='public' AND tablename='appointment_procedures' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.appointment_procedures;', pol.policyname);
  END LOOP;
  EXECUTE 'CREATE POLICY appointment_procedures_scoped ON public.appointment_procedures '
       || 'FOR ALL TO authenticated '
       || 'USING (public.can_access_row(owner_id, unit_id)) '
       || 'WITH CHECK (public.can_access_row(owner_id, unit_id));';
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_procedures TO authenticated;
GRANT ALL ON public.appointment_procedures TO service_role;

REVOKE EXECUTE ON FUNCTION public.appointment_recalc_procedures(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.appointment_recalc_procedures(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.appointment_procedures_sync() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.appointment_procedures_sync() FROM authenticated;

DO $$
DECLARE afetados integer;
BEGIN
  INSERT INTO public.appointment_procedures
    (owner_id, unit_id, appointment_id, procedure_id, procedure_name, price, duration_minutes, position)
  SELECT
    a.owner_id, a.unit_id, a.id, a.procedure_id,
    COALESCE(NULLIF(btrim(a.procedure_name), ''), 'Consulta'),
    COALESCE(a.expected_revenue, 0),
    GREATEST(0, EXTRACT(EPOCH FROM (a.end_time - a.start_time))::int / 60),
    0
  FROM public.appointments a
  WHERE NOT EXISTS (
    SELECT 1 FROM public.appointment_procedures ap WHERE ap.appointment_id = a.id
  );

  GET DIAGNOSTICS afetados = ROW_COUNT;
  RAISE NOTICE 'Agendamentos com procedimento migrado para a lista: %', afetados;
END $$;