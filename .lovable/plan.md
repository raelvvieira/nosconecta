## 1. Rebrand

- Trocar "OdontoCare" por "NÓS Conecta" em `src/components/finance/Sidebar.tsx` (logo no topo).
- Atualizar `<title>` em `src/routes/__root.tsx`.

## 2. Ativar Lovable Cloud

Habilitar o backend integrado (Postgres + Data API). Sem auth nesta fase — a página segue pública, mas já preparada para multi-tenant via `company_id` (com um valor fixo de "demo" por enquanto).

## 3. Schema (migration única)

Tabelas no schema `public`, todas com `GRANT` para `anon`/`authenticated`/`service_role` e RLS permissiva nesta fase (leitura pública), já que ainda não há login:

- `financial_accounts` — id, company_id, name, type (`bank|cash|pix|credit`), current_balance, timestamps.
- `financial_categories` — id, company_id, name, type (`income|expense`).
- `financial_transactions` — id, company_id, type (`receivable|payable`), status (`pending|paid|overdue|cancelled`), description, amount, due_date, paid_date, patient_id, professional_id, account_id, category_id, source_type, source_id, timestamps. Índices em `(company_id, status, due_date)` e `(company_id, type, paid_date)`.
- `ledger_entries` — id, transaction_id, account_id, entry_type (`debit|credit`), amount, created_at.
- Enums Postgres para `transaction_type`, `transaction_status`, `account_type`, `category_type`, `entry_type`.

Sem tabelas separadas para receitas/despesas/fluxo — tudo derivado de `financial_transactions`.

## 4. Seed (na própria migration)

Inserir, para `company_id = 'demo'`:
- 3 contas (Santander, Caixa, Pix).
- ~8 categorias (Consulta, Implante, Ortodontia, Clareamento, Aluguel, Folha, Materiais, Marketing).
- ~6 profissionais e ~30 pacientes fictícios (apenas como UUIDs referenciados — sem tabela própria nesta fase; `patient_id`/`professional_id` são uuid livres por enquanto).
- ~250 transações distribuídas em 150 dias (passado + futuro), com mistura de `paid`, `pending` e `overdue`, suficiente para preencher todos os gráficos.

## 5. Server functions (TanStack `createServerFn`)

Arquivo `src/lib/finance/queries.functions.ts`. Cliente Supabase publishable server-side, leitura via Data API. Todas recebem `{ companyId, from, to }` quando aplicável:

- `getFinanceOverview` — devolve KPIs agregados (revenue, expenses, netProfit, margin, overdue, variações vs. período anterior).
- `getCashFlowSeries` — agrega por `day|week|month`, retorna `[{date, income, expense, future_receivable, balance}]`.
- `getUpcomingReceivables` / `getUpcomingPayables` — 5 próximos por `due_date`.
- `getBankAccounts` — saldo atual de cada conta.
- `getRevenueByCategory` (procedimentos) e `getRevenueByProfessional` — agrupamentos com totais.
- `getCommissions` — soma por profissional × percentual configurável (default 30%, hardcoded por enquanto, campo preparado para futura tabela `professional_commissions`).
- `getInsights` — derivado das demais (maior categoria, dia mais lucrativo, variação MoM, alerta de inadimplência).

Cálculos pesados ficam no Postgres via SQL (RPC functions `security definer` quando precisar `GROUP BY` com `date_trunc`); o frontend só consome resultados prontos.

## 6. Frontend — trocar mock por dados reais

- Remover `src/lib/finance/mock-data.ts` do caminho de render (manter arquivo só como referência ou deletar).
- `src/lib/finance/selectors.ts` deixa de ser usado pela página; lógica migra para as server functions.
- `src/routes/index.tsx` passa a usar TanStack Query (`ensureQueryData` no loader + `useSuspenseQuery` nos componentes) chamando as server functions, com `companyId = 'demo'` fixo e o período/granularidade atuais como `loaderDeps`.
- Componentes (`KpiCard`, `CashFlowChart`, etc.) continuam puros — só mudam as props que recebem.
- Adicionar `errorComponent` e `notFoundComponent` na rota.

## 7. Fora de escopo agora

- Autenticação / multi-tenant real (preparado via `company_id`, mas sem login).
- Tabelas de pacientes/profissionais/consultas (apenas UUIDs referenciados).
- Configuração de percentual de comissão por profissional (hardcoded).
- Outras páginas do menu lateral.

## Notas técnicas

- Cliente Supabase server-side: publishable key + `SUPABASE_URL`, sem persistência de sessão.
- Toda função server é pública (sem `requireSupabaseAuth`) porque a página é pública nesta fase; segurança vem das policies (`SELECT TO anon` apenas em colunas seguras) e do filtro fixo por `company_id`.
- Sem `supabaseAdmin` em rota cliente-reachable.
