## Backend para a página Recebimentos

Conectar a página `/recebimentos` aos dados reais já existentes em `financial_transactions` (filtrando `type='receivable'`), espelhando o padrão de `payables.functions.ts`. Sem novas tabelas — a sugestão `treatment_financial_plans` fica como futuro escopo (não é necessário para a tela atual).

### Backend (novo)

`src/lib/finance/receivables.functions.ts` com server functions:

- **`getReceivablesOverview`** — input: `companyId`, `from`, `to`, `patient`, `professional`, `category`, `method`, `status` (`all|received|pending|overdue|installments|recurring`), `q`. Retorna em um único objeto:
  - `kpis`: `receivedInPeriod` (variação vs período anterior), `toReceive` (total + nº de parcelas futuras pendentes), `overdue` (total + nº de pacientes inadimplentes únicos), `averageTicket` (média do `amount` de receivables pagos no período).
  - `evolution`: série mensal dos últimos 12 meses com `received`, `expected` (pending no mês), `overdue` (vencidos no mês), `goal` (meta fixa baseada em média + 10% — placeholder até existir tabela de metas).
  - `topProcedures`: usa `finance_revenue_by_category` (categorias income) → `{ id, name, total, pct }`.
  - `topDentists`: usa `finance_revenue_by_professional` → `{ id, name, total }`.
  - `defaulters`: agrupa `status='overdue'` por `patient_id`, join em `patients`, ordena por valor desc, limit 5.
  - `recurringReceivables`: `is_recurring=true` AND `type='receivable'`, limit 8.
  - `transactions`: lista filtrada (até 500), com joins em `patients`, `professionals`, `financial_categories`, `financial_accounts`. Cada linha já vem com `effective_status` (`pending` + `due_date<hoje` → `overdue`).
  - `accounts`, `patients`, `professionals`, `categories`: listas para popular os filtros e o drawer.

- **`createReceivable`** — input: `patient_id`, `procedure` (category_id), `professional_id`, `amount`, `due_date`, `account_id`, `payment_method`, `notes`, `markReceivedNow`, `installments` (1..60), `isRecurring`, `recurrenceType` (`weekly|monthly|yearly`). Mesma lógica de `createPayable` adaptada para `type='receivable'`, gerando N parcelas com `parent_transaction_id` quando `installments>1`, ou marcando `is_recurring/recurrence_type` quando recorrente. Quando `markReceivedNow=true`, cria com `status='paid'` e `paid_date=hoje`.

- **`markReceivableReceived`** — input: `id`, `paid_date?`. `UPDATE` → `status='paid', paid_date`.

- **`deleteReceivable`** — input: `id`. Hard delete.

- **`cancelReceivable`** — input: `id`. `UPDATE` → `status='cancelled'`.

### Frontend

`src/routes/recebimentos.tsx`:
- Trocar mocks por `useSuspenseQuery` + `useServerFn(getReceivablesOverview)`, no padrão do `pagamentos.tsx` (incluindo `loader` com `ensureQueryData` + `queryOptions`).
- `validateSearch`: já existe; manter `from`, `to`, `patient`, `professional`, `procedure` (mapeia para `category_id`), `status`, `method`, `q`, `page`.
- KPIs, gráfico (12 meses, granularidade visual mantida — selector continua client-side só para o label, dado mensal por padrão), cards laterais (Top procedimentos, Top dentistas, Inadimplentes, Recorrentes) e tabela passam a usar os dados do server.
- Tabela: paciente (nome do join), procedimento (category_name ou description), profissional (join), valor, vencimento, badge de status (usar `effective_status`), forma de pagamento, menu de ações conectado às mutations (`markReceivableReceived`, `cancelReceivable`, `deleteReceivable`) com `toast` + `invalidateQueries(["receivables-overview"])`.
- Botão "Registrar Recebimento" no menu de ações abre `RegisterReceiptDialog` já vinculado a uma `id` selecionada; ao confirmar chama `markReceivableReceived`.

`src/components/finance/receivables/NewReceivableSheet.tsx`:
- Receber `patients`, `professionals`, `categories`, `accounts` via props.
- Trocar inputs livres por `Select` populados com as listas.
- Submit chama `useServerFn(createReceivable)`; toast de sucesso e invalida cache.

`src/components/finance/receivables/RegisterReceiptDialog.tsx`:
- Aceitar prop `transactionId?: string`; se presente, ao confirmar chama `markReceivableReceived({ data: { id, paid_date } })`.
- Sem id (uso "registro rápido" do header) → mantém modal informativo com toast (sem persistência), já que não há transação alvo.

`src/lib/finance/receivables-mock.ts` → **deletar** depois que tudo estiver migrado.

### Fora do escopo (citado pela IA, mas não pedido agora)
- Tabela `treatment_financial_plans` e tabela `procedures` própria (hoje "procedimento" = category income; descrição livre na transação).
- Job automático de geração de recorrências futuras (cron).
- Endpoint REST separado (`GET /finance/receivables/chart`) — a função única `getReceivablesOverview` já entrega tudo em uma chamada, igual ao padrão do payables/overview.

### Migration?
Não é necessária. Toda a estrutura (`financial_transactions` com `patient_id`, `professional_id`, `category_id`, `account_id`, `payment_method`, `installment_*`, `is_recurring`, `recurrence_type`, `parent_transaction_id`) já existe e está populada com dados de demonstração (220 receivables no `demo`).
