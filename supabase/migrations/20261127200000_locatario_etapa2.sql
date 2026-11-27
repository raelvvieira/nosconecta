-- Locatário, etapa 2: avisos automáticos (opcionais), prontuário e registro do aviso.

-- O locatário escolhe no autocadastro se os pacientes dele recebem a confirmação
-- do agendamento pelo WhatsApp do consultório. Desligado por padrão.
ALTER TABLE public.clinic_members
  ADD COLUMN IF NOT EXISTS avisos_automaticos boolean NOT NULL DEFAULT false;

ALTER TABLE public.locacoes
  ADD COLUMN IF NOT EXISTS aviso_enviado_em timestamptz;

-- Prontuário dos pacientes do locatário. Quem escreve é o locatário (pelo
-- servidor); a clínica lê tudo, como combinado.
CREATE TABLE IF NOT EXISTS public.locatario_prontuario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  unit_id uuid NOT NULL REFERENCES public.clinic_units(id) ON DELETE CASCADE,
  tenant_user_id uuid NOT NULL,
  paciente_id uuid NOT NULL REFERENCES public.locatario_pacientes(id) ON DELETE CASCADE,
  data date NOT NULL DEFAULT CURRENT_DATE,
  texto text NOT NULL CHECK (length(btrim(texto)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS locatario_prontuario_paciente
  ON public.locatario_prontuario (paciente_id, data DESC, created_at DESC);

ALTER TABLE public.locatario_prontuario ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS locatario_prontuario_equipe ON public.locatario_prontuario;
CREATE POLICY locatario_prontuario_equipe ON public.locatario_prontuario FOR ALL TO authenticated
  USING (public.can_access_row(owner_id, unit_id) AND public.pode_ver_area('agenda'))
  WITH CHECK (public.can_access_row(owner_id, unit_id) AND public.pode_ver_area('agenda'));
