import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Plus, Upload, Share2, Wallet, CalendarDays, CalendarRange, Shield, Info } from "lucide-react";

import { Sidebar } from "@/components/finance/Sidebar";
import { KpiCard } from "@/components/finance/KpiCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

import { CashProjectionChart } from "@/components/finance/planning/CashProjectionChart";
import { ProjectionSummaryCard } from "@/components/finance/planning/ProjectionSummaryCard";
import { FinancialTimeline } from "@/components/finance/planning/FinancialTimeline";
import { ScenarioSimulator } from "@/components/finance/planning/ScenarioSimulator";
import { FinancialGoalsCard } from "@/components/finance/planning/FinancialGoalsCard";
import { SmartInsightsCard } from "@/components/finance/planning/SmartInsightsCard";

import {
  CURRENT_BALANCE, PROJECTED_30, PROJECTED_90, RUNWAY_DAYS,
  type RangeDays,
} from "@/components/finance/planning/planning-mock";
import { formatBRL } from "@/lib/finance/format";

const searchSchema = z.object({
  range: z.union([z.literal(30), z.literal(60), z.literal(90), z.literal(180)]).default(90),
});

export const Route = createFileRoute("/planejamento")({
  head: () => ({
    meta: [
      { title: "Planejamento Financeiro · NÓS Conecta" },
      { name: "description", content: "Projeções, cenários e previsões financeiras para sua clínica." },
    ],
  }),
  validateSearch: searchSchema,
  component: PlanningPage,
  errorComponent: ({ error }) => (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-2">
        <h1 className="text-xl font-semibold">Erro ao carregar planejamento</h1>
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
    </div>
  ),
});

function PlanningPage() {
  const { range } = Route.useSearch();
  const navigate = useNavigate({ from: "/planejamento" });

  const setRange = (r: RangeDays) =>
    navigate({ search: (prev: { range: RangeDays }) => ({ ...prev, range: r }) });

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen flex bg-background">
        <Sidebar />

        <main className="flex-1 min-w-0 px-6 lg:px-10 py-8 space-y-8">
          {/* Header */}
          <header className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-6">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Planejamento Financeiro</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Projeções, cenários e previsões para sua clínica
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button className="gap-2">
                <Plus className="h-4 w-4" /> Novo Cenário
              </Button>
              <Button variant="outline" className="gap-2">
                <Upload className="h-4 w-4" /> Exportar
              </Button>
              <Button variant="outline" className="gap-2">
                <Share2 className="h-4 w-4" /> Compartilhar
              </Button>
            </div>
          </header>

          {/* KPIs */}
          <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
            <KpiCard
              label="Saldo Atual"
              value={formatBRL(CURRENT_BALANCE)}
              icon={Wallet}
              tone="success"
              deltaPct={12}
              footer={<span className="text-muted-foreground">vs. mês anterior</span>}
            />
            <KpiCard
              label="Saldo Projetado 30 Dias"
              value={formatBRL(PROJECTED_30)}
              icon={CalendarDays}
              tone="violet"
              deltaPct={18}
              footer={<span className="text-muted-foreground">projeção</span>}
            />
            <KpiCard
              label="Saldo Projetado 90 Dias"
              value={formatBRL(PROJECTED_90)}
              icon={CalendarRange}
              tone="violet"
              deltaPct={34}
              footer={<span className="text-muted-foreground">projeção</span>}
            />

            <div className="surface-card p-6 flex flex-col gap-5 transition-shadow hover:shadow-lg">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-2xl grid place-items-center bg-warning-soft">
                  <Shield className="h-5 w-5 text-warning" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm text-muted-foreground">Fôlego Financeiro</p>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="text-muted-foreground hover:text-foreground">
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[260px] text-xs">
                        Com o saldo atual e o nível médio de despesas, a clínica consegue
                        operar por aproximadamente {RUNWAY_DAYS} dias sem novas receitas.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-2xl font-semibold tracking-tight tabular-nums mt-1">
                    {RUNWAY_DAYS} dias
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="bg-success-soft text-success border-0 font-medium">
                  ✓ Acima do recomendado
                </Badge>
              </div>
            </div>
          </section>

          {/* Chart + Summary */}
          <section className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <div className="xl:col-span-2">
              <CashProjectionChart range={range} onRangeChange={setRange} />
            </div>
            <div>
              <ProjectionSummaryCard />
            </div>
          </section>

          {/* Timeline + Scenarios + (Goals & Insights) */}
          <section className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <FinancialTimeline />
            <ScenarioSimulator />
            <div className="space-y-5">
              <FinancialGoalsCard />
              <SmartInsightsCard />
            </div>
          </section>
        </main>
      </div>
    </TooltipProvider>
  );
}
