-- Sinal do atendimento: o valor pago antes, para reservar o horário.
--
-- O "valor cobrado" do atendimento (`appointments.actual_revenue`) continua
-- sendo o TOTAL — é ele que vai para a Meta, e não muda. O sinal é uma parte
-- desse total, registrada à parte:
--   • entra no financeiro como um recebimento próprio, na data em que foi pago
--     (`financial_transactions`, source_type 'agendamento_sinal');
--   • ao confirmar o atendimento, o recebimento do dia passa a ser só o saldo
--     (total menos os sinais), para a soma bater com o total, sem contar duas vezes;
--   • nunca dispara evento para a Meta.
-- Aditiva: nada existente muda.

CREATE TABLE IF NOT EXISTS public.atendimento_sinais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.clinic_units(id) ON DELETE SET NULL,
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  valor numeric NOT NULL CHECK (valor > 0),
  pago_em date NOT NULL,
  -- Mesmo vocabulário da confirmação: pix | dinheiro | cartao | cartao_parcelado.
  forma text,
  parcelas integer,
  -- O recebimento que este sinal gerou no financeiro.
  transaction_id uuid,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS atendimento_sinais_por_atendimento_idx
  ON public.atendimento_sinais (owner_id, appointment_id);

ALTER TABLE public.atendimento_sinais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS atendimento_sinais_da_clinica ON public.atendimento_sinais;
CREATE POLICY atendimento_sinais_da_clinica ON public.atendimento_sinais
  FOR ALL TO authenticated
  USING (public.can_access_row(owner_id))
  WITH CHECK (public.can_access_row(owner_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.atendimento_sinais TO authenticated;
GRANT ALL ON public.atendimento_sinais TO service_role;
REVOKE ALL ON public.atendimento_sinais FROM anon;

-- Que recibo foi enviado: do sinal ou o completo.
ALTER TABLE public.recibos_enviados
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'completo'
  CHECK (tipo IN ('sinal', 'completo'));
