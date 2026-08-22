-- Regras dos funis, configuráveis — e os sinais que elas leem.
--
-- Até aqui a etapa de cada paciente era um CASE fixo dentro de
-- `patient_funnel_stage`. Com as regras editáveis (ordem, nome, quais etapas
-- existem, prazos), esse CASE não tem mais como existir: ordem configurável em
-- SQL exigiria gerar a view em tempo de execução — frágil e com privilégio de
-- DDL — ou uma função por linha lendo JSON, que é lenta e mata o uso de índice.
--
-- O corte passa a ser outro: SQL AGREGA, aplicação CLASSIFICA. Esta view
-- devolve os sinais de cada paciente (a parte cara: os joins sobre consultas,
-- planos e itens) e a sequência de "primeira regra que casar vence" roda no
-- aplicativo, lendo a configuração abaixo.

-- ── A configuração ──────────────────────────────────────────────────────────
--
-- Uma linha por clínica. SEM linha significa regras padrão — e as padrão são
-- exatamente as que estavam no CASE, então nada muda de comportamento até
-- alguém editar.
CREATE TABLE IF NOT EXISTS public.clinic_funnel_rules (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Lista ORDENADA de regras. A ordem é a precedência, e é ela que a tela
  -- deixa arrastar. Formato em src/lib/atendimentos/funnelRules.ts.
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

-- ── Os sinais ───────────────────────────────────────────────────────────────
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
  -- Dias desde a última consulta concluída. NULL para quem nunca foi atendido —
  -- e NULL é diferente de "muitos dias": a regra "sem consulta há mais de N
  -- dias" não pode capturar quem nunca teve nenhuma.
  CASE
    WHEN c.ultima_concluida IS NULL THEN NULL
    ELSE (CURRENT_DATE - c.ultima_concluida)
  END AS dias_sem_consulta
FROM public.patients p
LEFT JOIN consultas c ON c.patient_id = p.id
LEFT JOIN planos  pl ON pl.patient_id = p.id;

-- security_invoker: a view roda com a permissão de quem consulta, então a RLS
-- de `patients` continua valendo através dela. Sem isso ela rodaria como o dono
-- do objeto e vazaria paciente de outra clínica.
ALTER VIEW public.patient_funnel_signals SET (security_invoker = on);
GRANT SELECT ON public.patient_funnel_signals TO authenticated;

-- As duas antigas saem: a etapa não é mais decidida no banco, e uma view de
-- contagem por etapa não tem como existir sem o CASE.
DROP VIEW IF EXISTS public.patient_funnel_counts;
DROP VIEW IF EXISTS public.patient_funnel_stage;
