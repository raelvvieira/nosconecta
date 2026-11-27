-- Nem todo locatário é dentista: guarda a atividade e o registro profissional
-- que ele informar (CRO, CRBM, CREFITO, COREN, CRM…), ambos opcionais.
ALTER TABLE public.clinic_members
  ADD COLUMN IF NOT EXISTS profissao text,
  ADD COLUMN IF NOT EXISTS registro_profissional text;
