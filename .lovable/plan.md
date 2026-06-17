# Planejamento — Ajustes UX + Backend

## Parte 1 — Ajustes de UX (frontend)

### 1.1 Excluir cenário (`ScenarioSimulator.tsx`)
- Botão `Trash2` ghost no hover de cada card, canto superior direito.
- `AlertDialog` shadcn confirmando ("Excluir cenário?" + nome).
- Estado local da lista (inicializado com dados do backend). Após excluir, chama mutation `deleteScenario` e invalida query.
- Empty state: "Nenhum cenário simulado" + CTA "Criar cenário".

### 1.2 Fechar insights um a um (`SmartInsightsCard.tsx`)
- Botão `X` ghost em cada item, visível no hover.
- Estado local `dismissedIds`. Transição fade.
- Rodapé: "X de Y insights" + link "Restaurar" se houver dispensados.

### 1.3 Gerar mais insights
- Botão "Gerar mais insights" (`Sparkles`, `outline`) no header do card.
- Chama `generateMoreInsights` no backend → retorna 2 novos itens.
- Skeleton enquanto carrega; toast `sonner` "2 novos insights gerados".
- Empty state: "Nenhum insight ativo" + botão "Gerar insights".

---

## Parte 2 — Backend do Planejamento

Reutiliza `financial_transactions` e `financial_accounts`. Sem duplicação de dados.

### 2.1 Novas tabelas (migration)

**`financial_goals`** — metas financeiras da clínica.
- Campos: `id`, `company_id`, `name`, `goal_type` (enum: `revenue|profit|cash|receivables`), `target_amount numeric`, `period` (enum: `monthly|quarterly|yearly|custom`), `start_date`, `end_date`, `created_at`, `updated_at`.
- RLS pública leitura/escrita (mesmo padrão das outras tabelas financeiras atuais do projeto).
- GRANT padrão + trigger `updated_at`.

**`financial_scenarios`** — cenários salvos pelo usuário.
- Campos: `id`, `company_id`, `name`, `scenario_type` (enum: `hire_employee|equipment_purchase|new_professional|marketing_investment|custom`), `description`, `monthly_cost numeric`, `monthly_revenue numeric`, `one_time_cost numeric`, `start_date`, `end_date`, `created_at`, `updated_at`.
- Mesmas regras de RLS + GRANT + trigger.

### 2.2 Camada de serviço — `src/lib/finance/planning.functions.ts`

Server functions com `createServerFn` (público, sem auth, alinhado ao padrão atual das demais funções financeiras do projeto).

| Função | Método | Retorno |
|---|---|---|
| `getPlanningSummary` | GET | `{ currentBalance, projectedBalance30, projectedBalance90, financialRunwayDays }` |
| `getCashProjection` | GET `{ period: 30\|60\|90\|180 }` | `Array<{ date, balance, projected, goal, risk }>` |
| `getForecastSummary` | GET | `{ expectedReceivables, expectedPayables, projectedNet }` |
| `getFinancialTimeline` | GET `{ limit? }` | `Array<{ id, date, type, title, amount, balanceAfter }>` |
| `listGoals` / `createGoal` / `updateGoal` / `deleteGoal` | GET/POST | metas + cálculo de `realizado`/`projeção`/`percentual` |
| `listScenarios` / `createScenario` / `deleteScenario` | GET/POST | cenários persistidos |
| `simulateScenario` | POST `{ scenarioType, monthlyCost, monthlyRevenue?, oneTimeCost?, period }` | `{ currentProjection, simulatedProjection, impact }` |
| `getInsights` | GET | `Array<Insight>` insights determinísticos baseados em dados reais |
| `generateMoreInsights` | POST `{ excludeIds: string[] }` | mais 2 insights de um pool extra |

### 2.3 Cálculos (executados no backend)

- **Saldo atual**: `SUM(financial_accounts.current_balance)` por `company_id`.
- **Projetado 30/90 dias**: `saldoAtual + SUM(receivable pending due_date<=hoje+N) − SUM(payable pending due_date<=hoje+N)`.
- **Fôlego financeiro**: `saldoAtual / (SUM(payable paid últimos 90 dias) / 90)`.
- **Projeção diária** (gráfico): laço dia-a-dia somando eventos pendentes vencendo naquele dia ao saldo do dia anterior. `risk = saldo<0`. `goal` vem da meta ativa `goal_type='cash'`.
- **Timeline**: pendentes ordenados por `due_date`, calcula `balanceAfter` cumulativo.
- **Insights**: regras determinísticas (receita prevista vs mês anterior, risco de caixa, evolução de meta, top categoria, top profissional).

### 2.4 Frontend (route `/planejamento` + componentes)

- Substituir `planning-mock.ts` por chamadas via `useServerFn` + `useSuspenseQuery`.
- Loader pré-carrega `summary`, `projection(range)`, `forecastSummary`, `timeline`, `goals`, `scenarios`, `insights`.
- `range` continua em search param.
- Componentes `CashProjectionChart`, `FinancialTimeline`, `ScenarioSimulator`, `FinancialGoalsCard`, `SmartInsightsCard`, `ProjectionSummaryCard` passam a receber props do servidor.
- Mutations (criar cenário, excluir cenário, gerar mais insights, criar/editar meta) invalidam as queries correspondentes.

### 2.5 Seed mínimo
Inserir via tool `insert` algumas metas e cenários de exemplo para `company_id` atual, garantindo que a página tenha conteúdo visível no primeiro acesso.

---

## Ordem de execução
1. Migration (`financial_goals`, `financial_scenarios`).
2. `planning.functions.ts` com todas as server fns + cálculos.
3. Ajustes nos componentes (UX 1.1, 1.2, 1.3) já consumindo o backend.
4. Route `/planejamento` atualizada (loader + queries + mutations).
5. Seed de exemplo.
6. Remover `planning-mock.ts`.

## Fora do escopo
- Auth/multi-tenant real (usa `company_id` padrão do projeto, como as demais páginas financeiras).
- IA real para insights (mantém regras determinísticas).
- Edição de cenário (apenas criar/excluir).
