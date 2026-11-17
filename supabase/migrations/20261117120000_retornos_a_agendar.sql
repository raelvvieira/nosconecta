-- Retornos a agendar: a lista de quem precisa ser chamado para voltar.
--
-- Antes, ao concluir um atendimento a recepção podia "deixar um retorno
-- pré-agendado" (1, 3, 6 ou 12 meses), e o sistema criava uma CONSULTA PENDENTE
-- na agenda, no mesmo horário e com o mesmo profissional. Isso tinha três
-- problemas: ocupava horário que ninguém combinou com a pessoa, enchia o
-- calendário de eventos que talvez nunca aconteçam, e disparava o lembrete "sua
-- consulta é amanhã" para um paciente que nunca marcou nada.
--
-- Agora o retorno é um LEMBRETE para a equipe: uma linha nesta lista, ordenada
-- por data, que a recepção consulta para chamar a pessoa e, aí sim, agendar de
-- verdade. Nada entra na agenda até a pessoa combinar uma data.
--
-- Aditiva: nada existente muda. Os retornos que já estão na agenda continuam lá
-- até alguém decidir convertê-los (há um script, que não roda sozinho).

CREATE TABLE IF NOT EXISTS public.retornos_a_agendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.clinic_units(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  -- Guardado também por nome: o paciente pode ser apagado e o lembrete segue
  -- sendo legível; e um atendimento de quem ainda não tem ficha tem só o nome.
  patient_name text NOT NULL,
  -- O atendimento concluído que gerou o lembrete.
  origem_appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  procedure_name text,
  professional_id uuid,
  professional_name text,
  -- O horário do atendimento de origem, para sugerir o mesmo ao agendar.
  hora_sugerida time,
  hora_fim_sugerida time,
  -- Quando faz sentido chamar. É a data que a recepção escolheu (3 meses, 6…).
  data_prevista date NOT NULL,
  observacao text,
  situacao text NOT NULL DEFAULT 'aguardando'
    CHECK (situacao IN ('aguardando', 'agendado', 'dispensado')),
  -- A consulta de retorno que nasceu deste lembrete, quando a pessoa marcou.
  agendado_appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  resolvido_em timestamptz,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A lista que a recepção abre: só os que aguardam, por data.
CREATE INDEX IF NOT EXISTS retornos_a_agendar_lista_idx
  ON public.retornos_a_agendar (owner_id, data_prevista)
  WHERE situacao = 'aguardando';

-- Um atendimento gera no máximo um lembrete em aberto: concluir, reabrir e
-- concluir de novo não pode empilhar duplicatas.
CREATE UNIQUE INDEX IF NOT EXISTS retornos_a_agendar_um_por_atendimento
  ON public.retornos_a_agendar (origem_appointment_id)
  WHERE situacao = 'aguardando' AND origem_appointment_id IS NOT NULL;

ALTER TABLE public.retornos_a_agendar ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS retornos_a_agendar_da_unidade ON public.retornos_a_agendar;
CREATE POLICY retornos_a_agendar_da_unidade ON public.retornos_a_agendar
  FOR ALL TO authenticated
  USING (public.can_access_row(owner_id, unit_id))
  WITH CHECK (public.can_access_row(owner_id, unit_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.retornos_a_agendar TO authenticated;
GRANT ALL ON public.retornos_a_agendar TO service_role;
REVOKE ALL ON public.retornos_a_agendar FROM anon;
