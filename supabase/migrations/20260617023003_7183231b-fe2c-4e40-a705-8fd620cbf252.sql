
-- Shared updated_at function (idempotent)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Enums
DO $$ BEGIN
  CREATE TYPE public.goal_type AS ENUM ('revenue', 'profit', 'cash', 'receivables');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.goal_period AS ENUM ('monthly', 'quarterly', 'yearly', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.scenario_type AS ENUM ('hire_employee', 'equipment_purchase', 'new_professional', 'marketing_investment', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- financial_goals
CREATE TABLE public.financial_goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  goal_type public.goal_type NOT NULL,
  target_amount NUMERIC NOT NULL DEFAULT 0,
  period public.goal_period NOT NULL DEFAULT 'monthly',
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_goals TO anon, authenticated;
GRANT ALL ON public.financial_goals TO service_role;

ALTER TABLE public.financial_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read goals" ON public.financial_goals FOR SELECT USING (true);
CREATE POLICY "Public write goals" ON public.financial_goals FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER set_financial_goals_updated_at
  BEFORE UPDATE ON public.financial_goals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_financial_goals_company ON public.financial_goals(company_id);

-- financial_scenarios
CREATE TABLE public.financial_scenarios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  scenario_type public.scenario_type NOT NULL,
  description TEXT,
  monthly_cost NUMERIC NOT NULL DEFAULT 0,
  monthly_revenue NUMERIC NOT NULL DEFAULT 0,
  one_time_cost NUMERIC NOT NULL DEFAULT 0,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_scenarios TO anon, authenticated;
GRANT ALL ON public.financial_scenarios TO service_role;

ALTER TABLE public.financial_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read scenarios" ON public.financial_scenarios FOR SELECT USING (true);
CREATE POLICY "Public write scenarios" ON public.financial_scenarios FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER set_financial_scenarios_updated_at
  BEFORE UPDATE ON public.financial_scenarios
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_financial_scenarios_company ON public.financial_scenarios(company_id);
