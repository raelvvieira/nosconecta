import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import {
  Plus, ClipboardCheck, Download, ArrowDownCircle, CalendarDays, AlertCircle, Wallet,
  Search, Filter, MoreHorizontal, Check, Trash2, Ban,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { toast } from "sonner";

import { Sidebar } from "@/components/finance/Sidebar";
import { DateRangePicker } from "@/components/finance/DateRangePicker";
import { KpiCard } from "@/components/finance/KpiCard";
import { NewReceivableSheet } from "@/components/finance/receivables/NewReceivableSheet";
import { RegisterReceiptDialog } from "@/components/finance/receivables/RegisterReceiptDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/finance/format";
import {
  getReceivablesOverview, markReceivableReceived, deleteReceivable, cancelReceivable,
  type ReceivablesOverview, type ReceivableStatus,
} from "@/lib/finance/receivables.functions";

const searchSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  patient: z.string().optional(),
  professional: z.string().optional(),
  procedure: z.string().optional(),
  account: z.string().optional(),
  status: z.enum(["all", "received", "pending", "overdue", "installments", "recurring"]).default("all"),
  method: z.string().optional(),
  q: z.string().optional(),
  page: z.number().optional(),
});
type Search = z.infer<typeof searchSchema>;

const PER_PAGE = 8;

const PAYMENT_METHODS: Record<string, { label: string; color: string }> = {
  pix: { label: "PIX", color: "text-emerald-600" },
  credit: { label: "Cartão de Crédito", color: "text-violet" },
  debit: { label: "Cartão de Débito", color: "text-sky-600" },
  cash: { label: "Dinheiro", color: "text-foreground" },
  boleto: { label: "Boleto", color: "text-amber-600" },
  transfer: { label: "Transferência", color: "text-info" },
};
const STATUS_BADGE: Record<string, string> = {
  paid: "bg-success-soft text-success",
  pending: "bg-warning-soft text-warning",
  overdue: "bg-danger-soft text-danger",
  cancelled: "bg-muted text-muted-foreground",
};
const STATUS_LABEL: Record<string, string> = {
  paid: "Recebido", pending: "Pendente", overdue: "Atrasado", cancelled: "Cancelado",
};

const PROC_COLORS = ["#7c3aed", "#06b6d4", "#f97316", "#22c55e", "#ec4899", "#eab308", "#94a3b8"];

const overviewOpts = (fetcher: (args: { data: any }) => Promise<ReceivablesOverview>, s: Search) =>
  queryOptions({
    queryKey: ["receivables-overview", s],
    queryFn: () => fetcher({ data: s }),
    staleTime: 15_000,
  });

export const Route = createFileRoute("/recebimentos")({
  head: () => ({
    meta: [
      { title: "Recebimentos · NÓS Conecta" },
      { name: "description", content: "Acompanhe todas as entradas financeiras da clínica." },
    ],
  }),
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(overviewOpts(getReceivablesOverview as any, deps)),
  errorComponent: ({ error }) => (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-2">
        <h1 className="text-xl font-semibold">Erro ao carregar recebimentos</h1>
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
    </div>
  ),
  notFoundComponent: () => <div className="p-8">Página não encontrada.</div>,
  component: RecebimentosPage,
});

const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR");

function RecebimentosPage() {
  const search = Route.useSearch();
  const router = useRouter();
  const qc = useQueryClient();

  const fetchOverview = useServerFn(getReceivablesOverview);
  const markFn = useServerFn(markReceivableReceived);
  const cancelFn = useServerFn(cancelReceivable);
  const deleteFn = useServerFn(deleteReceivable);

  const { data } = useSuspenseQuery(overviewOpts(fetchOverview as any, search));

  const [sheetOpen, setSheetOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptTarget, setReceiptTarget] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [qLocal, setQLocal] = useState(search.q ?? "");

  const setSearch = (patch: Partial<Search>) =>
    router.navigate({ to: "/recebimentos", search: (prev: Search) => ({ ...prev, ...patch }) });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["receivables-overview"] });

  const markMutation = useMutation({
    mutationFn: (id: string) => markFn({ data: { id } }),
    onSuccess: () => { toast.success("Recebimento confirmado"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => { toast.success("Recebimento cancelado"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { toast.success("Recebimento excluído"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const page = search.page ?? 1;
  const totalPages = Math.max(1, Math.ceil(data.transactions.length / PER_PAGE));
  const rows = data.transactions.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const openReceipt = (id: string) => { setReceiptTarget(id); setReceiptOpen(true); };

  return (
    <div className="app-bg min-h-screen flex">
      <Sidebar />

      <main className="flex-1 min-w-0 px-4 md:px-6 lg:px-10 py-6 md:py-8 space-y-6 pb-24 lg:pb-8">
        <header className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Recebimentos</h1>
            <p className="text-sm text-muted-foreground mt-1">Acompanhe todas as entradas financeiras da clínica</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setSheetOpen(true)} variant="premium">
              <Plus className="h-4 w-4" /> Novo Recebimento
            </Button>
            <Button variant="outline" className="hidden md:inline-flex gap-2" onClick={() => { setReceiptTarget(null); setReceiptOpen(true); }}>
              <ClipboardCheck className="h-4 w-4" /> Registrar Recebimento
            </Button>
            <Button variant="outline" className="hidden md:inline-flex gap-2" onClick={() => toast.success("Exportação iniciada")}>
              <Download className="h-4 w-4" /> Exportar
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-1 2xl:grid-cols-[1fr_340px] gap-5">
          <div className="space-y-5 min-w-0">
            {/* KPIs */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-5">
              <KpiCard
                label="Recebido no período"
                value={formatBRL(data.kpis.receivedInPeriod.current)}
                icon={ArrowDownCircle}
                tone="success"
                deltaPct={data.kpis.receivedInPeriod.deltaPct}
                footer={<span className="text-muted-foreground">vs período anterior</span>}
              />
              <KpiCard
                label="A receber"
                value={formatBRL(data.kpis.toReceive.total)}
                icon={CalendarDays}
                tone="warning"
                footer={
                  <span className="inline-flex items-center px-2 py-1 rounded-full bg-warning-soft text-warning font-medium">
                    {data.kpis.toReceive.count} parcelas futuras
                  </span>
                }
              />
              <KpiCard
                label="Em atraso"
                value={formatBRL(data.kpis.overdue.total)}
                icon={AlertCircle}
                tone="danger"
                footer={
                  <span className="inline-flex items-center px-2 py-1 rounded-full bg-danger-soft text-danger font-medium">
                    {data.kpis.overdue.patients} pacientes inadimplentes
                  </span>
                }
              />
              <KpiCard
                label="Ticket médio"
                value={formatBRL(data.kpis.averageTicket)}
                icon={Wallet}
                tone="violet"
                footer={<span className="text-muted-foreground">Período</span>}
              />
            </div>

            {/* Evolution chart */}
            <section className="surface-card p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold">Evolução de Recebimentos</h2>
              </div>
              <div className="h-[320px]">
                <ResponsiveContainer>
                  <ComposedChart data={data.evolution} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="period" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false}
                      tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                      formatter={(v: number, name) => [formatBRL(v), name]}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingBottom: 12 }} />
                    <Bar dataKey="received" name="Recebido" stackId="a" fill="#86efac" />
                    <Bar dataKey="expected" name="Previsto" stackId="a" fill="#fcd34d" />
                    <Bar dataKey="overdue" name="Atrasado" stackId="a" fill="#fca5a5" radius={[6, 6, 0, 0]} />
                    <Line type="monotone" dataKey="goal" name="Meta mensal" stroke="#60a5fa" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Filters + tabs + table */}
            <section className="surface-card p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar paciente ou descrição..."
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
                <FilterField label="Paciente">
                  <FilterSelect
                    value={search.patient ?? "all"}
                    onChange={(v) => setSearch({ patient: v === "all" ? undefined : v, page: 1 })}
                    options={[{ value: "all", label: "Todos" }, ...data.patients.map(p => ({ value: p.id, label: p.name }))]}
                  />
                </FilterField>
                <FilterField label="Profissional">
                  <FilterSelect
                    value={search.professional ?? "all"}
                    onChange={(v) => setSearch({ professional: v === "all" ? undefined : v, page: 1 })}
                    options={[{ value: "all", label: "Todos" }, ...data.professionals.map(p => ({ value: p.id, label: p.name }))]}
                  />
                </FilterField>
                <FilterField label="Procedimento">
                  <FilterSelect
                    value={search.procedure ?? "all"}
                    onChange={(v) => setSearch({ procedure: v === "all" ? undefined : v, page: 1 })}
                    options={[{ value: "all", label: "Todos" }, ...data.categories.map(c => ({ value: c.id, label: c.name }))]}
                  />
                </FilterField>
                <FilterField label="Conta">
                  <FilterSelect
                    value={search.account ?? "all"}
                    onChange={(v) => setSearch({ account: v === "all" ? undefined : v, page: 1 })}
                    options={[{ value: "all", label: "Todas" }, ...data.accounts.map(a => ({ value: a.id, label: a.name }))]}
                  />
                </FilterField>
                <FilterField label="Forma de pagamento">
                  <FilterSelect
                    value={search.method ?? "all"}
                    onChange={(v) => setSearch({ method: v === "all" ? undefined : v, page: 1 })}
                    options={[{ value: "all", label: "Todos" }, ...Object.entries(PAYMENT_METHODS).map(([k, v]) => ({ value: k, label: v.label }))]}
                  />
                </FilterField>
                <Button variant="outline" className="h-10 gap-2"><Filter className="h-4 w-4" /> Mais filtros</Button>
              </div>

              <Tabs value={search.status} onValueChange={(v) => setSearch({ status: v as ReceivableStatus, page: 1 })}>
                <TabsList className="bg-transparent p-0 h-auto border-b w-full justify-start rounded-none gap-1">
                  {[
                    { v: "all", l: "Todos" },
                    { v: "received", l: "Recebidos" },
                    { v: "pending", l: "Pendentes" },
                    { v: "overdue", l: "Atrasados" },
                    { v: "installments", l: "Parcelados" },
                    { v: "recurring", l: "Recorrentes" },
                  ].map(t => (
                    <TabsTrigger
                      key={t.v}
                      value={t.v}
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none px-4 py-2.5 text-sm text-muted-foreground"
                    >
                      {t.l}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

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
                      <th className="py-3 pr-4">Paciente</th>
                      <th className="py-3 pr-4">Procedimento</th>
                      <th className="py-3 pr-4">Profissional</th>
                      <th className="py-3 pr-4">Valor</th>
                      <th className="py-3 pr-4">Vencimento</th>
                      <th className="py-3 pr-4">Status</th>
                      <th className="py-3 pr-4">Forma de Pagamento</th>
                      <th className="py-3 pr-4">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && (
                      <tr><td colSpan={9} className="py-12 text-center text-muted-foreground">Nenhum recebimento encontrado.</td></tr>
                    )}
                    {rows.map((r) => {
                      const method = PAYMENT_METHODS[r.payment_method ?? ""] ?? { label: r.payment_method ?? "—", color: "text-foreground" };
                      const status = r.effective_status;
                      const initials = (r.patient_name ?? "??").split(" ").slice(0, 2).map(p => p[0] ?? "").join("").toUpperCase();
                      return (
                        <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-3 px-3">
                            <Checkbox
                              checked={selected.has(r.id)}
                              onCheckedChange={(c) => {
                                const next = new Set(selected);
                                if (c) next.add(r.id); else next.delete(r.id);
                                setSelected(next);
                              }}
                            />
                          </td>
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2.5">
                              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-soft to-primary/20 text-primary grid place-items-center text-xs font-semibold">
                                {initials}
                              </div>
                              <span className="font-medium">{r.patient_name ?? "—"}</span>
                            </div>
                          </td>
                          <td className="py-3 pr-4">
                            <div>{r.category_name ?? r.description}</div>
                            {r.installment_total && (
                              <div className="text-xs text-muted-foreground">{r.installment_number}/{r.installment_total}</div>
                            )}
                          </td>
                          <td className="py-3 pr-4 text-muted-foreground">{r.professional_name ?? "—"}</td>
                          <td className="py-3 pr-4 tabular-nums font-medium">{formatBRL(r.amount)}</td>
                          <td className={cn("py-3 pr-4 tabular-nums", status === "overdue" && "text-danger font-medium")}>
                            {fmtDate(r.due_date)}
                          </td>
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
                                  <DropdownMenuItem onClick={() => openReceipt(r.id)}>
                                    <Check className="h-4 w-4 mr-2" /> Registrar recebimento
                                  </DropdownMenuItem>
                                )}
                                {status !== "paid" && (
                                  <DropdownMenuItem onClick={() => markMutation.mutate(r.id)}>
                                    <Check className="h-4 w-4 mr-2" /> Marcar como recebido (hoje)
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                {status !== "cancelled" && (
                                  <DropdownMenuItem onClick={() => cancelMutation.mutate(r.id)}>
                                    <Ban className="h-4 w-4 mr-2" /> Cancelar
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem className="text-danger" onClick={() => deleteMutation.mutate(r.id)}>
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
          </div>

          {/* Right column */}
          <aside className="space-y-5">
            <TopProceduresCard items={data.topProcedures} />
            <TopDentistsCard items={data.topDentists} />
            <DefaultersCard items={data.defaulters} />
            <RecurringCard items={data.recurringReceivables} />
          </aside>
        </div>
      </main>

      <NewReceivableSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        patients={data.patients}
        professionals={data.professionals}
        categories={data.categories}
        accounts={data.accounts}
        onCreated={invalidate}
      />
      <RegisterReceiptDialog
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        transactionId={receiptTarget}
        accounts={data.accounts}
        onConfirmed={invalidate}
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
  value, onChange, options,
}: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-10 w-[160px]"><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function TopProceduresCard({ items }: { items: ReceivablesOverview["topProcedures"] }) {
  const data = items.slice(0, 6);
  return (
    <div className="surface-card p-5">
      <h3 className="font-medium mb-4">Top procedimentos</h3>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem dados no período.</p>
      ) : (
        <div className="flex items-center gap-4">
          <div className="h-32 w-32 shrink-0">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={data} dataKey="value" innerRadius={40} outerRadius={60} stroke="none">
                  {data.map((_, i) => <Cell key={i} fill={PROC_COLORS[i % PROC_COLORS.length]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex-1 space-y-1.5 text-sm min-w-0">
            {data.map((p, i) => (
              <li key={p.id} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: PROC_COLORS[i % PROC_COLORS.length] }} />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="text-muted-foreground tabular-nums">{p.pct.toFixed(0)}%</span>
                <span className="tabular-nums font-medium">{formatBRL(p.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TopDentistsCard({ items }: { items: ReceivablesOverview["topDentists"] }) {
  return (
    <div className="surface-card p-5">
      <h3 className="font-medium mb-3">Top dentistas</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem dados no período.</p>
      ) : (
        <ul className="space-y-3">
          {items.slice(0, 6).map((d) => (
            <li key={d.id} className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-info to-violet text-white grid place-items-center text-xs font-semibold">
                {d.initials}
              </div>
              <span className="flex-1 text-sm font-medium truncate">{d.name}</span>
              <span className="text-sm tabular-nums font-medium">{formatBRL(d.value)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DefaultersCard({ items }: { items: ReceivablesOverview["defaulters"] }) {
  return (
    <div className="surface-card p-5">
      <h3 className="font-medium mb-3">Pacientes inadimplentes</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum inadimplente.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4 text-danger shrink-0" />
              <span className="flex-1 truncate">{d.name}</span>
              <span className="tabular-nums font-medium">{formatBRL(d.value)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RecurringCard({ items }: { items: ReceivablesOverview["recurringReceivables"] }) {
  return (
    <div className="surface-card p-5">
      <h3 className="font-medium mb-3">Recebimentos recorrentes</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum recebimento recorrente.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((r) => (
            <li key={r.id} className="text-sm">
              <p className="font-medium truncate">{r.description}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {r.recurrence_type === "weekly" ? "Semanal" : r.recurrence_type === "yearly" ? "Anual" : `Todo dia ${r.day_of_month ?? "—"}`}
                </span>
                <span className="tabular-nums font-medium">{formatBRL(r.amount)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
