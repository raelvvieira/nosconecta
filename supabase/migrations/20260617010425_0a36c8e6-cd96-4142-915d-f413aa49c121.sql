
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS supplier_name text,
  ADD COLUMN IF NOT EXISTS installment_number integer,
  ADD COLUMN IF NOT EXISTS installment_total integer,
  ADD COLUMN IF NOT EXISTS parent_transaction_id uuid REFERENCES public.financial_transactions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_type text,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS idx_ft_company_type_status_due
  ON public.financial_transactions (company_id, type, status, due_date);
CREATE INDEX IF NOT EXISTS idx_ft_parent
  ON public.financial_transactions (parent_transaction_id);
CREATE INDEX IF NOT EXISTS idx_ft_supplier
  ON public.financial_transactions (company_id, supplier_name);

-- Demo: allow public writes (no auth yet)
GRANT INSERT, UPDATE, DELETE ON public.financial_transactions TO anon, authenticated;

DROP POLICY IF EXISTS "Public write transactions" ON public.financial_transactions;
CREATE POLICY "Public write transactions" ON public.financial_transactions
  FOR ALL TO public USING (true) WITH CHECK (true);
