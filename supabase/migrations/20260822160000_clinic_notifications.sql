-- Caixa de avisos da clínica.
--
-- Até aqui, "notificar a equipe" era só push do navegador: se ninguém tivesse
-- ativado push num aparelho, o aviso não chegava a lugar nenhum e sobrava
-- apenas a linha em `automation_runs`. Pior, com a automação decidindo a
-- resposta do paciente, o sistema deixou de ter QUALQUER estado dizendo "esta
-- pessoa pediu para remarcar" — o webhook entrega o texto ao fluxo e o fluxo
-- decide.
--
-- Esta tabela é esse estado. Sino, etiqueta na agenda e bloco "Atenção" da
-- Início leem todos daqui — sem ela, cada tela inventaria a própria maneira de
-- descobrir a mesma coisa, e as três divergiriam na primeira mudança.

CREATE TABLE IF NOT EXISTS public.clinic_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Mesmo vocabulário de PushType em _shared/push.ts.
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  -- Para onde o clique leva. Texto livre porque é rota do app, não recurso.
  url text,
  -- CASCADE: aviso sobre um agendamento não pode sobreviver ao agendamento.
  -- Um "pediu remarcar" apontando para consulta apagada é ruído que ninguém
  -- consegue resolver.
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  -- Leitura é da CLÍNICA, não da pessoa: quem abre o sino marca para todos.
  -- Separar por membro exigiria uma tabela de leitura por usuário, e a equipe
  -- que compartilha o mesmo dono não ganharia nada com isso hoje.
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Consulta quente: "meus avisos não lidos, mais recentes primeiro".
CREATE INDEX IF NOT EXISTS idx_clinic_notifications_owner
  ON public.clinic_notifications (owner_id, read_at, created_at DESC);

-- Cruzamento com a agenda: os ids de agendamento com aviso em aberto.
CREATE INDEX IF NOT EXISTS idx_clinic_notifications_appointment
  ON public.clinic_notifications (appointment_id)
  WHERE appointment_id IS NOT NULL;

ALTER TABLE public.clinic_notifications ENABLE ROW LEVEL SECURITY;

-- Escopo por dono, mesma política de automation_runs
-- (20260818220000_automation_rules.sql). Não entra `unit_id`: um aviso pode não
-- ter unidade nenhuma (recebimento avulso, erro de integração), e o que tem
-- vem por `appointment_id`, cuja unidade a própria agenda já filtra.
DROP POLICY IF EXISTS clinic_notifications_owner_read ON public.clinic_notifications;
CREATE POLICY clinic_notifications_owner_read ON public.clinic_notifications
  FOR SELECT TO authenticated USING (owner_id = auth.uid());

-- Marcar como lido é a única escrita do app. Quem CRIA aviso é sempre a Edge
-- Function com service role, que não passa por RLS.
DROP POLICY IF EXISTS clinic_notifications_owner_update ON public.clinic_notifications;
CREATE POLICY clinic_notifications_owner_update ON public.clinic_notifications
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

GRANT SELECT, UPDATE ON public.clinic_notifications TO authenticated;
GRANT ALL ON public.clinic_notifications TO service_role;
