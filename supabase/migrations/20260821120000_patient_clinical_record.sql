-- Prontuário clínico do paciente: anamnese e evoluções.
--
-- Onda 2 da ficha do paciente. Nenhuma das duas tabelas repete owner_id/unit_id:
-- elas herdam o escopo do paciente pelo mesmo encadeamento que ledger_entries e
-- appointment_notifications já usam contra a tabela-pai
-- (20260814120500_team_units_backfill_rls.sql). Isso cobre dono e unidade de uma
-- vez e torna impossível uma linha filha ficar numa unidade diferente da do
-- paciente a que pertence.

-- ── Anamnese ────────────────────────────────────────────────────────────────
--
-- `template` guarda as PERGUNTAS junto das respostas, em vez de referenciar uma
-- tabela de modelo. É deliberado: anamnese preenchida é documento histórico, e
-- se a clínica mudar o questionário depois, a resposta antiga tem que continuar
-- legível exatamente como foi respondida. Normalizar as perguntas faria uma
-- edição de modelo reescrever o passado.
--
-- template: [{"id":"alergia","label":"Tem alergia a algum medicamento?",
--             "type":"boolean"|"text"|"choice","options":[...]}]
-- answers:  {"alergia": true, "alergia_qual": "dipirona"}
CREATE TABLE public.patient_anamnesis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  -- Snapshot do nome de quem preencheu: o profissional pode sair da clínica, e
  -- o prontuário precisa continuar dizendo quem assinou.
  professional_name text,
  template jsonb NOT NULL DEFAULT '[]'::jsonb,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  filled_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Um paciente tem várias anamneses ao longo do tempo (revisão anual, mudança de
-- quadro). A tela mostra a mais recente e o histórico — por isso o índice é por
-- data decrescente, não único.
CREATE INDEX idx_patient_anamnesis_patient
  ON public.patient_anamnesis (patient_id, filled_at DESC);

ALTER TABLE public.patient_anamnesis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS patient_anamnesis_scoped ON public.patient_anamnesis;
CREATE POLICY patient_anamnesis_scoped ON public.patient_anamnesis FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = patient_id AND public.can_access_row(p.owner_id, p.unit_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = patient_id AND public.can_access_row(p.owner_id, p.unit_id)
  ));

-- ── Evoluções ───────────────────────────────────────────────────────────────
--
-- O que foi feito em cada consulta — "Raspagem Supra-gengival foi finalizada".
-- `appointment_id` é opcional porque nem toda evolução nasce de um horário
-- agendado (retorno de emergência, observação posterior).
CREATE TABLE public.patient_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  professional_name text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_patient_notes_patient
  ON public.patient_notes (patient_id, created_at DESC);

ALTER TABLE public.patient_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS patient_notes_scoped ON public.patient_notes;
CREATE POLICY patient_notes_scoped ON public.patient_notes FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = patient_id AND public.can_access_row(p.owner_id, p.unit_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = patient_id AND public.can_access_row(p.owner_id, p.unit_id)
  ));
