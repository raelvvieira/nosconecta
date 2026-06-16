
CREATE TYPE public.transaction_type AS ENUM ('receivable','payable');
CREATE TYPE public.transaction_status AS ENUM ('pending','paid','overdue','cancelled');
CREATE TYPE public.account_type AS ENUM ('bank','cash','pix','credit');
CREATE TYPE public.category_type AS ENUM ('income','expense');
CREATE TYPE public.entry_type AS ENUM ('debit','credit');

CREATE TABLE public.financial_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL,
  name text NOT NULL,
  type public.account_type NOT NULL,
  last_digits text,
  current_balance numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.financial_accounts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_accounts TO authenticated;
GRANT ALL ON public.financial_accounts TO service_role;
ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read accounts" ON public.financial_accounts FOR SELECT USING (true);

CREATE TABLE public.financial_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL,
  name text NOT NULL,
  type public.category_type NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.financial_categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_categories TO authenticated;
GRANT ALL ON public.financial_categories TO service_role;
ALTER TABLE public.financial_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read categories" ON public.financial_categories FOR SELECT USING (true);

CREATE TABLE public.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.patients TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patients TO authenticated;
GRANT ALL ON public.patients TO service_role;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read patients" ON public.patients FOR SELECT USING (true);

CREATE TABLE public.professionals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL,
  name text NOT NULL,
  commission_pct numeric(5,2) NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.professionals TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professionals TO authenticated;
GRANT ALL ON public.professionals TO service_role;
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read professionals" ON public.professionals FOR SELECT USING (true);

CREATE TABLE public.financial_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL,
  type public.transaction_type NOT NULL,
  status public.transaction_status NOT NULL,
  description text NOT NULL,
  amount numeric(14,2) NOT NULL,
  due_date date NOT NULL,
  paid_date date,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  account_id uuid REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.financial_categories(id) ON DELETE SET NULL,
  source_type text,
  source_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.financial_transactions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_transactions TO authenticated;
GRANT ALL ON public.financial_transactions TO service_role;
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read transactions" ON public.financial_transactions FOR SELECT USING (true);
CREATE INDEX idx_ft_company_status_due ON public.financial_transactions(company_id, status, due_date);
CREATE INDEX idx_ft_company_type_paid ON public.financial_transactions(company_id, type, paid_date);
CREATE INDEX idx_ft_company_type_status ON public.financial_transactions(company_id, type, status);

CREATE TABLE public.ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.financial_transactions(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
  entry_type public.entry_type NOT NULL,
  amount numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ledger_entries TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ledger_entries TO authenticated;
GRANT ALL ON public.ledger_entries TO service_role;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read ledger" ON public.ledger_entries FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.finance_cash_flow_series(
  p_company_id text,
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
    ON t.company_id = p_company_id
   AND ((t.status='paid' AND t.paid_date = d.day) OR (t.status='pending' AND t.due_date = d.day))
  GROUP BY 1
  ORDER BY 1;
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.finance_cash_flow_series(text,date,date,text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.finance_revenue_by_category(
  p_company_id text, p_from date, p_to date
) RETURNS TABLE (category_id uuid, name text, total numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT c.id, c.name, COALESCE(SUM(t.amount),0) AS total
  FROM public.financial_categories c
  LEFT JOIN public.financial_transactions t
    ON t.category_id = c.id
   AND t.company_id = p_company_id
   AND t.type='receivable' AND t.status='paid'
   AND t.paid_date BETWEEN p_from AND p_to
  WHERE c.company_id = p_company_id AND c.type='income'
  GROUP BY c.id, c.name
  ORDER BY total DESC;
$fn$;
GRANT EXECUTE ON FUNCTION public.finance_revenue_by_category(text,date,date) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.finance_revenue_by_professional(
  p_company_id text, p_from date, p_to date
) RETURNS TABLE (professional_id uuid, name text, total numeric, commission_pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT p.id, p.name, COALESCE(SUM(t.amount),0), p.commission_pct
  FROM public.professionals p
  LEFT JOIN public.financial_transactions t
    ON t.professional_id = p.id
   AND t.company_id = p_company_id
   AND t.type='receivable' AND t.status='paid'
   AND t.paid_date BETWEEN p_from AND p_to
  WHERE p.company_id = p_company_id
  GROUP BY p.id, p.name, p.commission_pct
  ORDER BY 3 DESC;
$fn$;
GRANT EXECUTE ON FUNCTION public.finance_revenue_by_professional(text,date,date) TO anon, authenticated, service_role;
