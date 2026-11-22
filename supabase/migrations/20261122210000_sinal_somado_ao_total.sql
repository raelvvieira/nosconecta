-- Sinal "a mais": registrado depois de o atendimento já estar confirmado com o
-- valor recebido NO DIA (sem o sinal). Nesse caso o sinal é somado ao valor
-- cobrado, em vez de ser descontado do recebimento do dia. A marca existe para
-- a remoção do sinal saber desfazer a soma. Aditiva.
ALTER TABLE public.atendimento_sinais
  ADD COLUMN IF NOT EXISTS somado_ao_total boolean NOT NULL DEFAULT false;
