-- O gráfico de fluxo de caixa para de contar compra de cartão como saída.
--
-- ── Por quê ──────────────────────────────────────────────────────────────
--
-- Compra no crédito não tira dinheiro da conta no dia da compra. Quem tira é a
-- FATURA, uma vez por mês, somando todas as compras do ciclo. A fatura também
-- é uma linha em `financial_transactions` — então, sem este filtro, o mesmo
-- dinheiro apareceria duas vezes: uma na compra, outra na fatura.
--
-- ── O filtro vai no ON, nunca no WHERE ───────────────────────────────────
--
-- A série é um LEFT JOIN sobre `generate_series` justamente para que os dias
-- SEM lançamento apareçam com zero. Um predicado sobre `t` num WHERE
-- transformaria o LEFT JOIN em INNER: os dias vazios sumiriam da série e o
-- eixo do gráfico ficaria com buracos.
--
-- ── Só a `expense` muda ──────────────────────────────────────────────────
--
-- `income` e `future_receivable` são de recebimento, e não existe compra de
-- cartão do lado de receita. Mas o filtro entra no ON, que vale para as três
-- somas — e por isso precisa ser inofensivo para elas, que é o caso:
-- `card_invoice_id` é sempre nulo em receita.
--
-- Assinatura idêntica, então `CREATE OR REPLACE` preserva o GRANT existente.

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
  v_tem_cartao boolean;
BEGIN
  -- A migration do cartão pode não ter rodado ainda. Sem a coluna não existe
  -- compra de cartão, e o filtro seria um no-op de qualquer forma — mas
  -- referenciá-la faria a função inteira falhar em tempo de execução.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'financial_transactions'
       AND column_name = 'card_invoice_id'
  ) INTO v_tem_cartao;

  IF v_tem_cartao THEN
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
     AND t.card_invoice_id IS NULL
     AND ((t.status='paid' AND t.paid_date = d.day) OR (t.status='pending' AND t.due_date = d.day))
    GROUP BY 1
    ORDER BY 1;
  ELSE
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
  END IF;
END;
$fn$;

-- O GRANT sobrevive ao CREATE OR REPLACE, mas repetir é barato e protege de um
-- DROP acidental numa edição futura.
GRANT EXECUTE ON FUNCTION public.finance_cash_flow_series(uuid,uuid,date,date,text) TO authenticated;
