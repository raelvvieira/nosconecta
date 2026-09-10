-- O fluxo de caixa passa a mostrar a SAÍDA PREVISTA.
--
-- ── O buraco que isto tapa ───────────────────────────────────────────────
--
-- A série só enxergava despesa PAGA, por `paid_date`. Um pagamento pendente —
-- aluguel do dia 10, fatura do cartão do dia 5 — não aparecia em lugar nenhum
-- do gráfico. Do lado da receita isso já era resolvido: `future_receivable`
-- mostra o que ainda vai entrar, tracejado.
--
-- Com cartão, a ausência vira insustentável: o bolo da fatura é exatamente o
-- número que a pessoa precisa ver chegando para decidir se pode comprar. Este
-- é o pedido original, nas palavras do usuário: "teríamos as saídas que saem
-- do saldo da conta, e tem as saídas que acontecem no crédito, que ficam pra
-- serem pagas dentro das faturas".
--
-- ── DROP e recria, e não CREATE OR REPLACE ───────────────────────────────
--
-- O tipo de retorno muda (uma coluna a mais), e o Postgres recusa REPLACE
-- nesse caso. O GRANT é refeito logo abaixo — sem ele, a função existiria e
-- ninguém poderia chamá-la.
--
-- ── A ordem de publicação não importa ────────────────────────────────────
--
-- Se a migration rodar antes do código: a coluna extra é ignorada por quem não
-- a lê. Se o código subir antes da migration: o campo chega indefinido e a
-- série tracejada simplesmente não aparece. Nenhum dos dois quebra.

DROP FUNCTION IF EXISTS public.finance_cash_flow_series(uuid, uuid, date, date, text);

CREATE FUNCTION public.finance_cash_flow_series(
  p_owner_id uuid,
  p_unit_id uuid,
  p_from date,
  p_to date,
  p_granularity text
) RETURNS TABLE (
  bucket date,
  income numeric,
  expense numeric,
  future_receivable numeric,
  future_payable numeric
)
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
  -- compra de cartão, e o filtro seria um no-op — mas referenciá-la faria a
  -- função inteira falhar em tempo de execução.
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
      COALESCE(SUM(CASE WHEN t.type='receivable' AND t.status='pending' AND t.due_date  = d.day THEN t.amount END),0) AS future_receivable,
      COALESCE(SUM(CASE WHEN t.type='payable'    AND t.status='pending' AND t.due_date  = d.day THEN t.amount END),0) AS future_payable
    FROM generate_series(p_from, p_to, interval '1 day') AS d(day)
    LEFT JOIN public.financial_transactions t
      ON t.owner_id = p_owner_id
     AND (p_unit_id IS NULL OR t.unit_id = p_unit_id)
     -- Compra no cartão não é caixa: quem é caixa é a fatura. Sem isto o mesmo
     -- dinheiro apareceria duas vezes. Vai no ON, nunca num WHERE — no WHERE o
     -- LEFT JOIN vira INNER e os dias sem lançamento somem da série.
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
      COALESCE(SUM(CASE WHEN t.type='receivable' AND t.status='pending' AND t.due_date  = d.day THEN t.amount END),0) AS future_receivable,
      COALESCE(SUM(CASE WHEN t.type='payable'    AND t.status='pending' AND t.due_date  = d.day THEN t.amount END),0) AS future_payable
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

GRANT EXECUTE ON FUNCTION public.finance_cash_flow_series(uuid,uuid,date,date,text) TO authenticated;
