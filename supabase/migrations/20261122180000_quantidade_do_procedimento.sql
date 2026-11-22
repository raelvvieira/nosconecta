-- Quantidade opcional por procedimento do atendimento (ml de um produto, unidades…).
-- Nula = ninguém informou, que é o caso de quase todo procedimento. Aditiva: o resumo
-- `appointments.procedure_name` (só os nomes) e o valor previsto não mudam.
ALTER TABLE public.appointment_procedures
  ADD COLUMN IF NOT EXISTS quantity numeric CHECK (quantity IS NULL OR quantity > 0),
  ADD COLUMN IF NOT EXISTS unit text;
