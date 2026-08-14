-- As três RPCs do resumo financeiro (`finance_cash_flow_series`,
-- `finance_revenue_by_category`, `finance_revenue_by_professional`) filtravam
-- por `company_id` — a coluna legada, que hoje só existe com o valor fixo
-- "demo". Elas são `SECURITY DEFINER` (ignoram RLS por definição) e estavam
-- concedidas até para `anon`: qualquer chamada, autenticada ou não, sabendo
-- (ou chutando) `company_id = "demo"` lia os agregados financeiros inteiros
-- da clínica. Isso já era um problema antes desta feature; a fundação de
-- múltiplos usuários só tornou impossível ignorar, porque `company_id` nunca
-- vai distinguir clínica nem unidade.
--
-- Trocam `p_company_id text` por `p_owner_id uuid` (obrigatório) e
-- `p_unit_id uuid` (opcional — nulo lê todas as unidades do dono, do mesmo
-- jeito que o resto do módulo financeiro). Concessão passa a ser só para
-- `authenticated`; quem chama continua sendo `queries.functions.ts`, que
-- passa `context.ownerId`/o filtro de unidade resolvido no servidor — nunca
-- um valor vindo direto do cliente sem checagem.

DROP FUNCTION IF EXISTS public.finance_cash_flow_series(text, date, date, text);
DROP FUNCTION IF EXISTS public.finance_revenue_by_category(text, date, date);
DROP FUNCTION IF EXISTS public.finance_revenue_by_professional(text, date, date);

CREATE OR REPLACE FUNCTION public.finance_cash_flow_series(
  p_owner_id uuid,
  p_unit_id uuid,
  p_from date,
  p_to date,
  p_granularity text
) RETURNS TABLE (bucket date, income numeric, expense numeric, future_receivable numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_unit text := CASE p_granularity WHEN 'weekly' THEN 'week' WHEN 'monthly' THEN 'month' ELSE 'day' END;
BEGIN
  RETURN QUERY
  SELECT
    CAST(date_trunc(v_unit, d.day) AS date) AS bucket,
    COALESCE(SUM(CASE WHEN t.type='receivable' AND t.status='paid'    AND t.paid_date = d.day THEN t.amount END),0) AS income,
    COALESCE(SUM(CASE WHEN t.type='payable'    AND t.status='paid'    AND t.paid_date = d.day THEN t.amount END),0) AS expense,
    COALESCE(SUM(CASE WHEN t.type='receivable' AND t.status='pending' AND t.due_date  = d.day THEN t.amount END),0) AS future_receivable
  FROM generate_series(p_from, p_to, interval '1 day') AS d(day)
  LEFT JOIN public.financial_transactions t
    ON t.owner_id = p_owner_id
   AND (p_unit_id IS NULL OR t.unit_id = p_unit_id)
   AND ((t.status='paid' AND t.paid_date = d.day) OR (t.status='pending' AND t.due_date = d.day))
  GROUP BY 1
  ORDER BY 1;
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.finance_cash_flow_series(uuid,uuid,date,date,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.finance_revenue_by_category(
  p_owner_id uuid, p_unit_id uuid, p_from date, p_to date
) RETURNS TABLE (category_id uuid, name text, total numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  -- Categoria é clínica inteira (sem unit_id); a transação ligada a ela,
  -- essa sim, é filtrada por unidade quando pedido.
  SELECT c.id, c.name, COALESCE(SUM(t.amount),0) AS total
  FROM public.financial_categories c
  LEFT JOIN public.financial_transactions t
    ON t.category_id = c.id
   AND t.owner_id = p_owner_id
   AND (p_unit_id IS NULL OR t.unit_id = p_unit_id)
   AND t.type='receivable' AND t.status='paid'
   AND t.paid_date BETWEEN p_from AND p_to
  WHERE c.owner_id = p_owner_id AND c.type='income'
  GROUP BY c.id, c.name
  ORDER BY total DESC;
$fn$;
GRANT EXECUTE ON FUNCTION public.finance_revenue_by_category(uuid,uuid,date,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.finance_revenue_by_professional(
  p_owner_id uuid, p_unit_id uuid, p_from date, p_to date
) RETURNS TABLE (professional_id uuid, name text, total numeric, commission_pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT p.id, p.name, COALESCE(SUM(t.amount),0), p.commission_pct
  FROM public.professionals p
  LEFT JOIN public.financial_transactions t
    ON t.professional_id = p.id
   AND t.owner_id = p_owner_id
   AND (p_unit_id IS NULL OR t.unit_id = p_unit_id)
   AND t.type='receivable' AND t.status='paid'
   AND t.paid_date BETWEEN p_from AND p_to
  WHERE p.owner_id = p_owner_id AND (p_unit_id IS NULL OR p.unit_id = p_unit_id)
  GROUP BY p.id, p.name, p.commission_pct
  ORDER BY 3 DESC;
$fn$;
GRANT EXECUTE ON FUNCTION public.finance_revenue_by_professional(uuid,uuid,date,date) TO authenticated;
