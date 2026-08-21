-- Arquivos do paciente: imagens e documentos na mesma tabela.
--
-- Onda 3 da ficha. A referência que motivou este trabalho tinha DUAS abas —
-- "Imagens" e "Documentos" — mas a diferença entre um raio-x e um termo
-- assinado é técnica, não de uso: quem procura os dois está fazendo a mesma
-- pergunta ("cadê o arquivo do fulano"). Uma tabela com `kind` resolve, e a
-- tela decide se desenha grade ou lista.
--
-- Mesmo escopo herdado do paciente das tabelas de prontuário
-- (20260821120000): sem owner_id/unit_id próprios, encadeando contra
-- `patients` como ledger_entries faz contra financial_accounts.

CREATE TABLE public.patient_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  -- image: foto intraoral, raio-x, documento fotografado
  -- document: contrato, termo de consentimento, receituário, atestado
  kind text NOT NULL CHECK (kind IN ('image', 'document')),
  -- Rótulo livre, para o tipo de documento da referência (contrato, termo…)
  -- não virar enum: cada clínica nomeia de um jeito, e um enum obrigaria uma
  -- migration a cada papel novo.
  title text NOT NULL,
  -- Caminho no bucket, NUNCA a URL assinada: ela expira, e guardar um link
  -- morto seria pior do que não guardar nada. A URL é gerada na leitura.
  storage_path text NOT NULL,
  mime text,
  size_bytes bigint,
  professional_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_patient_files_patient
  ON public.patient_files (patient_id, created_at DESC);

ALTER TABLE public.patient_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS patient_files_scoped ON public.patient_files;
CREATE POLICY patient_files_scoped ON public.patient_files FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = patient_id AND public.can_access_row(p.owner_id, p.unit_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = patient_id AND public.can_access_row(p.owner_id, p.unit_id)
  ));

-- ── Bucket ──────────────────────────────────────────────────────────────────
--
-- O bucket `patient-files` precisa ser criado à parte, no Lovable
-- (Cloud → Storage), como PRIVADO. Raio-x e termo assinado são dado de saúde:
-- em bucket público, quem tiver o link vê, para sempre, sem login.
--
-- A leitura acontece por URL assinada com validade curta, gerada no servidor —
-- mesmo padrão que `crm-campaign-media` já usa em MediaUploadField.tsx.
--
-- O caminho do arquivo começa com o id do dono (`<owner_id>/<uuid>-<nome>`),
-- que é o que permite uma policy de storage por prefixo separar uma clínica da
-- outra dentro do mesmo bucket.
