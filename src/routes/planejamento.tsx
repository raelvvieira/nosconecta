import { lazy } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeading } from "@/components/layout/PageHeading";
import { useServerFn } from "@tanstack/react-start";
import { SobDemanda, nomeado } from "@/components/finance/SobDemanda";
import { useSuspenseQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import {
  CalendarDays,
  CalendarRange,
  Info,
  Plus,
  Share2,
  Shield,
  TrendingUp,
  Upload,
  Wallet,
} from "lucide-react";

import { Sidebar } from "@/components/finance/Sidebar";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { RouteSkeleton } from "@/components/layout/RouteSkeleton";
import { useRegisterMobileFab } from "@/components/finance/mobile-fab-context";
import { GrupoDeKpis } from "@/components/finance/GrupoDeKpis";
import { KpiCard } from "@/components/finance/KpiCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { FinancialTimeline } from "@/components/finance/planning/FinancialTimeline";
import { ScenarioSimulator } from "@/components/finance/planning/ScenarioSimulator";
import { FinancialGoalsCard } from "@/components/finance/planning/FinancialGoalsCard";
import { SmartInsightsCard } from "@/components/finance/planning/SmartInsightsCard";

import {
  getPlanningOverview,
  deleteScenario,
  type PlanningOverview,
  type RangeDays,
  type Insight,
} from "@/lib/finance/planning.functions";
import { formatBRL } from "@/lib/finance/format";

const searchSchema = z.object({
  range: z.union([z.literal(30), z.literal(60), z.literal(90), z.literal(180)]).default(90),
});

const overviewOpts = (
  fetcher: (args: { data: any }) => Promise<PlanningOverview>,
  period: RangeDays,
) =>
  queryOptions({
    queryKey: ["planning-overview", period],
    queryFn: () => fetcher({ data: { period } }),
    staleTime: 15_000,
  });

/** Gráficos descem sob demanda: `recharts` pesa 356 KB e não pode segurar a
 *  pintura de uma tela que é sobretudo números e listas. */
type Planejamento = Awaited<ReturnType<typeof getPlanningOverview>>;

const CashProjectionChart = lazy(
  nomeado<{
    data: Planejamento["projection"];
    range: RangeDays;
    onRangeChange: (r: RangeDays) => void | Promise<void>;
  }>(() => import("@/components/finance/planning/CashProjectionChart"), "CashProjectionChart"),
);
const ProjectionSummaryCard = lazy(
  nomeado<{ forecast: Planejamento["forecast"] }>(
    () => import("@/components/finance/planning/ProjectionSummaryCard"),
    "ProjectionSummaryCard",
  ),
);

export const Route = createFileRoute("/planejamento")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Planejamento Financeiro · NÓS Conecta" },
      {
        name: "description",
        content: "Projeções, cenários e previsões financeiras para sua clínica.",
      },
    ],
  }),
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ range: search.range }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(overviewOpts(getPlanningOverview as any, deps.range)),
  pendingComponent: () => <RouteSkeleton shape="kpis" />,
  // 150ms evita o piscar em navegação instantânea; 400ms de mínimo
  // evita que o esqueleto apareça e suma num susto.
  pendingMs: 150,
  pendingMinMs: 400,
  errorComponent: ({ error }) => (
    <ResponsiveRouteState error={error} title="Não foi possível carregar o planejamento" />
  ),
  notFoundComponent: () => <ResponsiveRouteState title="Planejamento não encontrado" notFound />,
  component: PlanningPage,
});

function PlanningPage() {
  const { range } = Route.useSearch();
  const navigate = useNavigate({ from: "/planejamento" });
  const qc = useQueryClient();

  const fetchOverview = useServerFn(getPlanningOverview);
  const deleteScenarioFn = useServerFn(deleteScenario);

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

  const { summary, projection, forecast, timeline, goals, scenarios, insights } = data;

  const handleNewScenario = () => toast.info("Em breve: criação de novos cenários");
  useRegisterMobileFab({ label: "Novo Cenário", onClick: handleNewScenario });

  return (
    <TooltipProvider delayDuration={200}>
      <div className="h-dvh flex bg-background overflow-hidden">
        <Sidebar />

        <main className="flex-1 min-w-0 overflow-y-auto sem-arrasto-lateral custom-scroll px-4 md:px-6 lg:px-10 py-6 md:py-8 space-y-8 pb-nav lg:pb-8">
          {/* Header */}
          <PageHeading
            icon={TrendingUp}
            title="Planejamento Financeiro"
            subtitle="Projeções, cenários e previsões para sua clínica"
            actions={
              <>
                <Button className="gap-2 hidden lg:inline-flex" onClick={handleNewScenario}>
                  <Plus className="h-4 w-4" /> Novo Cenário
                </Button>
                <Button variant="outline" className="gap-2">
                  <Upload className="h-4 w-4" /> Exportar
                </Button>
                <Button variant="outline" className="gap-2">
                  <Share2 className="h-4 w-4" /> Compartilhar
                </Button>
              </>
            }
          />

          {/* KPIs */}
          <GrupoDeKpis>
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

            {/* Era uma cópia do KpiCard escrita à mão, e por isso o único
                indicador do app que não acompanhava mudança nenhuma do
                componente. O que ele tem de próprio — a explicação no ícone
                de ajuda e o selo embaixo — cabe nas props de sempre. */}
            <KpiCard
              label={
                <span className="inline-flex items-center gap-1.5">
                  Fôlego Financeiro
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="O que é Fôlego Financeiro"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[260px] text-xs">
                      Com o saldo atual e o nível médio de despesas, a clínica consegue operar por
                      aproximadamente {summary.financialRunwayDays} dias sem novas receitas.
                    </TooltipContent>
                  </Tooltip>
                </span>
              }
              value={`${summary.financialRunwayDays} dias`}
              icon={Shield}
              tone="warning"
              nota={
                <span
                  className={summary.financialRunwayDays >= 60 ? "text-success" : "text-warning"}
                >
                  {summary.financialRunwayDays >= 60 ? "Acima do recomendado" : "Atenção ao caixa"}
                </span>
              }
              footer={
                <Badge
                  variant="secondary"
                  className={`border-0 font-medium ${summary.financialRunwayDays >= 60 ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}
                >
                  {summary.financialRunwayDays >= 60
                    ? "✓ Acima do recomendado"
                    : "Atenção ao caixa"}
                </Badge>
              }
            />
          </GrupoDeKpis>

          {/* Chart + Summary */}
          <section className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <div className="xl:col-span-2">
              <SobDemanda altura={340}>
                <CashProjectionChart data={projection} range={range} onRangeChange={setRange} />
              </SobDemanda>
            </div>
            <div>
              <SobDemanda altura={340}>
                <ProjectionSummaryCard forecast={forecast} />
              </SobDemanda>
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
              <SmartInsightsCard insights={insights} />
            </div>
          </section>
        </main>
      </div>
    </TooltipProvider>
  );
}
