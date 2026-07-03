import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import {
  Plus,
  Upload,
  Download,
  Search,
  Filter,
  MoreHorizontal,
  Check,
  Trash2,
  ArrowUpRight,
  ArrowDownRight,
  CalendarDays,
  TrendingUp,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { toast } from "sonner";

import { Sidebar } from "@/components/finance/Sidebar";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { useRegisterMobileFab } from "@/components/finance/mobile-fab-context";
import { KpiCard } from "@/components/finance/KpiCard";
import { DateRangePicker } from "@/components/finance/DateRangePicker";
import { NewPaymentSheet } from "@/components/finance/payables/NewPaymentSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

import {
  getPayablesOverview,
  markPayablePaid,
  deletePayable,
  type PayablesOverview,
  type PayableStatus,
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

const overviewOpts = (fetcher: (args: { data: any }) => Promise<PayablesOverview>, s: Search) =>
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
  errorComponent: () => <ResponsiveRouteState title="Não foi possível carregar os pagamentos" />,
  notFoundComponent: () => <ResponsiveRouteState title="Pagamentos não encontrados" notFound />,
  component: PagamentosPage,
});

const METHODS: Record<string, { label: string; color: string }> = {
  pix: { label: "PIX", color: "text-success" },
  boleto: { label: "Boleto", color: "text-warning" },
  ted: { label: "TED", color: "text-info" },
  cartao: { label: "Cartão", color: "text-violet" },
  dinheiro: { label: "Dinheiro", color: "text-foreground" },
};

const STATUS_BADGE: Record<string, "success" | "warning" | "danger" | "secondary"> = {
  paid: "success",
  pending: "warning",
  overdue: "danger",
  cancelled: "secondary",
};
const STATUS_LABEL: Record<string, string> = {
  paid: "Pago",
  pending: "Pendente",
  overdue: "Atrasado",
  cancelled: "Cancelado",
};

const CHART_COLORS = [
  "#FF7A59",
  "#F55F95",
  "#FFB086",
  "#7C5CFA",
  "#1F9D55",
  "#2F6FE0",
  "#C7821F",
  "#9A9AA1",
];

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

  useRegisterMobileFab({ label: "Novo Pagamento", onClick: () => setSheetOpen(true) });

  const setSearch = (patch: Partial<Search>) =>
    router.navigate({ to: "/pagamentos", search: (prev: Search) => ({ ...prev, ...patch }) });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["payables-overview"] });

  const markMutation = useMutation({
    mutationFn: (id: string) => markPaid({ data: { id } }),
    onSuccess: () => {
      toast.success("Pagamento marcado como pago");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Pagamento excluído");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const page = search.page ?? 1;
  const totalPages = Math.max(1, Math.ceil(data.transactions.length / PER_PAGE));
  const rows = data.transactions.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div className="app-bg h-screen flex overflow-hidden">
      <Sidebar />

      <main className="flex-1 min-w-0 overflow-y-auto custom-scroll px-4 md:px-8 lg:px-12 py-6 md:py-8 space-y-6 md:space-y-8 pb-24 lg:pb-8">
        {/* Header */}
        <header className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4 min-h-[80px]">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Pagamentos</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gerencie todas as despesas da clínica
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => setSheetOpen(true)}
              variant="premium"
              className="hidden lg:inline-flex"
            >
              <Plus className="h-4 w-4" /> Novo Pagamento
            </Button>
            <Button variant="secondary" className="hidden md:inline-flex">
              <Upload className="h-4 w-4" /> Importar
            </Button>
            <Button variant="secondary" className="hidden md:inline-flex">
              <Download className="h-4 w-4" /> Exportar
            </Button>
          </div>
        </header>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-5">
          <KpiCard
            label="Pago no período"
            value={formatBRL(data.kpis.paidInPeriod.current)}
            icon={ArrowDownRight}
            tone="success"
            deltaPct={data.kpis.paidInPeriod.deltaPct}
            footer={<span className="text-muted-foreground">vs período anterior</span>}
          />
          <KpiCard
            label="A pagar"
            value={formatBRL(data.kpis.toPay.total)}
            icon={CalendarDays}
            tone="warning"
            footer={
              <span className="inline-flex items-center px-2 py-1 rounded-full bg-warning-soft text-warning font-medium">
                {data.kpis.toPay.count} pagamentos
              </span>
            }
          />
          <KpiCard
            label="Em atraso"
            value={formatBRL(data.kpis.overdue.current)}
            icon={ArrowUpRight}
            tone="danger"
            deltaPct={data.kpis.overdue.deltaPct}
            footer={<span className="text-muted-foreground">vs mês anterior</span>}
          />
          <KpiCard
            label="Total previsto no período"
            value={formatBRL(data.kpis.forecastTotal)}
            icon={TrendingUp}
            tone="violet"
            highlight
            footer={<span className="text-muted-foreground">no intervalo selecionado</span>}
          />
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
          {/* Table card */}
          <section className="surface-card p-8 space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[240px] max-w-md">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar despesa..."
                  className="pl-11"
                  value={qLocal}
                  onChange={(e) => setQLocal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setSearch({ q: qLocal || undefined, page: 1 });
                  }}
                  onBlur={() => setSearch({ q: qLocal || undefined, page: 1 })}
                />
              </div>
              <Button variant="secondary">
                <Filter className="h-4 w-4" /> Filtros
              </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <FilterField label="Período">
                <DateRangePicker
                  from={search.from}
                  to={search.to}
                  onChange={(r) => setSearch({ from: r.from, to: r.to, page: 1 })}
                  className="h-11 px-4 rounded-[14px] border-[#ECECEC] bg-white"
                />
              </FilterField>
              <FilterField label="Categoria">
                <FilterSelect
                  value={search.category ?? "all"}
                  onChange={(v) => setSearch({ category: v === "all" ? undefined : v, page: 1 })}
                  placeholder="Todas"
                  options={[
                    { value: "all", label: "Todas" },
                    ...data.categories.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
              </FilterField>
              <FilterField label="Conta">
                <FilterSelect
                  value={search.account ?? "all"}
                  onChange={(v) => setSearch({ account: v === "all" ? undefined : v, page: 1 })}
                  placeholder="Todas"
                  options={[
                    { value: "all", label: "Todas" },
                    ...data.accounts.map((a) => ({ value: a.id, label: a.name })),
                  ]}
                />
              </FilterField>
              <FilterField label="Fornecedor">
                <FilterSelect
                  value={search.supplier ?? "all"}
                  onChange={(v) => setSearch({ supplier: v === "all" ? undefined : v, page: 1 })}
                  placeholder="Todos"
                  options={[
                    { value: "all", label: "Todos" },
                    ...data.suppliers.map((s) => ({ value: s, label: s })),
                  ]}
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
                  options={[
                    { value: "all", label: "Todos" },
                    ...Object.entries(METHODS).map(([k, v]) => ({ value: k, label: v.label })),
                  ]}
                />
              </FilterField>
            </div>

            {/* Table */}
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="py-3 px-3 w-8 font-medium">
                      <Checkbox
                        checked={rows.length > 0 && rows.every((r) => selected.has(r.id))}
                        onCheckedChange={(c) => {
                          const next = new Set(selected);
                          if (c) rows.forEach((r) => next.add(r.id));
                          else rows.forEach((r) => next.delete(r.id));
                          setSelected(next);
                        }}
                      />
                    </th>
                    <th className="py-3 pr-4 font-medium">Vencimento</th>
                    <th className="py-3 pr-4 font-medium">Fornecedor</th>
                    <th className="py-3 pr-4 font-medium">Categoria</th>
                    <th className="py-3 pr-4 font-medium">Conta</th>
                    <th className="py-3 pr-4 font-medium">Valor</th>
                    <th className="py-3 pr-4 font-medium">Status</th>
                    <th className="py-3 pr-4 font-medium">Método</th>
                    <th className="py-3 pr-4 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-16 text-center text-muted-foreground">
                        Nenhum pagamento encontrado.
                      </td>
                    </tr>
                  )}
                  {rows.map((t) => {
                    const status = t.effective_status;
                    const method = METHODS[t.payment_method ?? ""] ?? {
                      label: t.payment_method ?? "—",
                      color: "text-foreground",
                    };
                    const supplierInitials = (t.supplier_name ?? "??")
                      .split(" ")
                      .map((s) => s[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase();
                    return (
                      <tr
                        key={t.id}
                        className="border-t border-[#F5F5F5] hover:bg-[#FAFAFA] transition-colors h-[72px]"
                      >
                        <td className="px-3">
                          <Checkbox
                            checked={selected.has(t.id)}
                            onCheckedChange={(c) => {
                              const next = new Set(selected);
                              if (c) next.add(t.id);
                              else next.delete(t.id);
                              setSelected(next);
                            }}
                          />
                        </td>
                        <td
                          className={cn(
                            "pr-4 tabular-nums text-foreground",
                            status === "overdue" && "text-danger font-medium",
                          )}
                        >
                          {fmtDate(t.due_date)}
                        </td>
                        <td className="pr-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-9 w-9 shrink-0 rounded-full bg-[#F2F2F4] text-foreground grid place-items-center text-[11px] font-semibold">
                              {supplierInitials}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium truncate">{t.supplier_name ?? "—"}</div>
                              <div className="text-xs text-muted-foreground truncate">
                                {t.description}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="pr-4">
                          {t.category_name && <Badge variant="default">{t.category_name}</Badge>}
                        </td>
                        <td className="pr-4 text-muted-foreground">{t.account_name ?? "—"}</td>
                        <td className="pr-4 tabular-nums font-semibold">{formatBRL(t.amount)}</td>
                        <td className="pr-4">
                          <Badge variant={STATUS_BADGE[status]}>{STATUS_LABEL[status]}</Badge>
                        </td>
                        <td className={cn("pr-4 font-medium", method.color)}>
                          {t.payment_method ? method.label : "—"}
                        </td>
                        <td className="pr-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="h-9 w-9 grid place-items-center rounded-full hover:bg-[#F2F2F4] text-muted-foreground">
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {status !== "paid" && (
                                <DropdownMenuItem onClick={() => markMutation.mutate(t.id)}>
                                  <Check className="h-4 w-4 mr-2" /> Marcar como pago
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                className="text-danger"
                                onClick={() => deleteMutation.mutate(t.id)}
                              >
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

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <p className="text-xs text-muted-foreground">
                Mostrando {rows.length === 0 ? 0 : (page - 1) * PER_PAGE + 1} a{" "}
                {(page - 1) * PER_PAGE + rows.length} de {data.transactions.length} resultados
              </p>
              <Pagination className="m-0 w-auto">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setSearch({ page: Math.max(1, page - 1) });
                      }}
                    />
                  </PaginationItem>
                  {Array.from({ length: totalPages })
                    .slice(0, 5)
                    .map((_, i) => (
                      <PaginationItem key={i}>
                        <PaginationLink
                          href="#"
                          isActive={page === i + 1}
                          onClick={(e) => {
                            e.preventDefault();
                            setSearch({ page: i + 1 });
                          }}
                        >
                          {i + 1}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setSearch({ page: Math.min(totalPages, page + 1) });
                      }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </section>

          {/* Right column */}
          <aside className="space-y-6">
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
        suppliers={data.suppliers}
        onCreated={invalidate}
        onCategoriesChanged={invalidate}
        onAccountsChanged={invalidate}
      />
    </div>
  );
}

/* ---------------- Filters ---------------- */

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 min-w-0">
      <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      {children}
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/* ---------------- Sidebar cards ---------------- */

function CategoryBreakdownCard({ items }: { items: PayablesOverview["categoryBreakdown"] }) {
  const data = items.slice(0, 7);
  return (
    <div className="surface-card p-6">
      <h3 className="font-semibold text-base mb-5">Gastos por Categoria</h3>
      <div className="flex items-center gap-5">
        <div className="h-[120px] w-[120px] shrink-0">
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={data}
                dataKey="total"
                innerRadius={42}
                outerRadius={58}
                paddingAngle={2}
                stroke="none"
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="flex-1 min-w-0 space-y-2 text-[13px]">
          {data.map((c, i) => (
            <li key={c.id} className="flex items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
              />
              <span className="min-w-0 flex-1 truncate text-foreground">{c.name}</span>
              <span className="text-muted-foreground tabular-nums shrink-0 w-9 text-right">
                {c.pct.toFixed(0)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function UpcomingCard({ items }: { items: PayablesOverview["upcomingDueDates"] }) {
  return (
    <div className="surface-card p-6">
      <h3 className="font-semibold text-base mb-4">Próximos vencimentos</h3>
      <ul className="space-y-4">
        {items.length === 0 && (
          <li className="text-sm text-muted-foreground">Nenhum vencimento próximo.</li>
        )}
        {items.map((i) => (
          <li key={i.id} className="flex items-center justify-between text-sm gap-3">
            <div className="min-w-0">
              <p className="font-medium truncate">{i.description}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Vence em {i.days_until} dia{i.days_until === 1 ? "" : "s"}
              </p>
            </div>
            <span className="tabular-nums font-semibold shrink-0">{formatBRL(i.amount)}</span>
          </li>
        ))}
      </ul>
      <Button variant="secondary" className="w-full mt-5">
        Ver todos
      </Button>
    </div>
  );
}

function RecurringCard({ items }: { items: PayablesOverview["recurringPayments"] }) {
  return (
    <div className="surface-card p-6">
      <h3 className="font-semibold text-base mb-4">Pagamentos recorrentes</h3>
      <ul className="space-y-4">
        {items.length === 0 && (
          <li className="text-sm text-muted-foreground">Nenhum pagamento recorrente.</li>
        )}
        {items.map((i) => (
          <li key={i.id} className="flex items-center justify-between text-sm gap-3">
            <div className="min-w-0">
              <p className="font-medium truncate">{i.description}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {i.recurrence_type === "weekly"
                  ? "Semanal"
                  : i.recurrence_type === "yearly"
                    ? "Anual"
                    : `Todo dia ${i.day_of_month ?? "—"}`}
              </p>
            </div>
            <span className="tabular-nums font-semibold shrink-0">{formatBRL(i.amount)}</span>
          </li>
        ))}
      </ul>
      <Button variant="secondary" className="w-full mt-5">
        Ver todos
      </Button>
    </div>
  );
}
