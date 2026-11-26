-- Funil de Clientes por tempo: falta saber quem já tem consulta marcada.
--
-- A etapa "Retorno marcado" vem antes de todas as outras: quem já combinou a
-- volta não precisa de contato, seja qual for o tempo desde a última consulta.
--
-- `tem_consulta_futura` = há consulta de hoje em diante que não foi cancelada,
-- não foi concluída e não está marcada como falta. Coluna NOVA no FIM da view:
-- as existentes ficam como estão, então nada que a lê hoje muda.
CREATE OR REPLACE VIEW public.patient_funnel_signals AS
WITH consultas AS (
  SELECT
    patient_id,
    MAX(date) FILTER (WHERE status = 'completed') AS ultima_concluida,
    COUNT(*) FILTER (WHERE status = 'completed')  AS concluidas,
    BOOL_OR(date >= CURRENT_DATE AND status NOT IN ('cancelled', 'completed', 'missed')) AS tem_futuro
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
  END AS dias_sem_consulta,
  COALESCE(c.concluidas, 0)::integer AS consultas_concluidas,
  COALESCE(c.tem_futuro, false)      AS tem_consulta_futura
FROM public.patients p
LEFT JOIN consultas c ON c.patient_id = p.id
LEFT JOIN planos  pl ON pl.patient_id = p.id;

ALTER VIEW public.patient_funnel_signals SET (security_invoker = on);
GRANT SELECT ON public.patient_funnel_signals TO authenticated;
