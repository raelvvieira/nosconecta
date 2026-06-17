## Página Financeiro > Recebimentos (frontend + mock)

Criar a rota `/recebimentos` reaproveitando o design system já existente (mesmas cores, cards, glassmorphism leve, tipografia, filtros, drawer e tabela das páginas Visão Geral e Pagamentos). Sem backend, sem migrations, sem chamadas a Supabase — apenas dados mockados em arquivo local.

### Arquivos novos

- `src/routes/recebimentos.tsx` — rota com `validateSearch` (status, search, period, from, to) usando o mesmo padrão de `pagamentos.tsx`. Estado totalmente local + URL params; nenhum `useServerFn`/`useSuspenseQuery`.
- `src/lib/finance/receivables-mock.ts` — tipos + mocks:
  - `Receivable` (id, patientName, patientAvatar, procedure, professional, amount, dueDate, receivedDate?, status: `received|pending|overdue|canceled`, paymentMethod, installmentNumber?, installmentTotal?, isRecurring, recurrenceType?, notes?)
  - Arrays mock: ~24 receivables, séries do gráfico (12 meses com recebido/previsto/atrasado/meta), top procedimentos (donut), top dentistas, inadimplentes, recorrentes.
- `src/components/finance/receivables/`
  - `ReceivablesHeader.tsx` — título, subtítulo, 3 botões (Novo Recebimento, Registrar Recebimento, Exportar).
  - `ReceivableKpis.tsx` — 4 KPI cards reusando `KpiCard` existente (Recebido no período, A receber, Em atraso, Ticket médio) com os badges/legendas pedidos.
  - `ReceivablesEvolutionChart.tsx` — gráfico de colunas agrupadas (Recharts) + linha de meta, tooltip completo, seletor Diário/Semanal/Mensal. Reusa tokens do `CashFlowChart`.
  - `TopProceduresCard.tsx` — donut + lista com % e valor.
  - `TopDentistsCard.tsx` — ranking com avatar + valor.
  - `DefaultersCard.tsx` — lista de inadimplentes (nome + valor devido).
  - `RecurringReceivablesCard.tsx` — lista (nome, periodicidade, valor/mês).
  - `ReceivablesFilters.tsx` — busca + selects (Período, Paciente, Profissional, Procedimento, Status, Forma de pagamento) + botão "Mais filtros" (apenas visual). Reutiliza `DateRangePicker`.
  - `ReceivablesTabs.tsx` — abas Todos/Recebidos/Pendentes/Atrasados/Parcelados/Recorrentes (estilo CRM, mesmo visual do `Tabs` shadcn já usado).
  - `ReceivablesTable.tsx` — tabela com checkbox, paciente (avatar+nome), procedimento, profissional, valor, vencimento, badge de status, forma de pagamento, menu de ações (Editar, Registrar Recebimento, Duplicar, Cancelar, Excluir) + paginação visual.
  - `NewReceivableSheet.tsx` — drawer lateral direito com seções Paciente / Financeiro / Datas / Parcelamento (toggle + entrada/qtd/valor/resumo) / Recorrência (toggle + semanal/mensal/anual) / Observações. Rodapé Cancelar + Salvar. Mesmo padrão visual de `NewPaymentSheet`.
  - `RegisterReceiptDialog.tsx` — modal rápido (Valor, Conta Financeira, Forma de Pagamento, Data de Recebimento, Observação) + botões Cancelar/Confirmar.

### Atualizações

- `src/components/finance/Sidebar.tsx` — adicionar item "Recebimentos" apontando para `/recebimentos` (entre Visão Geral e Pagamentos), seguindo o mesmo highlight ativo.
- Nenhuma alteração em arquivos de backend, migrations, `queries.functions.ts`, `payables.functions.ts` ou supabase types.

### Comportamento

- Filtros, abas e busca operam em memória sobre o mock. Submits dos drawer/modal só fecham e mostram toast de sucesso (sem persistência).
- Mantém glassmorphism leve, cards arredondados, badges de status (verde/amarelo/vermelho/cinza) iguais aos já usados em Pagamentos.
- Layout idêntico à referência: grid principal (KPIs + gráfico + filtros + tabela) à esquerda e coluna direita com os 4 cards (Top procedimentos, Top dentistas, Inadimplentes, Recorrentes).

### Fora do escopo

- Backend, persistência, RLS, edge functions.
- Exportação real (botão é placeholder com toast).
- Edição inline na tabela.
