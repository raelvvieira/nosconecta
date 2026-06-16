import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DollarSign, TrendingDown, BarChart3, Users } from "lucide-react";

import { Sidebar } from "@/components/finance/Sidebar";
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

import {
  getKpis,
  getCashFlowSeries,
  getRevenueByProcedure,
  getRevenueByDentist,
  getCommissions,
  getInsights,
  periodToRange,
} from "@/lib/finance/selectors";
import type { Granularity, Period } from "@/lib/finance/types";
import { formatBRL, formatDateBRFull } from "@/lib/finance/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Financeiro · OdontoCare" },
      { name: "description", content: "Visão geral financeira da clínica odontológica." },
    ],
  }),
  component: FinanceiroVisaoGeral,
});

function FinanceiroVisaoGeral() {
  const [period, setPeriod] = useState<Period>("30d");
  const [granularity, setGranularity] = useState<Granularity>("daily");

  const range = useMemo(() => periodToRange(period), [period]);
  const kpis = useMemo(() => getKpis(range), [range]);
  const cashFlow = useMemo(() => getCashFlowSeries(range, granularity), [range, granularity]);
  const procedures = useMemo(() => getRevenueByProcedure(range), [range]);
  const dentists = useMemo(() => getRevenueByDentist(range), [range]);
  const commissions = useMemo(() => getCommissions(range), [range]);
  const insights = useMemo(() => getInsights(range), [range]);

  const rangeLabel = `${formatDateBRFull(range.from.toISOString())} – ${formatDateBRFull(range.to.toISOString())}`;

  return (
    <div className="app-bg min-h-screen flex">
      <Sidebar />

      <main className="flex-1 min-w-0 px-6 lg:px-10 py-8 space-y-6">
        <PageHeader period={period} onPeriodChange={setPeriod} rangeLabel={rangeLabel} />

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          <KpiCard
            label="Receita"
            value={formatBRL(kpis.revenue.current)}
            icon={DollarSign}
            tone="success"
            deltaPct={kpis.revenue.deltaPct}
            footer={<span className="text-muted-foreground">vs mês anterior</span>}
          />
          <KpiCard
            label="Despesas"
            value={formatBRL(kpis.expenses.current)}
            icon={TrendingDown}
            tone="danger"
            deltaPct={kpis.expenses.deltaPct}
            footer={<span className="text-muted-foreground">vs mês anterior</span>}
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

        {/* Row 2 */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5">
          <CashFlowChart data={cashFlow} granularity={granularity} onGranularityChange={setGranularity} />
          <BankAccountsCard />
        </div>

        {/* Row 3 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <UpcomingReceivables />
          <UpcomingPayables />
          <InsightsCard insights={insights} />
        </div>

        {/* Row 4 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <RevenueByProcedure data={procedures} />
          <RevenueByDentist data={dentists} />
          <CommissionsTable data={commissions} />
        </div>
      </main>
    </div>
  );
}
