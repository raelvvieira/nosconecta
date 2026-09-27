ALTER TABLE public.clinic_procedures
  ADD COLUMN IF NOT EXISTS price_from boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clinic_procedures.price_from IS
  'O preço é um piso ("a partir de"), não um valor fechado. A IA precisa dizer "a partir de" — cotar o piso como preço final é promessa que a clínica não fez.';

ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS parcelamento text;

COMMENT ON COLUMN public.ai_agents.parcelamento IS
  'Condição de parcelamento que a IA pode informar junto do valor, em texto livre. Vazio = a IA não fala de parcelamento.';