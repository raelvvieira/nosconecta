import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import {
  Plus, Upload, Download, BarChart3, Clock, AlertCircle, CalendarDays, Search, Filter,
  MoreHorizontal, Check, Trash2,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { toast } from "sonner";

import { Sidebar } from "@/components/finance/Sidebar";
import { DateRangePicker } from "@/components/finance/DateRangePicker";
import { KpiCard } from "@/components/finance/KpiCard";
import { NewPaymentSheet } from "@/components/finance/payables/NewPaymentSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

import {
  getPayablesOverview, markPayablePaid, deletePayable,
  type PayablesOverview, type PayableStatus,
} from "@/lib/finance/payables.functions";
import { formatBRL } from "@/lib/finance/format";

const searchSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  category: z.string().optional(),
  account: z.string().optional(),
  supplier: z.string().optional(),
  status: z.enum(["all", "paid", "pending", "overdue"]).default("all"),
  method: z.string().optional(),
  q: z.string().optional(),
  page: z.number().optional(),
});
type Search = z.infer<typeof searchSchema>;

const PER_PAGE = 8;

const overviewOpts = (
  fetcher: (args: { data: any }) => Promise<PayablesOverview>,
  s: Search,
) =>
  queryOptions({
    queryKey: ["payables-overview", s],
    queryFn: () => fetcher({ data: s }),
    staleTime: 15_000,
  });

export const Route = createFileRoute("/pagamentos")({
  head: () => ({
    meta: [
      { title: "Pagamentos · NÓS Conecta" },
      { name: "description", content: "Gestão de despesas e pagamentos da clínica." },
    ],
  }),
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(overviewOpts(getPayablesOverview as any, deps)),
  errorComponent: ({ error }) => (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-2">
        <h1 className="text-xl font-semibold">Não foi possível carregar os pagamentos</h1>
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
    </div>
  ),
  notFoundComponent: () => <div className="p-8">Página não encontrada.</div>,
  component: PagamentosPage,
});

const METHODS: Record<string, { label: string; color: string }> = {
  pix: { label: "PIX", color: "text-emerald-600" },
  boleto: { label: "Boleto", color: "text-amber-600" },
  ted: { label: "TED", color: "text-sky-600" },
  cartao: { label: "Cartão", color: "text-violet" },
  dinheiro: { label: "Dinheiro", color: "text-foreground" },
};

const STATUS_BADGE: Record<string, string> = {
  paid: "bg-success-soft text-success",
  pending: "bg-warning-soft text-warning",
  overdue: "bg-danger-soft text-danger",
  cancelled: "bg-muted text-muted-foreground",
};
const STATUS_LABEL: Record<string, string> = {
  paid: "Pago", pending: "Pendente", overdue: "Atrasado", cancelled: "Cancelado",
};

const CHART_COLORS = ["#7c3aed", "#f97316", "#8b5cf6", "#06b6d4", "#94a3b8", "#22c55e", "#ec4899", "#eab308"];

const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR");

function PagamentosPage() {
  const search = Route.useSearch();
  const router = useRouter();
  const qc = useQueryClient();
  const fetchOverview = useServerFn(getPayablesOverview);
  const markPaid = useServerFn(markPayablePaid);
  const remove = useServerFn(deletePayable);

  const { data } = useSuspenseQuery(overviewOpts(fetchOverview as any, search));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [qLocal, setQLocal] = useState(search.q ?? "");

  const setSearch = (patch: Partial<Search>) =>
    router.navigate({ to: "/pagamentos", search: (prev: Search) => ({ ...prev, ...patch }) });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["payables-overview"] });

  const markMutation = useMutation({
    mutationFn: (id: string) => markPaid({ data: { id } }),
    onSuccess: () => { toast.success("Pagamento marcado como pago"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { toast.success("Pagamento excluído"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  // pagination on the (already-filtered) transactions
  const page = search.page ?? 1;
  const totalPages = Math.max(1, Math.ceil(data.transactions.length / PER_PAGE));
  const rows = data.transactions.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div className="app-bg min-h-screen flex">
      <Sidebar />

      <main className="flex-1 min-w-0 px-6 lg:px-10 py-8 space-y-6">
        {/* Header */}
        <header className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Pagamentos</h1>
            <p className="text-sm text-muted-foreground mt-1">Gerencie todas as despesas da clínica</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setSheetOpen(true)} className="bg-primary hover:bg-primary/90 gap-2">
              <Plus className="h-4 w-4" /> Novo Pagamento
            </Button>
            <Button variant="outline" className="gap-2"><Upload className="h-4 w-4" /> Importar</Button>
            <Button variant="outline" className="gap-2"><Download className="h-4 w-4" /> Exportar</Button>
          </div>
        </header>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          <KpiCard
            label="Pago no período"
            value={formatBRL(data.kpis.paidInPeriod.current)}
            icon={BarChart3}
            tone="success"
            deltaPct={data.kpis.paidInPeriod.deltaPct}
            footer={<span className="text-muted-foreground">vs período anterior</span>}
          />
          <KpiCard
            label="A pagar"
            value={formatBRL(data.kpis.toPay.total)}
            icon={Clock}
            tone="violet"
            footer={
              <span className="inline-flex items-center px-2 py-1 rounded-full bg-violet-soft text-violet font-medium">
                {data.kpis.toPay.count} pagamentos
              </span>
            }
          />
          <KpiCard
            label="Em atraso"
            value={formatBRL(data.kpis.overdue.current)}
            icon={AlertCircle}
            tone="danger"
            deltaPct={data.kpis.overdue.deltaPct}
            footer={<span className="text-muted-foreground">vs mês anterior</span>}
          />
          <KpiCard
            label="Total previsto"
            value={formatBRL(data.kpis.forecastTotal)}
            icon={CalendarDays}
            tone="warning"
            footer={<span className="text-muted-foreground">Este período</span>}
          />
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5">
          {/* Table card */}
          <section className="surface-card p-5 space-y-4">
            {/* Search + filters */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar despesa..."
                  className="pl-9"
                  value={qLocal}
                  onChange={(e) => setQLocal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") setSearch({ q: qLocal || undefined, page: 1 }); }}
                  onBlur={() => setSearch({ q: qLocal || undefined, page: 1 })}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <FilterField label="Período">
                <DateRangePicker
                  from={search.from}
                  to={search.to}
                  onChange={(r) => setSearch({ from: r.from, to: r.to, page: 1 })}
                  className="h-10 px-3"
                />
              </FilterField>
              <FilterField label="Categoria">
                <FilterSelect
                  value={search.category ?? "all"}
                  onChange={(v) => setSearch({ category: v === "all" ? undefined : v, page: 1 })}
                  placeholder="Todas"
                  options={[{ value: "all", label: "Todas" }, ...data.categories.map(c => ({ value: c.id, label: c.name }))]}
                />
              </FilterField>
              <FilterField label="Conta">
                <FilterSelect
                  value={search.account ?? "all"}
                  onChange={(v) => setSearch({ account: v === "all" ? undefined : v, page: 1 })}
                  placeholder="Todas"
                  options={[{ value: "all", label: "Todas" }, ...data.accounts.map(a => ({ value: a.id, label: a.name }))]}
                />
              </FilterField>
              <FilterField label="Fornecedor">
                <FilterSelect
                  value={search.supplier ?? "all"}
                  onChange={(v) => setSearch({ supplier: v === "all" ? undefined : v, page: 1 })}
                  placeholder="Todos"
                  options={[{ value: "all", label: "Todos" }, ...data.suppliers.map(s => ({ value: s, label: s }))]}
                />
              </FilterField>
              <FilterField label="Status">
                <FilterSelect
                  value={search.status}
                  onChange={(v) => setSearch({ status: v as PayableStatus, page: 1 })}
                  placeholder="Todos"
                  options={[
                    { value: "all", label: "Todos" },
                    { value: "paid", label: "Pago" },
                    { value: "pending", label: "Pendente" },
                    { value: "overdue", label: "Atrasado" },
                  ]}
                />
              </FilterField>
              <FilterField label="Método">
                <FilterSelect
                  value={search.method ?? "all"}
                  onChange={(v) => setSearch({ method: v === "all" ? undefined : v, page: 1 })}
                  placeholder="Todos"
                  options={[{ value: "all", label: "Todos" }, ...Object.entries(METHODS).map(([k, v]) => ({ value: k, label: v.label }))]}
                />
              </FilterField>
              <Button variant="outline" className="h-10 gap-2"><Filter className="h-4 w-4" /> Mais filtros</Button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="py-3 px-3 w-8">
                      <Checkbox
                        checked={rows.length > 0 && rows.every(r => selected.has(r.id))}
                        onCheckedChange={(c) => {
                          const next = new Set(selected);
                          if (c) rows.forEach(r => next.add(r.id));
                          else rows.forEach(r => next.delete(r.id));
                          setSelected(next);
                        }}
                      />
                    </th>
                    <th className="py-3 pr-4">Vencimento</th>
                    <th className="py-3 pr-4">Fornecedor</th>
                    <th className="py-3 pr-4">Categoria</th>
                    <th className="py-3 pr-4">Conta</th>
                    <th className="py-3 pr-4">Valor</th>
                    <th className="py-3 pr-4">Status</th>
                    <th className="py-3 pr-4">Método</th>
                    <th className="py-3 pr-4">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr><td colSpan={9} className="py-12 text-center text-muted-foreground">Nenhum pagamento encontrado.</td></tr>
                  )}
                  {rows.map((t) => {
                    const status = t.effective_status;
                    const method = METHODS[t.payment_method ?? ""] ?? { label: t.payment_method ?? "—", color: "text-foreground" };
                    return (
                      <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-3 px-3">
                          <Checkbox
                            checked={selected.has(t.id)}
                            onCheckedChange={(c) => {
                              const next = new Set(selected);
                              if (c) next.add(t.id); else next.delete(t.id);
                              setSelected(next);
                            }}
                          />
                        </td>
                        <td className={cn("py-3 pr-4 tabular-nums", status === "overdue" && "text-danger font-medium")}>{fmtDate(t.due_date)}</td>
                        <td className="py-3 pr-4">
                          <div className="font-medium">{t.supplier_name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{t.description}</div>
                        </td>
                        <td className="py-3 pr-4">
                          {t.category_name && <Badge variant="secondary" className="font-normal">{t.category_name}</Badge>}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">{t.account_name ?? "—"}</td>
                        <td className="py-3 pr-4 tabular-nums font-medium">{formatBRL(t.amount)}</td>
                        <td className="py-3 pr-4">
                          <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", STATUS_BADGE[status])}>
                            {STATUS_LABEL[status]}
                          </span>
                        </td>
                        <td className={cn("py-3 pr-4", method.color)}>{method.label}</td>
                        <td className="py-3 pr-4">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="h-8 w-8 grid place-items-center rounded hover:bg-muted">
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {status !== "paid" && (
                                <DropdownMenuItem onClick={() => markMutation.mutate(t.id)}>
                                  <Check className="h-4 w-4 mr-2" /> Marcar como pago
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem className="text-danger" onClick={() => deleteMutation.mutate(t.id)}>
                                <Trash2 className="h-4 w-4 mr-2" /> Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">
                Mostrando {rows.length === 0 ? 0 : (page - 1) * PER_PAGE + 1} a {(page - 1) * PER_PAGE + rows.length} de {data.transactions.length} resultados
              </p>
              <Pagination className="m-0 w-auto">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); setSearch({ page: Math.max(1, page - 1) }); }} />
                  </PaginationItem>
                  {Array.from({ length: totalPages }).slice(0, 5).map((_, i) => (
                    <PaginationItem key={i}>
                      <PaginationLink href="#" isActive={page === i + 1} onClick={(e) => { e.preventDefault(); setSearch({ page: i + 1 }); }}>
                        {i + 1}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext href="#" onClick={(e) => { e.preventDefault(); setSearch({ page: Math.min(totalPages, page + 1) }); }} />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </section>

          {/* Right column */}
          <aside className="space-y-5">
            <CategoryBreakdownCard items={data.categoryBreakdown} />
            <UpcomingCard items={data.upcomingDueDates} />
            <RecurringCard items={data.recurringPayments} />
          </aside>
        </div>
      </main>

      <NewPaymentSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        categories={data.categories}
        accounts={data.accounts}
        onCreated={invalidate}
      />
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function FilterSelect({
  value, onChange, options, placeholder,
}: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-10 w-[140px]"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function CategoryBreakdownCard({ items }: { items: PayablesOverview["categoryBreakdown"] }) {
  const data = items.slice(0, 8);
  return (
    <div className="surface-card p-5">
      <h3 className="font-medium mb-4">Gastos por Categoria</h3>
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <div className="h-28 w-28 shrink-0">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={data} dataKey="total" innerRadius={36} outerRadius={54} stroke="none">
                {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="flex-1 min-w-0 w-full space-y-1.5 text-[13px]">
          {data.map((c, i) => (
            <li key={c.id} className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              <span className="w-9 text-right text-muted-foreground tabular-nums shrink-0">{c.pct.toFixed(0)}%</span>
              <span className="min-w-[88px] text-right tabular-nums font-medium whitespace-nowrap shrink-0">{formatBRL(c.total)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function UpcomingCard({ items }: { items: PayablesOverview["upcomingDueDates"] }) {
  return (
    <div className="surface-card p-5">
      <h3 className="font-medium mb-3">Próximos vencimentos</h3>
      <ul className="space-y-3">
        {items.length === 0 && <li className="text-sm text-muted-foreground">Nenhum vencimento próximo.</li>}
        {items.map(i => (
          <li key={i.id} className="flex items-center justify-between text-sm">
            <div className="min-w-0">
              <p className="font-medium truncate">{i.description}</p>
              <p className="text-xs text-muted-foreground">Vence em {i.days_until} dia{i.days_until === 1 ? "" : "s"}</p>
            </div>
            <span className="tabular-nums font-medium">{formatBRL(i.amount)}</span>
          </li>
        ))}
      </ul>
      <Button variant="ghost" size="sm" className="w-full mt-3">Ver todos</Button>
    </div>
  );
}

function RecurringCard({ items }: { items: PayablesOverview["recurringPayments"] }) {
  return (
    <div className="surface-card p-5">
      <h3 className="font-medium mb-3">Pagamentos recorrentes</h3>
      <ul className="space-y-3">
        {items.length === 0 && <li className="text-sm text-muted-foreground">Nenhum pagamento recorrente.</li>}
        {items.map(i => (
          <li key={i.id} className="flex items-center justify-between text-sm">
            <div className="min-w-0">
              <p className="font-medium truncate">{i.description}</p>
              <p className="text-xs text-muted-foreground">
                {i.recurrence_type === "weekly" ? "Semanal" : i.recurrence_type === "yearly" ? "Anual" : `Todo dia ${i.day_of_month ?? "—"}`}
              </p>
            </div>
            <span className="tabular-nums font-medium">{formatBRL(i.amount)}</span>
          </li>
        ))}
      </ul>
      <Button variant="ghost" size="sm" className="w-full mt-3">Ver todos</Button>
    </div>
  );
}
