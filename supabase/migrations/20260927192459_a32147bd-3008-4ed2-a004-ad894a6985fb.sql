CREATE OR REPLACE FUNCTION public.telefone_br_normalizado(_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
           WHEN length(d) IN (10, 11) THEN '55' || d
           ELSE d
         END
  FROM (
    SELECT regexp_replace(
             regexp_replace(coalesce(_raw, ''), '\D', '', 'g'),
             '^0', ''
           ) AS d
  ) s;
$$;

COMMENT ON FUNCTION public.telefone_br_normalizado(text) IS
  'Telefone brasileiro em dígitos puros com o 55 na frente. Espelha normalizeBrazilianPhone no código — decide pelo comprimento, nunca pelo prefixo.';

CREATE INDEX IF NOT EXISTS idx_patients_telefone_normalizado
  ON public.patients (public.telefone_br_normalizado(phone))
  WHERE phone IS NOT NULL;

CREATE OR REPLACE FUNCTION public.agendamento_por_telefone(
  _owner uuid,
  _variantes text[],
  _hoje date
)
RETURNS TABLE (
  appointment_id uuid,
  patient_id uuid,
  patient_name text,
  data date,
  hora time,
  procedure_name text,
  professional_name text,
  unit_id uuid,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, p.id, p.name, a.date, a.start_time,
         a.procedure_name, a.professional_name, a.unit_id, a.status
  FROM appointments a
  JOIN patients p ON p.id = a.patient_id
  WHERE a.owner_id = _owner
    AND a.date >= _hoje
    AND a.status IN ('pending', 'confirmed')
    AND public.telefone_br_normalizado(p.phone) = ANY (_variantes)
  ORDER BY a.date, a.start_time
  LIMIT 5;
$$;

REVOKE EXECUTE ON FUNCTION public.agendamento_por_telefone(uuid, text[], date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.agendamento_por_telefone(uuid, text[], date) TO authenticated, service_role;

SELECT cron.unschedule('send-appointment-reminders-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-appointment-reminders-daily');