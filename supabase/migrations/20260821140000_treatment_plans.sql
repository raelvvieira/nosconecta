-- Orçamentos e tratamentos do paciente.
--
-- Onda 4 da ficha. Um orçamento é uma lista de procedimentos com preço; quando
-- aprovado, os mesmos itens viram o tratamento a executar. São a mesma coisa em
-- dois momentos, e por isso uma tabela só (`treatment_plans`) com `status`, em
-- vez de "orçamento" e "tratamento" separados — separá-los obrigaria a copiar
-- os itens de um lado para o outro na aprovação, e é nessa cópia que os dois
-- lados começam a divergir.
--
-- Escopo herdado do paciente, igual às tabelas das ondas 2 e 3.

CREATE TABLE public.treatment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  professional_name text,
  title text NOT NULL,
  -- draft: em montagem, ainda não apresentado
  -- approved: paciente aceitou — é o que vira tratamento a executar
  -- rejected: apresentado e recusado; fica no histórico em vez de sumir,
  --           porque saber o que foi recusado (e por quanto) tem valor
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'rejected')),
  notes text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_treatment_plans_patient
  ON public.treatment_plans (patient_id, created_at DESC);

ALTER TABLE public.treatment_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS treatment_plans_scoped ON public.treatment_plans;
CREATE POLICY treatment_plans_scoped ON public.treatment_plans FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = patient_id AND public.can_access_row(p.owner_id, p.unit_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = patient_id AND public.can_access_row(p.owner_id, p.unit_id)
  ));

-- ── Itens ───────────────────────────────────────────────────────────────────
--
-- `procedure_name` é snapshot, não só a FK para clinic_procedures: o preço de
-- tabela muda, e um orçamento aprovado tem que continuar valendo o que foi
-- combinado. Pelo mesmo motivo `amount` é gravado, não lido do procedimento.
--
-- `tooth` guarda a notação FDI ("11", "48") ou uma região ("arcada superior").
-- Texto e não enum porque região não tem lista fechada.
CREATE TABLE public.treatment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.treatment_plans(id) ON DELETE CASCADE,
  procedure_id uuid REFERENCES public.clinic_procedures(id) ON DELETE SET NULL,
  procedure_name text NOT NULL,
  tooth text,
  amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  done_at timestamptz,
  -- Recebimento gerado quando o item foi concluído. Guardar o vínculo é o que
  -- impede gerar cobrança duas vezes para o mesmo procedimento.
  transaction_id uuid REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_treatment_items_plan
  ON public.treatment_items (plan_id, created_at);

ALTER TABLE public.treatment_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS treatment_items_scoped ON public.treatment_items;
-- Dois saltos até o paciente (item → plano → paciente). O encadeamento é o
-- mesmo padrão, só mais fundo — e é o que garante que um item nunca fique
-- visível para uma unidade que não enxerga o paciente dono do plano.
CREATE POLICY treatment_items_scoped ON public.treatment_items FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.treatment_plans tp
    JOIN public.patients p ON p.id = tp.patient_id
    WHERE tp.id = plan_id AND public.can_access_row(p.owner_id, p.unit_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.treatment_plans tp
    JOIN public.patients p ON p.id = tp.patient_id
    WHERE tp.id = plan_id AND public.can_access_row(p.owner_id, p.unit_id)
  ));
