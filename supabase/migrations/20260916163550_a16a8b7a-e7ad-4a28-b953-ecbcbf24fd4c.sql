CREATE OR REPLACE FUNCTION public.appointment_recalc_procedures(
  p_appointment_id uuid,
  p_owner uuid
)
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
  WHERE ap.appointment_id = p_appointment_id
    AND ap.owner_id = p_owner;

  UPDATE public.appointments a
     SET procedure_name = COALESCE(v_nome, 'Consulta'),
         expected_revenue = COALESCE(v_valor, 0),
         procedure_id = (
           SELECT ap.procedure_id FROM public.appointment_procedures ap
            WHERE ap.appointment_id = p_appointment_id
              AND ap.owner_id = p_owner
            ORDER BY ap.position, ap.created_at LIMIT 1
         ),
         updated_at = now()
   WHERE a.id = p_appointment_id
     AND a.owner_id = p_owner;
END;
$$;

CREATE OR REPLACE FUNCTION public.appointment_procedures_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.appointment_id IS NOT NULL THEN
    PERFORM public.appointment_recalc_procedures(OLD.appointment_id, OLD.owner_id);
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.appointment_id IS DISTINCT FROM
     (CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.appointment_id END) THEN
    PERFORM public.appointment_recalc_procedures(NEW.appointment_id, NEW.owner_id);
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.appointment_recalc_procedures(NEW.appointment_id, NEW.owner_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP FUNCTION IF EXISTS public.appointment_recalc_procedures(uuid);

REVOKE EXECUTE ON FUNCTION public.appointment_recalc_procedures(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.appointment_recalc_procedures(uuid, uuid) FROM authenticated;