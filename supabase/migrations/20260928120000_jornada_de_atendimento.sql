-- A jornada de atendimento da clínica, por unidade e dia da semana.
--
-- ── Por que isto não existia, e por que faz falta agora ──────────────────
--
-- A agenda sempre foi desenhada para uma pessoa OLHAR: `HOURS = [7..19]` em
-- `appointment-utils.ts` desenha a grade e limita o arraste, e nada mais. Nunca
-- houve regra de "aberto" ou "fechado" — quem marcava sabia, de cabeça, que
-- domingo não tem atendimento.
--
-- A Luna não sabe. Para ela oferecer "terça às 14h ou quinta às 10h" (a regra
-- dos dois horários do manual dela) é preciso responder antes: em que horas
-- desta unidade existe atendimento? Sem isso, o cálculo de vaga livre acha vaga
-- em todo lugar que não tem consulta marcada — inclusive domingo às 7h.
--
-- ── Por que não dá para inferir da agenda ────────────────────────────────
--
-- Medido em 27/09: há consulta nos SETE dias da semana. Segunda até 21:00,
-- domingo de 14:00 às 21:00, sexta só até 11:00. Parte disso é importação
-- antiga e parte é atendimento excepcional, e daqui de dentro não há como
-- separar um do outro. Inferir a jornada desses dados ensinaria a Luna a
-- oferecer domingo de manhã.
--
-- Então a jornada é DECLARADA. Os valores abaixo são os que a clínica informou
-- em 28/09.
--
-- ── Por que TRÊS modos, e não um "ativo" ─────────────────────────────────
--
-- Porque "fechado" e "sob consulta" fazem a Luna dizer coisas diferentes, e uma
-- delas perde paciente.
--
-- Domingo na NÓS não é fechado: é "sob consulta com a Dra. Mariane para
-- verificar disponibilidade". Com um booleano de ativo, domingo viraria fechado,
-- e a Luna responderia "não atendemos domingo" — que é falso e encerra a
-- conversa. Com o modo `sob_consulta` ela não OFERECE domingo (não há vaga
-- calculável) mas também não nega: encaminha para uma pessoa confirmar.
--
-- Um `modo` em vez de dois booleanos porque dois booleanos permitem a
-- combinação sem sentido (aberto e sob consulta ao mesmo tempo), e alguém
-- acabaria gravando ela.
--
-- ── Por que a pausa do almoço NÃO entra aqui ─────────────────────────────
--
-- Porque ela já existe: `blocked_times` com `reason = 'Almoço'` é o que a tela
-- de compromisso grava hoje (ver `MOTIVOS` em `CommitmentDrawer.tsx`). Uma
-- coluna de almoço aqui seria a mesma verdade em dois lugares, e os dois
-- divergiriam no primeiro dia em que alguém mudasse o horário num só.
--
-- O cálculo de vaga lê as duas coisas: a jornada diz o lado de fora, os
-- bloqueios dizem os buracos de dentro.

CREATE TABLE IF NOT EXISTS public.clinic_business_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.clinic_units(id) ON DELETE CASCADE,
  -- 0 = domingo, 6 = sábado. Mesma numeração de `Date.getDay()` e de
  -- `schedule_window.days` nas automações — três numerações diferentes para dia
  -- da semana no mesmo sistema seria pedir para errar.
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  modo text NOT NULL DEFAULT 'fechado'
    CHECK (modo IN ('aberto', 'fechado', 'sob_consulta')),
  -- Nulos quando o dia não é `aberto`: hora de abrir num dia fechado é um
  -- número que alguém, um dia, leria como verdade.
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

-- Um dia da semana por unidade. Duas linhas para a mesma terça seriam duas
-- jornadas, e o cálculo escolheria uma delas sem critério.
CREATE UNIQUE INDEX IF NOT EXISTS clinic_business_hours_unidade_dia
  ON public.clinic_business_hours (owner_id, unit_id, weekday);

ALTER TABLE public.clinic_business_hours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_business_hours_acesso ON public.clinic_business_hours;
CREATE POLICY clinic_business_hours_acesso ON public.clinic_business_hours
  FOR ALL USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_business_hours TO authenticated;

COMMENT ON TABLE public.clinic_business_hours IS
  'Jornada declarada por unidade e dia da semana. É o lado de fora do cálculo de vaga livre; os buracos de dentro (almoço, compromisso) continuam em blocked_times.';
COMMENT ON COLUMN public.clinic_business_hours.modo IS
  'aberto = a Luna pode oferecer horário aqui. fechado = não atende. sob_consulta = não ofereça, mas não negue: encaminhe para confirmar com a Dra.';

-- ── A jornada informada pela clínica em 28/09 ────────────────────────────
--
-- Segunda a sexta 08:00–19:00, sábado 08:00–14:00, domingo sob consulta.
-- Para TODAS as unidades: a informação veio sem distinção entre Florianópolis e
-- Porto Alegre, e inventar uma diferença seria pior que repetir o mesmo.
--
-- `ON CONFLICT DO NOTHING` e não `DO UPDATE`: o Lovable recombina migrations e
-- roda a mesma mais de uma vez. Com `DO UPDATE`, uma reexecução semanas depois
-- desfaria silenciosamente toda correção que alguém tivesse feito na tela.
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
