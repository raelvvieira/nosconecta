-- Etapa de cada paciente no funil de Clientes.
--
-- O funil de Clientes é a base INTEIRA, e a etapa é calculada, não arrastada.
-- Fazer essa conta no navegador exigiria trazer todos os pacientes, todos os
-- planos, todos os itens e todas as consultas para decidir seis colunas —
-- inviável já em algumas centenas de pacientes. Aqui é uma varredura só, com os
-- índices que já existem.
--
-- VIEW e não coluna materializada de propósito: a etapa muda sozinha quando o
-- paciente é atendido ou o orçamento é aprovado. Uma coluna gravada precisaria
-- de gatilho em quatro tabelas e envelheceria calada na primeira que faltasse.

CREATE OR REPLACE VIEW public.patient_funnel_stage AS
WITH consultas AS (
  SELECT
    patient_id,
    MAX(date) FILTER (WHERE status = 'completed') AS ultima_concluida,
    COUNT(*) FILTER (WHERE status = 'completed')  AS concluidas
  FROM public.appointments
  WHERE patient_id IS NOT NULL
  GROUP BY patient_id
),
planos AS (
  SELECT
    tp.patient_id,
    -- Orçamento apresentado e ainda não decidido.
    COUNT(*) FILTER (WHERE tp.status = 'draft') AS em_aberto,
    -- Aprovado com pelo menos um item por fazer.
    COUNT(*) FILTER (
      WHERE tp.status = 'approved'
        AND EXISTS (
          SELECT 1 FROM public.treatment_items ti
          WHERE ti.plan_id = tp.id AND ti.status = 'pending'
        )
    ) AS em_andamento
  FROM public.treatment_plans tp
  GROUP BY tp.patient_id
)
SELECT
  p.id             AS patient_id,
  p.owner_id,
  p.unit_id,
  p.name,
  p.phone,
  p.crm_contact_id,
  c.ultima_concluida,
  CASE
    -- 1. Nunca foi atendido.
    WHEN COALESCE(c.concluidas, 0) = 0 THEN 'novo'
    -- 2. Dinheiro na mesa: orçamento apresentado e sem resposta.
    WHEN COALESCE(pl.em_aberto, 0) > 0 THEN 'orcamento_aberto'
    -- 3. Tratamento aprovado que PAROU.
    WHEN COALESCE(pl.em_andamento, 0) > 0
     AND c.ultima_concluida < CURRENT_DATE - INTERVAL '60 days' THEN 'tratamento_parado'
    -- 4. Tratamento aprovado e andando.
    WHEN COALESCE(pl.em_andamento, 0) > 0 THEN 'em_tratamento'
    -- 5. Sumiu, e não há nada pendente que explique o sumiço.
    WHEN c.ultima_concluida < CURRENT_DATE - INTERVAL '6 months' THEN 'inativo'
    -- 6. Em dia, sem pendência.
    ELSE 'manutencao'
  END AS stage
FROM public.patients p
LEFT JOIN consultas c ON c.patient_id = p.id
LEFT JOIN planos  pl ON pl.patient_id = p.id;

-- security_invoker faz a view rodar com a permissão de QUEM CONSULTA.
ALTER VIEW public.patient_funnel_stage SET (security_invoker = on);

GRANT SELECT ON public.patient_funnel_stage TO authenticated;

-- Contagem por coluna, num acesso só.
CREATE OR REPLACE VIEW public.patient_funnel_counts AS
SELECT owner_id, unit_id, stage, COUNT(*)::int AS total
FROM public.patient_funnel_stage
GROUP BY owner_id, unit_id, stage;

ALTER VIEW public.patient_funnel_counts SET (security_invoker = on);
GRANT SELECT ON public.patient_funnel_counts TO authenticated;

-- Regras dos funis, configuráveis — e os sinais que elas leem.
--
-- O corte passa a ser outro: SQL AGREGA, aplicação CLASSIFICA. Esta view
-- devolve os sinais de cada paciente (a parte cara: os joins sobre consultas,
-- planos e itens) e a sequência de "primeira regra que casar vence" roda no
-- aplicativo, lendo a configuração abaixo.

-- A configuração
CREATE TABLE IF NOT EXISTS public.clinic_funnel_rules (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  clientes jsonb NOT NULL DEFAULT '[]'::jsonb,
  perdidos jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clinic_funnel_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clinic_funnel_rules_owner ON public.clinic_funnel_rules;
CREATE POLICY clinic_funnel_rules_owner ON public.clinic_funnel_rules
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.clinic_funnel_rules TO authenticated;
GRANT ALL ON public.clinic_funnel_rules TO service_role;

-- Os sinais
CREATE OR REPLACE VIEW public.patient_funnel_signals AS
WITH consultas AS (
  SELECT
    patient_id,
    MAX(date) FILTER (WHERE status = 'completed') AS ultima_concluida,
    COUNT(*) FILTER (WHERE status = 'completed')  AS concluidas
  FROM public.appointments
  WHERE patient_id IS NOT NULL
  GROUP BY patient_id
),
planos AS (
  SELECT
    tp.patient_id,
    COUNT(*) FILTER (WHERE tp.status = 'draft') AS em_aberto,
    COUNT(*) FILTER (
      WHERE tp.status = 'approved'
        AND EXISTS (
          SELECT 1 FROM public.treatment_items ti
          WHERE ti.plan_id = tp.id AND ti.status = 'pending'
        )
    ) AS em_andamento
  FROM public.treatment_plans tp
  GROUP BY tp.patient_id
)
SELECT
  p.id         AS patient_id,
  p.owner_id,
  p.unit_id,
  p.name,
  p.phone,
  p.crm_contact_id,
  c.ultima_concluida,
  COALESCE(c.concluidas, 0) > 0      AS teve_consulta,
  COALESCE(pl.em_aberto, 0) > 0      AS tem_orcamento_aberto,
  COALESCE(pl.em_andamento, 0) > 0   AS tem_tratamento_pendente,
  CASE
    WHEN c.ultima_concluida IS NULL THEN NULL
    ELSE (CURRENT_DATE - c.ultima_concluida)
  END AS dias_sem_consulta
FROM public.patients p
LEFT JOIN consultas c ON c.patient_id = p.id
LEFT JOIN planos  pl ON pl.patient_id = p.id;

ALTER VIEW public.patient_funnel_signals SET (security_invoker = on);
GRANT SELECT ON public.patient_funnel_signals TO authenticated;

-- As duas antigas saem: a etapa não é mais decidida no banco.
DROP VIEW IF EXISTS public.patient_funnel_counts;
DROP VIEW IF EXISTS public.patient_funnel_stage;