-- Pacientes do locatário (Etapa 1).
--
-- Ficam numa tabela PRÓPRIA, e não na `patients` da clínica, de propósito:
-- misturar os dois jogaria as pessoas do locatário nas listas, no funil, nas
-- automações, na assistente e nos relatórios da clínica. Aqui a clínica enxerga
-- tudo (decisão do administrador), mas só pela tela de Locações; e o locatário
-- enxerga só os dele, sempre pelo servidor — ele não tem acesso direto ao banco.
--
-- `patient_id` é o elo opcional com o cadastro da clínica, para quando a mesma
-- pessoa é paciente dos dois lados.
CREATE TABLE IF NOT EXISTS public.locatario_pacientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  unit_id uuid NOT NULL REFERENCES public.clinic_units(id) ON DELETE CASCADE,
  tenant_user_id uuid NOT NULL,
  nome text NOT NULL CHECK (length(btrim(nome)) > 0),
  telefone text,
  email text,
  nascimento date,
  observacao text,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  arquivado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS locatario_pacientes_tenant ON public.locatario_pacientes (tenant_user_id, nome);
CREATE INDEX IF NOT EXISTS locatario_pacientes_owner ON public.locatario_pacientes (owner_id);

ALTER TABLE public.locatario_pacientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS locatario_pacientes_equipe ON public.locatario_pacientes;
CREATE POLICY locatario_pacientes_equipe ON public.locatario_pacientes FOR ALL TO authenticated
  USING (public.can_access_row(owner_id, unit_id) AND public.pode_ver_area('agenda'))
  WITH CHECK (public.can_access_row(owner_id, unit_id) AND public.pode_ver_area('agenda'));
-- Sem política para o locatário: tudo dele passa pelo servidor.

-- A reserva pode dizer de qual paciente do locatário ela é.
ALTER TABLE public.locacoes
  ADD COLUMN IF NOT EXISTS paciente_id uuid REFERENCES public.locatario_pacientes(id) ON DELETE SET NULL;
