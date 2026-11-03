-- Mover o card à mão no quadro de Leads: trocar de funil (Atendimento,
-- Paciente modelo, Mentoria) e/ou de etapa. O quadro calcula sozinho a
-- coluna de cada pessoa; esta linha, quando existe, vence o cálculo.
-- `null` em um dos dois = aquele continua automático.
CREATE TABLE IF NOT EXISTS public.lead_posicao_manual (
  owner_id uuid NOT NULL,
  fone text NOT NULL,
  publico text CHECK (publico IN ('atendimento', 'paciente_modelo', 'mentoria')),
  etapa text,
  definido_por uuid,
  definido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, fone)
);
ALTER TABLE public.lead_posicao_manual ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_posicao_do_consultorio ON public.lead_posicao_manual;
CREATE POLICY lead_posicao_do_consultorio ON public.lead_posicao_manual
  FOR ALL TO authenticated
  USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));
