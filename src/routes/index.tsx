import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useEffect } from "react";
import { DollarSign, TrendingDown, BarChart3, Users } from "lucide-react";

import { Sidebar } from "@/components/finance/Sidebar";
import { MobileHome } from "@/components/home/MobileHome";
import { PageHeader } from "@/components/finance/PageHeader";
import { KpiCard } from "@/components/finance/KpiCard";
import { CashFlowChart } from "@/components/finance/CashFlowChart";
import { BankAccountsCard } from "@/components/finance/BankAccountsCard";
import { UpcomingReceivables } from "@/components/finance/UpcomingReceivables";
import { UpcomingPayables } from "@/components/finance/UpcomingPayables";
import { InsightsCard } from "@/components/finance/InsightsCard";
import { RevenueByProcedure } from "@/components/finance/RevenueByProcedure";
import { RevenueByDentist } from "@/components/finance/RevenueByDentist";
import { CommissionsTable } from "@/components/finance/CommissionsTable";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";

import { z } from "zod";
import { getFinanceOverview, type Granularity, type Period } from "@/lib/finance/queries.functions";
import { formatBRL } from "@/lib/finance/format";

const searchSchema = z.object({
  period: z.enum(["today", "7d", "30d", "90d"]).default("30d"),
  granularity: z.enum(["daily", "weekly", "monthly"]).default("daily"),
  from: z.string().optional(),
  to: z.string().optional(),
});

type SearchParams = z.infer<typeof searchSchema>;

const overviewQueryOptions = (
  fetcher: (args: {
    data: { period: Period; granularity: Granularity; from?: string; to?: string };
  }) => Promise<Awaited<ReturnType<typeof getFinanceOverview>>>,
  params: { period: Period; granularity: Granularity; from?: string; to?: string },
) =>
  queryOptions({
    queryKey: [
      "finance-overview",
      params.period,
      params.granularity,
      params.from ?? "",
      params.to ?? "",
    ],
    queryFn: () => fetcher({ data: params }),
    staleTime: 30_000,
  });

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Financeiro · NÓS Conecta" },
      { name: "description", content: "Visão geral financeira da clínica odontológica." },
    ],
  }),
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({
    period: search.period,
    granularity: search.granularity,
    from: search.from,
    to: search.to,
  }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(overviewQueryOptions(getFinanceOverview as any, deps)),
  errorComponent: () => <ResponsiveRouteState title="Não foi possível carregar o dashboard" />,
  notFoundComponent: () => <ResponsiveRouteState title="Dashboard não encontrado" notFound />,
  component: FinanceiroVisaoGeral,
});

function FinanceiroVisaoGeral() {
  const { period, granularity, from, to } = Route.useSearch();
  const router = useRouter();
  const fetchOverview = useServerFn(getFinanceOverview);
  const { data } = useSuspenseQuery(
    overviewQueryOptions(fetchOverview as any, { period, granularity, from, to }),
  );

  useEffect(() => {
    document.title = "Financeiro · NÓS Conecta";
  }, []);

  const setPeriod = (p: Period) =>
    router.navigate({
      to: "/",
      search: (prev: SearchParams) => ({ ...prev, period: p, from: undefined, to: undefined }),
    });
  const setGranularity = (g: Granularity) =>
    router.navigate({ to: "/", search: (prev: SearchParams) => ({ ...prev, granularity: g }) });
  const setRange = (r: { from?: string; to?: string }) =>
    router.navigate({
      to: "/",
      search: (prev: SearchParams) => ({ ...prev, from: r.from, to: r.to }),
    });

  const { kpis } = data;

  return (
    <div className="app-bg h-screen flex overflow-hidden">
      <Sidebar />

      <MobileHome />

      <main className="hidden lg:block flex-1 min-w-0 overflow-y-auto custom-scroll px-4 md:px-6 lg:px-10 py-6 md:py-8 space-y-6 pb-24 lg:pb-8">
        <PageHeader
          period={period}
          onPeriodChange={setPeriod}
          from={from}
          to={to}
          onRangeChange={setRange}
        />

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-5">
          <KpiCard
            label="Receita"
            value={formatBRL(kpis.revenue.current)}
            icon={DollarSign}
            tone="success"
            deltaPct={kpis.revenue.deltaPct}
            footer={<span className="text-muted-foreground">vs período anterior</span>}
          />
          <KpiCard
            label="Despesas"
            value={formatBRL(kpis.expenses.current)}
            icon={TrendingDown}
            tone="danger"
            deltaPct={kpis.expenses.deltaPct}
            footer={<span className="text-muted-foreground">vs período anterior</span>}
          />
          <KpiCard
            label="Lucro Líquido"
            value={formatBRL(kpis.profit.current)}
            icon={BarChart3}
            tone="violet"
            highlight
            footer={
              <span className="inline-flex items-center px-2 py-1 rounded-full bg-violet-soft text-violet font-medium">
                Margem {kpis.margin.toFixed(0)}%
              </span>
            }
          />
          <KpiCard
            label="Inadimplência"
            value={formatBRL(kpis.overdue.total)}
            icon={Users}
            tone="warning"
            footer={
              <span className="inline-flex items-center px-2 py-1 rounded-full bg-warning-soft text-warning font-medium">
                {kpis.overdue.patients} pacientes
              </span>
            }
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5">
          <CashFlowChart
            data={data.cashFlow}
            granularity={granularity}
            onGranularityChange={setGranularity}
          />
          <BankAccountsCard accounts={data.accounts} total={data.totalAvailable} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <UpcomingReceivables items={data.upcomingReceivables} />
          <UpcomingPayables items={data.upcomingPayables} />
          <InsightsCard insights={data.insights} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <RevenueByProcedure data={data.procedures} />
          <RevenueByDentist data={data.dentists} />
          <CommissionsTable data={data.commissions} />
        </div>
      </main>
    </div>
  );
}
