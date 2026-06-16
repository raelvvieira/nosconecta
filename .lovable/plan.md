## Escopo

Criar apenas a rota `/` (Visão Geral) com layout idêntico à referência, alimentada por dados mock em TypeScript. Sem backend, sem auth, sem demais páginas da sidebar (a sidebar fica visualmente presente mas sem navegação real).

## Design System

Atualizar `src/styles.css` com tokens semânticos para o tema "SaaS premium clean":
- Background: branco quase puro com leve gradiente lilás/azul
- Surface cards: branco com leve glassmorphism (`bg-white/70 backdrop-blur-xl`) e bordas suaves
- Paleta: neutros (slate), azul suave (#6366F1 / indigo), lilás como accent, verde sutil para entradas, vermelho/coral suave para saídas, amber para inadimplência
- Bordas: radius 16–24px (`--radius: 1rem`)
- Sombras discretas (`shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(60,80,180,0.08)]`)
- Tipografia: Inter (display) + Inter (body) via `<link>` no `__root.tsx`
- Tokens HSL definidos em `:root` e mapeados em `@theme inline`

## Estrutura de arquivos

```
src/routes/index.tsx                   -> Página Visão Geral
src/components/finance/
  Sidebar.tsx                          -> Sidebar OdontoCare
  PageHeader.tsx                       -> Título + filtros de período
  KpiCard.tsx                          -> Card de KPI reutilizável
  KpiRow.tsx                           -> 4 KPIs
  CashFlowChart.tsx                    -> Recharts ComposedChart
  BankAccountsCard.tsx
  UpcomingReceivables.tsx
  UpcomingPayables.tsx
  InsightsCard.tsx
  RevenueByProcedure.tsx               -> Donut (PieChart)
  RevenueByDentist.tsx                 -> Barras horizontais
  CommissionsTable.tsx
src/lib/finance/
  mock-data.ts                         -> Dataset mock realista (60 dias)
  selectors.ts                         -> Funções puras de agregação por período
  types.ts                             -> Tipos (FinancialTransaction, Account, etc.)
  format.ts                            -> formatBRL, formatPercent
src/styles.css                         -> Tokens atualizados
src/routes/__root.tsx                  -> Link Inter, meta tags
```

## Modelo de dados (mock, mas espelhando o schema final)

`types.ts` define exatamente os tipos do enunciado (`financial_transactions`, `financial_accounts`, `financial_categories`, `ledger_entries`) para que o futuro plug com Lovable Cloud seja trivial. O mock gera ~120 transações distribuídas em 60 dias com `type`, `status`, `due_date`, `paid_date`, `patient_id`, `professional_id`, `account_id`, `category_id`, `source_type`.

`selectors.ts` calcula tudo dinamicamente a partir do array único:
- `getRevenue(range)` = soma `paid` receivable no período
- `getExpenses(range)` = soma `paid` payable no período
- `getNetProfit`, `getMargin`
- `getOverdue` = soma `overdue` receivable + contagem de pacientes únicos
- `getCashFlowSeries(range, granularity)` = entradas/saídas realizadas + recebimentos futuros (pending receivable com due_date no período) + saldo acumulado
- `getUpcomingReceivables`, `getUpcomingPayables`
- `getRevenueByProcedure`, `getRevenueByDentist`, `getCommissions`
- `getInsights` = compara período atual vs anterior (variações %), top procedimento, dia mais lucrativo

## Componentes-chave

**PageHeader**: título "Financeiro", subtítulo, à direita um input de range de datas (display only) + grupo de pills `Hoje | 7 dias | 30 dias | 90 dias | Personalizado`. Estado de período em `useState` no `index.tsx` propagado para todos os widgets.

**KpiCard**: ícone circular tonalizado à esquerda, label, valor grande tabular-nums, badge com variação % (verde/vermelho) + texto contextual. Lucro Líquido recebe destaque (gradiente sutil indigo→lilás na borda/sombra). Inadimplência mostra contagem de pacientes em pill âmbar.

**CashFlowChart** (Recharts ComposedChart):
- `<Bar dataKey="entradas" fill="green-soft" radius=[8,8,0,0]>` agrupado
- `<Bar dataKey="saidas" fill="red-soft">`
- `<Bar dataKey="receb_futuro" fill="transparent" stroke="indigo" strokeDasharray="4 4">`
- `<Line dataKey="saldo" stroke="indigo" strokeWidth={2} dot>`
- Toggle `Diário | Semanal | Mensal` (Select shadcn) → muda granularidade
- Tooltip customizado com as 4 séries formatadas em BRL

**BankAccountsCard**: lista de contas com ícone colorido por bandeira (Santander vermelho, Caixa azul, Pix verde), últimos dígitos, saldo à direita; rodapé fixo com `Total disponível` em destaque.

**UpcomingReceivables / UpcomingPayables**: tabela compacta shadcn, avatar com iniciais, status dot colorido na coluna vencimento (verde = futuro, âmbar = próximos 3 dias, vermelho = vencido), limite 5 + botão "Ver todos" (sem rota, ghost).

**InsightsCard**: lista de 4 insights, cada um com ícone tonalizado e texto com destaque em negrito para números/%.

**RevenueByProcedure**: PieChart donut + legenda à direita com valor BRL e %.
**RevenueByDentist**: barras horizontais (próprio render, não Recharts, para visual mais limpo) com avatar.
**CommissionsTable**: tabela 3 colunas com badge de %.

## Layout

CSS Grid responsivo:
- Sidebar fixa 240px à esquerda (hidden no mobile, drawer não incluso nessa versão)
- Main: padding 32px, gap 24px entre linhas
- Linha 1: `grid-cols-1 md:grid-cols-2 xl:grid-cols-4` (KPIs)
- Linha 2: `grid-cols-1 xl:grid-cols-[1fr_360px]` (CashFlow + Bancos)
- Linha 3: `grid-cols-1 lg:grid-cols-3` (Recebimentos | Pagamentos | Insights)
- Linha 4: `grid-cols-1 lg:grid-cols-3` (Procedimentos | Dentistas | Comissões)

## Verificação

Após implementar, abrir `browser--view_preview` em 1440x900 para conferir layout vs referência e validar console limpo.

## Fora de escopo

- Backend / Lovable Cloud / persistência
- Páginas Recebimentos, Pagamentos, Fluxo de Caixa, etc. (sidebar é decorativa)
- Autenticação
- Exportação / download de relatórios
- Date range picker funcional (apenas visual; pills mudam o período de fato)
