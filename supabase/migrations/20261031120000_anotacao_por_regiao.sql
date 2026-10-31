-- A anotação do odontograma: uma evolução que aponta para um dente ou uma
-- região da boca.
--
-- É uma coluna em `patient_notes`, e não uma tabela nova, de propósito: a
-- anotação "dente 24: sensibilidade ao frio" É uma evolução, só que com
-- endereço. Numa tabela à parte ela sumiria da linha do tempo do prontuário,
-- e a dentista teria de olhar em dois lugares para saber o que aconteceu com
-- a pessoa. Os valores válidos ("24", "65", "maxila", "arcada_superior"…)
-- estão em `src/lib/patients/odontograma.ts`, que é quem valida ao gravar.
ALTER TABLE public.patient_notes ADD COLUMN IF NOT EXISTS regiao text;

CREATE INDEX IF NOT EXISTS idx_patient_notes_regiao
  ON public.patient_notes (patient_id, regiao)
  WHERE regiao IS NOT NULL;

COMMENT ON COLUMN public.patient_notes.regiao IS
  'Dente (FDI) ou região da boca que a anotação aponta. Nulo = evolução geral.';
