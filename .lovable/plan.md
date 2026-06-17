## 1. Visão Geral — período personalizado

- Adicionar opção "Personalizado" em `PageHeader`: ao clicar no chip de data abre um `Popover` com `Calendar` (shadcn, modo `range`) para escolher `from`/`to`.
- Estender `searchSchema` em `src/routes/index.tsx` com `from?` e `to?` (ISO `yyyy-mm-dd`). Quando presentes, sobrepõem `period`.
- `getFinanceOverview` passa a aceitar `from`/`to` opcionais; `periodToRange` usa esses valores quando enviados, caso contrário cai no preset.
- O chip mostra o range atual e fica clicável (igual à referência `18/03/2026 – 16/06/2026`).

## 2. Página Pagamentos (`/pagamentos`)

Nova rota `src/routes/pagamentos.tsx` espelhando o mock enviado.

### 2.1 Migration (sem tabelas novas)

Adicionar colunas em `financial_transactions`:
- `payment_method text` (pix, boleto, ted, cartao, dinheiro)
- `supplier_name text`
- `installment_number int`, `installment_total int`
- `parent_transaction_id uuid references financial_transactions(id) on delete cascade`
- `is_recurring boolean default false`
- `recurrence_type text` (monthly, weekly, yearly)
- Índices: `(company_id, type, status, due_date)`, `(parent_transaction_id)`.

Trigger leve para marcar `overdue` automaticamente na leitura não é necessário — calculamos `overdue = pending AND due_date < today` no backend (mantém código mais simples e correto). Mas como o schema já tem o status `overdue`, ainda respeitamos registros gravados com esse valor.

Seed: adicionar ~10 fornecedores e ~25 transações `payable` extras (com `supplier_name`, `payment_method`, algumas parceladas, 2 recorrentes) para popular a tela.

### 2.2 Server functions (`src/lib/finance/payables.functions.ts`)

Todas via `createServerFn` com cliente publishable server-side (mesma pattern do overview):

- `getPayablesOverview({ companyId, from, to, filters })` → retorna tudo da página numa chamada:
  - KPIs: `paidInPeriod`, `toPay`, `overdue`, `forecastTotal` (paid+pending+overdue do período, baseado em `due_date`), com `deltaPct` vs período anterior em `paidInPeriod` e `overdue`.
  - `categoryBreakdown` (donut) — soma por `category_id` no período (status ≠ cancelled).
  - `upcomingDueDates` — 5 próximos `pending` por `due_date >= today`.
  - `recurringPayments` — `is_recurring = true`, mostrando próxima ocorrência.
  - `accounts` e `categories` (para filtros e form).
  - `transactions` — lista paginada de despesas no range, com filtros (search, category, account, supplier, status, payment_method) e ordenação por `due_date`.

- `createPayable({ ... })` — insere uma transação `type=payable`. Regras:
  - `markPaidNow=true` → `status=paid`, `paid_date=hoje`; caso contrário `status=pending`.
  - Quando `installmentTotal>1`: gera N linhas (`installment_number=i`, `installment_total=N`, `parent_transaction_id` = id da primeira), `due_date` incrementado mês a mês, `amount` = total / N (último ajusta resto), `description` recebe sufixo " (i/N)". Cada parcela tem status próprio (a primeira pode ir como `paid` se solicitado).
  - Quando `isRecurring=true` (sem parcelar): grava a transação "âncora" com `is_recurring=true`, `recurrence_type`. Não gera ocorrências futuras agora — exibimos no widget "Pagamentos recorrentes"; geração das próximas pode vir depois.
  - Valida com Zod: `description`, `amount>0`, `due_date`, opcionais `category_id`, `account_id`, `payment_method`, `supplier_name`.

- `markPayablePaid({ id, paid_date? })` — atualiza `status=paid`, `paid_date` (default hoje). Usado pelo botão "Marcar como pago" da tabela.

- `deletePayable({ id })` — exclui (CASCADE remove parcelas filhas se for o pai).

Status `overdue` derivado: queries que listam KPIs tratam `pending AND due_date < today` como atraso quando agregam (sem mutar o registro). Para registros já gravados como `overdue`, somam normalmente.

### 2.3 Frontend

Componentes em `src/components/finance/payables/`:
- `PayablesHeader` (título + botões Novo Pagamento / Importar / Exportar). Importar/Exportar ficam como botões estáticos (sem ação) nesta entrega.
- `PayableKpis` (4 cards reaproveitando `KpiCard`).
- `PayableFilters` (período com date range, categoria, conta, fornecedor, status, método, "Mais filtros" estático).
- `PayablesTable` (checkboxes, vencimento, fornecedor, categoria badge, conta com ícone, valor, status badge, método, ações `...` com "Marcar como pago" / "Excluir"). Paginação client-side (8/página).
- `CategoryBreakdownCard` (donut Recharts + lista com %).
- `UpcomingDueDatesCard` e `RecurringPaymentsCard`.
- `NewPaymentSheet` (Sheet shadcn lateral): seções Informações básicas, Financeiro, Datas, Opções (3 switches: Marcar como pago agora, Parcelar despesa, Pagamento recorrente — quando ligadas mostram inputs de qtd parcelas / tipo de recorrência), Observações. Usa `useMutation` chamando `createPayable`, invalida `["payables-overview"]`.

Rota `/pagamentos`:
- `validateSearch`: `from`, `to`, `category`, `account`, `supplier`, `status`, `method`, `page`, `q`.
- Loader pré-carrega `getPayablesOverview` com `ensureQueryData`; componente usa `useSuspenseQuery`.
- `Sidebar` ganha `useLocation` para destacar item ativo e `Link` para `/` e `/pagamentos`.

## 3. Fora de escopo

- Geração antecipada de ocorrências recorrentes futuras (apenas marca a anchor).
- Importar/Exportar reais.
- Edição inline da transação (somente marcar pago / excluir).
- Outras páginas do menu (Recebimentos, Fluxo de Caixa etc.) continuam como stubs.

## Detalhes técnicos

- Cálculo de "overdue" no backend: `status = 'overdue' OR (status = 'pending' AND due_date < CURRENT_DATE)`.
- `paid_date` usado para KPI "Pago no período"; demais KPIs (a pagar, atraso, previsto) usam `due_date` dentro do range.
- Date range no front: shadcn `Calendar mode="range"` + `date-fns` (já no projeto) para `format`.
- Sidebar: trocar `active: true` hardcoded por comparação com `useLocation().pathname`.
- Todas as mutações usam `useServerFn` + `useMutation` + `queryClient.invalidateQueries`.
