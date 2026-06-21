import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Upload, Share2, Wallet, CalendarDays, CalendarRange, Shield, Info } from "lucide-react";

import { Sidebar } from "@/components/finance/Sidebar";
import { useRegisterMobileFab } from "@/components/finance/mobile-fab-context";
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
  getPlanningOverview, deleteScenario, generateMoreInsights,
  type PlanningOverview, type RangeDays, type Insight,
} from "@/lib/finance/planning.functions";
import { formatBRL } from "@/lib/finance/format";

const searchSchema = z.object({
  range: z.union([z.literal(30), z.literal(60), z.literal(90), z.literal(180)]).default(90),
});

const overviewOpts = (fetcher: (args: { data: any }) => Promise<PlanningOverview>, period: RangeDays) =>
  queryOptions({
    queryKey: ["planning-overview", period],
    queryFn: () => fetcher({ data: { period } }),
    staleTime: 15_000,
  });

export const Route = createFileRoute("/planejamento")({
  head: () => ({
    meta: [
      { title: "Planejamento Financeiro · NÓS Conecta" },
      { name: "description", content: "Projeções, cenários e previsões financeiras para sua clínica." },
    ],
  }),
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ range: search.range }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(overviewOpts(getPlanningOverview as any, deps.range)),
  errorComponent: ({ error }) => (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-2">
        <h1 className="text-xl font-semibold">Erro ao carregar planejamento</h1>
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
    </div>
  ),
  notFoundComponent: () => <div className="p-8">Página não encontrada.</div>,
  component: PlanningPage,
});

function PlanningPage() {
  const { range } = Route.useSearch();
  const navigate = useNavigate({ from: "/planejamento" });
  const qc = useQueryClient();

  const fetchOverview = useServerFn(getPlanningOverview);
  const deleteScenarioFn = useServerFn(deleteScenario);
  const generateMoreFn = useServerFn(generateMoreInsights);

  const { data } = useSuspenseQuery(overviewOpts(fetchOverview as any, range));

  const setRange = (r: RangeDays) =>
    navigate({ search: (prev: { range: RangeDays }) => ({ ...prev, range: r }) });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteScenarioFn({ data: { id } }) as Promise<{ ok: boolean }>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planning-overview"] });
      toast.success("Cenário excluído");
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao excluir cenário"),
  });

  const generateMoreMutation = useMutation({
    mutationFn: (excludeIds: string[]) => generateMoreFn({ data: { excludeIds } }) as Promise<Insight[]>,
    onSuccess: (newOnes) => {
      toast.success(`${newOnes.length} novos insights gerados`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao gerar insights"),
  });

  const { summary, projection, forecast, timeline, goals, scenarios, insights } = data;

  const handleNewScenario = () => toast.info("Em breve: criação de novos cenários");
  useRegisterMobileFab({ label: "Novo Cenário", onClick: handleNewScenario });

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen flex bg-background">
        <Sidebar />

        <main className="flex-1 min-w-0 px-6 lg:px-10 py-8 space-y-8 pb-28 lg:pb-8">
          {/* Header */}
          <header className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-6">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Planejamento Financeiro</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Projeções, cenários e previsões para sua clínica
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button className="gap-2 hidden lg:inline-flex" onClick={handleNewScenario}>
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
          <section className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-5">
            <KpiCard
              label="Saldo Atual"
              value={formatBRL(summary.currentBalance)}
              icon={Wallet}
              tone="success"
              deltaPct={summary.deltaVsPreviousMonthPct}
              footer={<span className="text-muted-foreground">vs. mês anterior</span>}
            />
            <KpiCard
              label="Saldo Projetado 30 Dias"
              value={formatBRL(summary.projectedBalance30)}
              icon={CalendarDays}
              tone="violet"
              deltaPct={summary.projected30DeltaPct}
              footer={<span className="text-muted-foreground">projeção</span>}
            />
            <KpiCard
              label="Saldo Projetado 90 Dias"
              value={formatBRL(summary.projectedBalance90)}
              icon={CalendarRange}
              tone="violet"
              deltaPct={summary.projected90DeltaPct}
              footer={<span className="text-muted-foreground">projeção</span>}
            />

            <div className="surface-card p-4 md:p-6 flex flex-col gap-3 md:gap-5 transition-shadow hover:shadow-lg">
              <div className="flex items-start gap-3 md:gap-4">
                <div className="h-9 w-9 md:h-12 md:w-12 rounded-xl md:rounded-2xl grid place-items-center bg-warning-soft shrink-0">
                  <Shield className="h-4 w-4 md:h-5 md:w-5 text-warning" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[11px] md:text-sm text-muted-foreground">Fôlego Financeiro</p>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="text-muted-foreground hover:text-foreground">
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[260px] text-xs">
                        Com o saldo atual e o nível médio de despesas, a clínica consegue
                        operar por aproximadamente {summary.financialRunwayDays} dias sem novas receitas.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="hidden md:block text-2xl font-semibold tracking-tight tabular-nums mt-1">
                    {summary.financialRunwayDays} dias
                  </p>
                </div>
              </div>
              <p className="md:hidden text-sm font-semibold tracking-tight tabular-nums leading-none">
                {summary.financialRunwayDays} dias
              </p>
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className={`border-0 font-medium ${summary.financialRunwayDays >= 60 ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>
                  {summary.financialRunwayDays >= 60 ? "✓ Acima do recomendado" : "Atenção ao caixa"}
                </Badge>
              </div>
            </div>
          </section>

          {/* Chart + Summary */}
          <section className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <div className="xl:col-span-2">
              <CashProjectionChart data={projection} range={range} onRangeChange={setRange} />
            </div>
            <div>
              <ProjectionSummaryCard forecast={forecast} />
            </div>
          </section>

          {/* Timeline + Scenarios + (Goals & Insights) */}
          <section className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <FinancialTimeline events={timeline} />
            <ScenarioSimulator
              scenarios={scenarios}
              onDelete={(id) => deleteMutation.mutate(id)}
              isDeleting={deleteMutation.isPending}
            />
            <div className="space-y-5">
              <FinancialGoalsCard goals={goals} />
              <SmartInsightsCard
                insights={insights}
                onGenerateMore={(excludeIds) => generateMoreMutation.mutateAsync(excludeIds) as any}
                isGenerating={generateMoreMutation.isPending}
              />
            </div>
          </section>
        </main>
      </div>
    </TooltipProvider>
  );
}
