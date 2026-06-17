# Planejamento Financeiro — Plano

## 1. Correção do card "Gastos por Categoria" (`src/routes/pagamentos.tsx`)

O problema atual: dentro do card, o donut ocupa 128px e a lista flexível recebe largura reduzida, fazendo os valores (`R$ 12.000,00`) serem cortados quando o card está em sidebar estreita.

Correções:
- Reduzir donut para `h-28 w-28` e usar `gap-3`.
- Aplicar `min-w-0` na `ul` e remover `flex-1` da `span` do nome (usar `min-w-0 truncate` apenas no nome).
- Alinhar pct e valor em colunas fixas (`w-10 text-right`, `min-w-[88px] text-right`) com `tabular-nums` e `whitespace-nowrap`.
- Reduzir `text-sm` da lista para `text-[13px]` para caber confortavelmente.
- Em telas muito estreitas, empilhar (`flex-col sm:flex-row`).

## 2. Sidebar (`src/components/finance/Sidebar.tsx`)

- Remover itens: **Fluxo de Caixa**, **Conciliação**, **Relatórios**.
- Adicionar item **Planejamento** (ícone `LineChart` ou `TrendingUp`) apontando para `/planejamento`.
- Atualizar `isReal` para incluir `/planejamento`.
- Manter Comissões e Configurações como placeholders desabilitados.

Nova ordem: Visão Geral · Recebimentos · Pagamentos · Planejamento · Comissões · Configurações.

## 3. Nova página `/planejamento` (apenas frontend, dados mockados)

Arquivo: `src/routes/planejamento.tsx` + componentes em `src/components/finance/planning/`.

### Estrutura (mesmo design system: `surface-card`, `PageHeader`, glassmorphism leve)

**Header** — `PageHeader` reutilizado:
- Título: "Planejamento Financeiro"
- Subtítulo: "Projeções, cenários e previsões para sua clínica"
- Ações: `Novo Cenário` (primary), `Exportar`, `Compartilhar` (outline)

**Linha 1 — 4 KPIs** (`KpiCard` reaproveitado):
- Saldo Atual — R$ 28.800 — ↑ 12% vs mês anterior
- Saldo Projetado 30 Dias — R$ 42.300 — ↑ 18% projeção
- Saldo Projetado 90 Dias — R$ 71.900 — ↑ 34% projeção
- Fôlego Financeiro — 64 dias — badge "Acima do recomendado" + tooltip explicativo

**Linha 2 — Grid 2 colunas (8/4)**

- **Projeção de Saldo de Caixa** (`ComposedChart` Recharts)
  - Linha sólida: Saldo Atual
  - Linha tracejada: Saldo Projetado
  - Linha discreta: Meta Financeira
  - `ReferenceArea` vermelho suave: Zona de Risco (abaixo de R$ 0)
  - Seletor de período: 30 / 60 / 90 / 180 dias (via search param `range`)
  - Tooltip customizado

- **Resumo da Projeção** (sidebar direita)
  - Recebimentos previstos — R$ 120.000 (verde)
  - Pagamentos previstos — R$ 78.000 (vermelho)
  - Saldo líquido projetado — R$ 42.000
  - Donut compacto Recharts (Recebimentos / Pagamentos / Saldo líquido) com label central "R$ 42k"

**Linha 3 — Grid 3 colunas**

- **Timeline Financeira** (col-span-2): lista de ~7 eventos (Recebimento, Folha, Aluguel, Laboratório, Equipamento, Imposto). Cada item: card de data (dia/mês), ícone direcional ↑/↓, tipo+descrição, valor com sinal, "Saldo após evento". Botão "Ver todos os eventos".

- **Simulador de Cenários** (col-span-1, ao lado da timeline conforme imagem): cards de cenário (Nova Contratação - Recepcionista R$ 2.500/mês → -R$ 7.500 em 90d; Novo Equipamento - Scanner R$ 35.000 → -R$ 22.000; Novo Dentista → +R$ 19.440). Cada cenário tem nome, subtítulo, valor base, impacto colorido e chevron. Botão "Ver todos os cenários".

**Linha 4 — Sidebar direita ocupa as três últimas linhas (conforme imagem de referência)**

A imagem mostra grid com 2 colunas principais à esquerda (Timeline + Simulador) e coluna direita com:
- **Metas Financeiras**: Meta Mensal R$ 120.000, Realizado R$ 87.000, Projeção R$ 132.000, barra de progresso, "109% da meta".
- **Insights Inteligentes**: 4 itens com ícone + frase (receita projetada 18% maior, saldo negativo em 14/ago, ortodontia 47% receita futura, segunda-feira gera mais faturamento).

Layout final aproximado:
```text
[ KPI ][ KPI ][ KPI ][ KPI ]
[  Projeção de Saldo (8) ][ Resumo + Donut (4) ]
[ Timeline (5) ][ Simulador (4) ][ Metas + Insights (3) ]
```

### Componentes novos
- `planning/CashProjectionChart.tsx`
- `planning/ProjectionSummaryCard.tsx`
- `planning/FinancialTimeline.tsx`
- `planning/ScenarioSimulator.tsx`
- `planning/FinancialGoalsCard.tsx`
- `planning/SmartInsightsCard.tsx`
- `planning/planning-mock.ts` — todos os dados mockados e tipos

### Estados visuais
Hover em cards e itens, loading skeletons opcionais (não usados pois mock síncrono), empty states em listas (mensagem `text-muted-foreground`).

### Rota
- Criar `src/routes/planejamento.tsx` com `createFileRoute("/planejamento")`, `validateSearch` para `range: 30|60|90|180` (default 90).
- O Vite plugin atualiza `routeTree.gen.ts` automaticamente.

## Out of scope
- Backend, migrations, server functions.
- Funcionalidade real dos botões Novo Cenário / Exportar / Compartilhar (apenas UI).
