CREATE TABLE IF NOT EXISTS public.clinic_business_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.clinic_units(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  modo text NOT NULL DEFAULT 'fechado'
    CHECK (modo IN ('aberto', 'fechado', 'sob_consulta')),
  opens_at time,
  closes_at time,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinic_business_hours_aberto_tem_horario CHECK (
    modo <> 'aberto' OR (opens_at IS NOT NULL AND closes_at IS NOT NULL)
  ),
  CONSTRAINT clinic_business_hours_fecha_depois_de_abrir CHECK (
    opens_at IS NULL OR closes_at IS NULL OR closes_at > opens_at
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS clinic_business_hours_unidade_dia
  ON public.clinic_business_hours (owner_id, unit_id, weekday);

ALTER TABLE public.clinic_business_hours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_business_hours_acesso ON public.clinic_business_hours;
CREATE POLICY clinic_business_hours_acesso ON public.clinic_business_hours
  FOR ALL USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_business_hours TO authenticated;
GRANT ALL ON public.clinic_business_hours TO service_role;

COMMENT ON TABLE public.clinic_business_hours IS
  'Jornada declarada por unidade e dia da semana. É o lado de fora do cálculo de vaga livre; os buracos de dentro (almoço, compromisso) continuam em blocked_times.';
COMMENT ON COLUMN public.clinic_business_hours.modo IS
  'aberto = a Luna pode oferecer horário aqui. fechado = não atende. sob_consulta = não ofereça, mas não negue: encaminhe para confirmar com a Dra.';

INSERT INTO public.clinic_business_hours (owner_id, unit_id, weekday, modo, opens_at, closes_at)
SELECT u.owner_id, u.id, d.weekday, d.modo, d.abre, d.fecha
FROM public.clinic_units u
CROSS JOIN (
  VALUES
    (0, 'sob_consulta', NULL::time, NULL::time),
    (1, 'aberto',       '08:00',    '19:00'),
    (2, 'aberto',       '08:00',    '19:00'),
    (3, 'aberto',       '08:00',    '19:00'),
    (4, 'aberto',       '08:00',    '19:00'),
    (5, 'aberto',       '08:00',    '19:00'),
    (6, 'aberto',       '08:00',    '14:00')
) AS d(weekday, modo, abre, fecha)
ON CONFLICT (owner_id, unit_id, weekday) DO NOTHING;