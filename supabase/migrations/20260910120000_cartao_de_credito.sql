-- Cartão de crédito empresarial: cartões, faturas, e a separação entre
-- "compra no cartão" e "saída de caixa".
--
-- ── O problema que isto resolve ───────────────────────────────────────────
--
-- Hoje todo gasto é igual: registrou, virou despesa na data. Mas compra no
-- crédito NÃO sai do caixa no dia da compra — ela entra numa fatura e sai,
-- somada com todas as outras, uma vez por mês, no vencimento.
--
-- Sem essa distinção o fluxo de caixa mente nos dois sentidos: mostra dinheiro
-- saindo num dia em que nada saiu, e esconde o bolo que vai sair no dia 5.
--
-- ── As três naturezas de linha em financial_transactions ─────────────────
--
--   1. Saída de caixa comum  — card_invoice_id NULL, settles_... NULL
--   2. Compra no cartão      — card_invoice_id preenchido  → NÃO é caixa
--   3. A fatura              — settles_card_invoice_id preenchido → É caixa
--
-- Toda agregação de CAIXA ignora (2). Todo agrupamento por CATEGORIA ignora
-- (3), porque a categoria mora na compra, não na fatura. Contar os dois é
-- contar em dobro — é a única armadilha de verdade deste desenho.
--
-- ── O que NÃO muda ───────────────────────────────────────────────────────
--
-- `payment_method = 'cartao'` já existia como texto livre. Linhas antigas com
-- esse valor NÃO são compras de cartão e continuam contando como saída de
-- caixa. Nenhum backfill, nenhuma reinterpretação da string — quem ler isto
-- depois, por favor não "arrume".

-- ── 1. Cartões ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.credit_cards (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid NOT NULL DEFAULT auth.uid(),
  unit_id      uuid NOT NULL REFERENCES public.clinic_units(id) ON DELETE CASCADE,
  -- A conta que PAGA a fatura. Nullable com SET NULL de propósito: sem isso,
  -- `deleteAccount` — que hoje só desvincula transações — passaria a estourar
  -- violação de chave estrangeira em produção.
  account_id   uuid REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  name         text NOT NULL,
  last_digits  text,
  closing_day  integer NOT NULL CHECK (closing_day BETWEEN 1 AND 31),
  due_day      integer NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  -- Cartão não se apaga, se arquiva: apagar levaria junto faturas já pagas, e
  -- despesa real sumiria do histórico.
  archived_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_cards_owner_unit
  ON public.credit_cards (owner_id, unit_id) WHERE archived_at IS NULL;

-- ── 2. Faturas ───────────────────────────────────────────────────────────
--
-- Sem coluna `status`. Nada neste projeto roda em cron, então uma coluna de
-- status nunca sairia sozinha de "aberta" — nasceria mentindo. O estado é
-- derivado no app (`estadoDaFatura` em src/lib/finance/fatura.ts): paga se a
-- linha-fatura foi paga, fechada se closing_date já passou, senão aberta.

CREATE TABLE IF NOT EXISTS public.card_invoices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL DEFAULT auth.uid(),
  unit_id       uuid NOT NULL REFERENCES public.clinic_units(id) ON DELETE CASCADE,
  card_id       uuid NOT NULL REFERENCES public.credit_cards(id) ON DELETE CASCADE,
  closing_date  date NOT NULL,
  due_date      date NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- É esta constraint que torna a criação sob demanda idempotente e resolve a
-- corrida de duas compras simultâneas para a mesma fatura ainda inexistente.
CREATE UNIQUE INDEX IF NOT EXISTS idx_card_invoices_ciclo
  ON public.card_invoices (card_id, closing_date);

-- ── 3. As cinco colunas em financial_transactions ────────────────────────

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS credit_card_id uuid
    REFERENCES public.credit_cards(id) ON DELETE SET NULL,
  -- A fatura que RECEBE esta compra.
  ADD COLUMN IF NOT EXISTS card_invoice_id uuid
    REFERENCES public.card_invoices(id) ON DELETE CASCADE,
  -- A fatura que esta linha PAGA. Coluna espelho, e não só o ponteiro do outro
  -- lado: sem ela, "com o quê gastamos" viraria uma subconsulta
  -- `id NOT IN (SELECT ...)` em uma dezena de lugares, um deles dentro de uma
  -- RPC STABLE.
  ADD COLUMN IF NOT EXISTS settles_card_invoice_id uuid
    REFERENCES public.card_invoices(id) ON DELETE CASCADE,
  -- Quando a compra foi feita. `due_date` continua sendo o VENCIMENTO —
  -- reaproveitá-lo aqui faria a lista mostrar "03/04" para algo comprado em
  -- 12/03, e tornaria impossível reatribuir compras se o dia de fechamento
  -- mudasse.
  ADD COLUMN IF NOT EXISTS purchase_date date,
  -- Amarra as N parcelas da mesma compra. Não é `parent_transaction_id`: aquele
  -- é auto-FK com ON DELETE CASCADE, e apagar a 1ª parcela levaria as 12,
  -- espalhadas por 11 faturas, disparando 12 recálculos — e a exceção de
  -- congelamento abortaria o statement inteiro.
  ADD COLUMN IF NOT EXISTS purchase_group_id uuid;

-- Uma linha-fatura por fatura, e só.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ft_settles_invoice
  ON public.financial_transactions (settles_card_invoice_id)
  WHERE settles_card_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ft_card_invoice
  ON public.financial_transactions (card_invoice_id)
  WHERE card_invoice_id IS NOT NULL;

-- Todas as consultas de caixa passam a carregar `card_invoice_id IS NULL`.
-- Os índices antigos são prefixados por `company_id`, uma constante — na
-- prática inúteis.
CREATE INDEX IF NOT EXISTS idx_ft_caixa
  ON public.financial_transactions (owner_id, unit_id, type, status, due_date)
  WHERE card_invoice_id IS NULL;

-- ── 4. A soma da fatura, mantida pelo banco ──────────────────────────────
--
-- A linha-fatura guarda o total das compras. Deixar isso a cargo do app
-- significaria recalcular em cada um dos caminhos de escrita e esquecer em um
-- deles; o banco é o único lugar por onde todos passam.

CREATE OR REPLACE FUNCTION public.card_invoice_recalc(p_invoice_id uuid)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE public.financial_transactions t
     SET amount = COALESCE((
           SELECT SUM(c.amount)
             FROM public.financial_transactions c
            WHERE c.card_invoice_id = p_invoice_id
              AND c.status <> 'cancelled'
         ), 0),
         updated_at = now()
   WHERE t.settles_card_invoice_id = p_invoice_id;
$$;

/**
 * Fatura paga é congelada.
 *
 * Sem isto, editar em 20/03 uma compra de fevereiro reescreveria o valor de uma
 * fatura já paga em 10/03: o fluxo de caixa do PASSADO mudaria e deixaria de
 * bater com o extrato bancário, sem avisar ninguém.
 *
 * O congelamento vale para valor, troca de fatura e exclusão — não para
 * `status`/`paid_date`. É essa folga que permite ao "Pagar fatura" marcar as
 * compras como pagas junto, sem esbarrar na própria regra.
 *
 * Fatura FECHADA e não paga continua aceitando ajuste: lançamento atrasado pela
 * operadora é rotina.
 */
CREATE OR REPLACE FUNCTION public.card_purchase_freeze()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  alvo uuid;
  congelada boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    alvo := OLD.card_invoice_id;
  ELSIF TG_OP = 'INSERT' THEN
    alvo := NEW.card_invoice_id;
  ELSE
    -- Só valor e troca de fatura são bloqueados. Mudar status/paid_date, não.
    IF NEW.amount IS NOT DISTINCT FROM OLD.amount
       AND NEW.card_invoice_id IS NOT DISTINCT FROM OLD.card_invoice_id THEN
      RETURN NEW;
    END IF;
    alvo := COALESCE(NEW.card_invoice_id, OLD.card_invoice_id);
  END IF;

  IF alvo IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.financial_transactions f
     WHERE f.settles_card_invoice_id = alvo AND f.status = 'paid'
  ) INTO congelada;

  IF congelada THEN
    RAISE EXCEPTION
      'Esta fatura já foi paga e não aceita mais alteração. Lance um ajuste na fatura aberta.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

/**
 * Recalcula a linha-fatura quando uma compra entra, sai ou muda.
 *
 * A recursão é evitada pela primeira condição: a linha-fatura tem
 * `card_invoice_id` NULO, então o UPDATE que este gatilho faz nela não volta
 * aqui. Compra que MUDA de fatura recalcula as duas — a que perdeu e a que
 * ganhou —, senão a antiga ficaria com o valor inflado para sempre.
 */
CREATE OR REPLACE FUNCTION public.card_purchase_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  antiga uuid;
  nova uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN antiga := OLD.card_invoice_id; END IF;
  IF TG_OP <> 'DELETE' THEN nova   := NEW.card_invoice_id; END IF;

  IF antiga IS NULL AND nova IS NULL THEN
    RETURN NULL;  -- não é compra de cartão
  END IF;

  IF antiga IS NOT NULL THEN
    PERFORM public.card_invoice_recalc(antiga);
  END IF;
  IF nova IS NOT NULL AND nova IS DISTINCT FROM antiga THEN
    PERFORM public.card_invoice_recalc(nova);
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS card_purchase_freeze ON public.financial_transactions;
CREATE TRIGGER card_purchase_freeze
  BEFORE INSERT OR UPDATE OR DELETE ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.card_purchase_freeze();

DROP TRIGGER IF EXISTS card_purchase_sync ON public.financial_transactions;
CREATE TRIGGER card_purchase_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.card_purchase_sync();

-- ── 5. RLS, no mesmo padrão das outras tabelas com unidade ───────────────

ALTER TABLE public.credit_cards  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_invoices ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT; pol RECORD;
BEGIN
  FOR t IN SELECT unnest(ARRAY['credit_cards','card_invoices']) LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', pol.policyname, t);
    END LOOP;
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (public.can_access_row(owner_id, unit_id)) '
      'WITH CHECK (public.can_access_row(owner_id, unit_id));',
      t || '_scoped', t
    );
  END LOOP;
END $$;

-- `updated_at` automático, como nas outras tabelas que já têm o gatilho.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    DROP TRIGGER IF EXISTS set_updated_at ON public.credit_cards;
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.credit_cards
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    DROP TRIGGER IF EXISTS set_updated_at ON public.card_invoices;
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.card_invoices
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;
