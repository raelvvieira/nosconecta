-- Recibos enviados: o registro de que o recibo em PDF de um atendimento foi
-- mandado ao paciente, para a tela mostrar "enviado em…" e oferecer "enviar
-- novamente". Uma linha por envio (reenviar acrescenta, não substitui).
-- Aditiva: nada existente muda.

CREATE TABLE IF NOT EXISTS public.recibos_enviados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  numero text,
  valor numeric,
  enviado_por uuid,
  enviado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recibos_enviados_por_atendimento_idx
  ON public.recibos_enviados (owner_id, appointment_id, enviado_em DESC);

ALTER TABLE public.recibos_enviados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recibos_enviados_da_clinica ON public.recibos_enviados;
CREATE POLICY recibos_enviados_da_clinica ON public.recibos_enviados
  FOR ALL TO authenticated
  USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recibos_enviados TO authenticated;
GRANT ALL ON public.recibos_enviados TO service_role;
REVOKE ALL ON public.recibos_enviados FROM anon;
