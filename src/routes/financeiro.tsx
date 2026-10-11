import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { lazy, useEffect, useState } from "react";
import { DollarSign, TrendingDown, BarChart3, Wallet } from "lucide-react";

import { Sidebar } from "@/components/finance/Sidebar";
import { SobDemanda, nomeado } from "@/components/finance/SobDemanda";
import { MobileHome } from "@/components/home/MobileHome";
import { useHomeData } from "@/components/home/useHomeData";
import { PageHeader } from "@/components/finance/PageHeader";
import { mesCorrente } from "@/lib/finance/mes";
import { localDateStr } from "@/lib/date";
import { GrupoDeKpis } from "@/components/finance/GrupoDeKpis";
import { KpiCard } from "@/components/finance/KpiCard";
import { BankAccountsCard } from "@/components/finance/BankAccountsCard";
import { GerenciarContasSheet } from "@/components/finance/GerenciarContasSheet";
import { LancamentoRapido } from "@/components/finance/LancamentoRapido";
import { UpcomingReceivables } from "@/components/finance/UpcomingReceivables";
import { UpcomingPayables } from "@/components/finance/UpcomingPayables";
import { InsightsCard } from "@/components/finance/InsightsCard";
import { RevenueByDentist } from "@/components/finance/RevenueByDentist";
import { CommissionsTable } from "@/components/finance/CommissionsTable";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { RouteSkeleton } from "@/components/layout/RouteSkeleton";

import { z } from "zod";
import { getFinanceOverview, type Granularity, type Period } from "@/lib/finance/queries.functions";
import { formatBRL } from "@/lib/finance/format";

type FinanceiroSearch = z.infer<typeof searchSchema>;
const searchSchema = z.object({
  period: z.enum(["today", "7d", "30d", "90d"]).default("30d"),
  granularity: z.enum(["daily", "weekly", "monthly"]).default("daily"),
  from: z.string().optional(),
  to: z.string().optional(),
});

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

/** Gráficos descem sob demanda: `recharts` pesa 356 KB e não pode
 *  segurar a pintura de uma tela que é sobretudo números e listas. */
/** O retorno do overview já é derivado no arquivo — reusar em vez de redeclarar. */
type Overview = Awaited<ReturnType<typeof getFinanceOverview>>;

const CashFlowChart = lazy(
  nomeado<{
    data: Overview["cashFlow"];
    granularity: Granularity;
    onGranularityChange: (g: Granularity) => void;
  }>(() => import("@/components/finance/CashFlowChart"), "CashFlowChart"),
);
const RevenueByProcedure = lazy(
  nomeado<{ data: Overview["procedures"] }>(
    () => import("@/components/finance/RevenueByProcedure"),
    "RevenueByProcedure",
  ),
);

export const Route = createFileRoute("/financeiro")({
  ssr: false,
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
  pendingComponent: () => <RouteSkeleton shape="kpis" />,
  // 150ms evita o piscar em navegação instantânea; 400ms de mínimo
  // evita que o esqueleto apareça e suma num susto.
  pendingMs: 150,
  pendingMinMs: 400,
  errorComponent: ({ error }) => (
    <ResponsiveRouteState error={error} title="Não foi possível carregar o dashboard" />
  ),
  notFoundComponent: () => <ResponsiveRouteState title="Dashboard não encontrado" notFound />,
  component: FinanceiroVisaoGeral,
});

function FinanceiroVisaoGeral() {
  const { period, granularity, from, to } = Route.useSearch();
  const navigate = Route.useNavigate();

  // ── O intervalo de verdade ──────────────────────────────────────────────
  //
  // Sem `from`/`to` na URL, o padrão é o MÊS CORRENTE INTEIRO — não os últimos
  // 30 dias corridos, que mostravam metade de setembro e metade de outubro no
  // dia 11. O mês vai até o último dia de propósito: é o que faz "a receber" e
  // "a pagar" enxergarem o resto do mês, que é a parte sobre a qual ainda dá
  // para agir.
  //
  // Fica aqui, e não num `default` do schema, para a URL continuar limpa
  // enquanto ninguém escolheu nada — e mesmo assim o seletor acender o mês
  // certo, porque recebe o intervalo já resolvido.
  const padrao = mesCorrente(localDateStr());
  const de = from ?? padrao.de;
  const ate = to ?? padrao.ate;

  const fetchOverview = useServerFn(getFinanceOverview);
  const { data } = useSuspenseQuery(
    overviewQueryOptions(fetchOverview as any, { period, granularity, from: de, to: ate }),
  );

  useEffect(() => {
    document.title = "Financeiro · NÓS Conecta";
  }, []);

  const setGranularity = (g: Granularity) =>
    navigate({ search: (prev: FinanceiroSearch) => ({ ...prev, granularity: g }) });
  const setRange = (r: { from?: string; to?: string }) =>
    navigate({
      search: (prev: FinanceiroSearch) => ({ ...prev, from: r.from, to: r.to }),
    });

  const [contasAbertas, setContasAbertas] = useState(false);

  const { kpis } = data;

  // Saldo não informado é diferente de saldo zero. As cinco contas da clínica
  // estão com R$ 0,00 no cadastro, e mostrar "R$ 0,00" com confiança seria
  // afirmar que não há dinheiro — num cartão que a pessoa abre justamente para
  // saber quanto tem.
  const semSaldo =
    data.accounts.length === 0 || data.accounts.every((c) => c.current_balance === 0);

  // Como o mês fecha se tudo que está em aberto acontecer. Nulo quando não há
  // nada em aberto: aí o número do cartão já É o fechamento, e repetir a mesma
  // cifra embaixo não diria nada.
  const emAbertoLiquido = data.emAberto.receber - data.emAberto.pagar;
  const projecao = emAbertoLiquido === 0 ? null : kpis.profit.current + emAbertoLiquido;
  // No celular esta rota mostra a tela inicial — os mesmos números de /inicio,
  // buscados pelo mesmo hook para nunca divergirem.
  const dadosHome = useHomeData();

  return (
    <div className="app-bg h-dvh flex overflow-hidden">
      <Sidebar />

      {dadosHome && <MobileHome dados={dadosHome} />}

      <main className="hidden lg:block flex-1 min-w-0 overflow-y-auto sem-arrasto-lateral custom-scroll px-4 md:px-6 lg:px-10 py-6 md:py-8 space-y-6 pb-nav lg:pb-8">
        <PageHeader acoes={<LancamentoRapido />} from={de} to={ate} onRangeChange={setRange} />

        {/* ── Os quatro números do mês ─────────────────────────────────
            Eram Receita · Despesas · Lucro · Inadimplência, e os três
            primeiros repetiam, com outro nome, o topo de Recebimentos e de
            Pagamentos. O painel não tinha pergunta própria.

            A pergunta dele agora é "como está o mês", e ela só se responde
            com o caixa junto: receita e despesa contam o passado do mês, e
            quem decide precisa saber com quanto está e quanto ainda falta
            acontecer até o dia 31. Por isso cada número carrega embaixo o que
            ainda está em aberto. */}
        <GrupoDeKpis>
          <KpiCard
            label="Caixa hoje"
            value={semSaldo ? "—" : formatBRL(data.totalAvailable)}
            icon={Wallet}
            tone="violet"
            highlight
            footer={
              semSaldo ? (
                <Link
                  to="/configuracoes/contas"
                  className="text-warning font-medium underline-offset-2 hover:underline"
                >
                  Informe o saldo das contas
                </Link>
              ) : (
                <span className="text-muted-foreground">
                  somando {data.accounts.length} {data.accounts.length === 1 ? "conta" : "contas"}
                </span>
              )
            }
          />
          <KpiCard
            label="Entrou no mês"
            value={formatBRL(kpis.revenue.current)}
            icon={DollarSign}
            tone="success"
            deltaPct={kpis.revenue.deltaPct}
            footer={
              data.emAberto.receber > 0 ? (
                <span className="text-muted-foreground">
                  faltam {formatBRL(data.emAberto.receber)} a receber
                </span>
              ) : (
                <span className="text-muted-foreground">vs mês anterior</span>
              )
            }
          />
          <KpiCard
            label="Saiu no mês"
            value={formatBRL(kpis.expenses.current)}
            icon={TrendingDown}
            tone="danger"
            deltaPct={kpis.expenses.deltaPct}
            footer={
              data.emAberto.pagar > 0 ? (
                <span className="text-muted-foreground">
                  faltam {formatBRL(data.emAberto.pagar)} a pagar
                </span>
              ) : (
                <span className="text-muted-foreground">vs mês anterior</span>
              )
            }
          />
          <KpiCard
            label="Sobrou"
            value={formatBRL(kpis.profit.current)}
            icon={BarChart3}
            tone={kpis.profit.current < 0 ? "danger" : "success"}
            corNoValor
            nota={`Margem ${kpis.margin.toFixed(0)}%`}
            footer={
              /* O fim do mês, e não a margem: a margem já está na nota, e o
                 que falta a quem olha este cartão é saber se o número ainda
                 vai mudar antes do dia 31. */
              projecao !== null ? (
                <span className="text-muted-foreground">fecha o mês em {formatBRL(projecao)}</span>
              ) : (
                <span className="text-muted-foreground">mês fechado</span>
              )
            }
          />
        </GrupoDeKpis>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5">
          <SobDemanda altura={360}>
            <CashFlowChart
              data={data.cashFlow}
              granularity={granularity}
              onGranularityChange={setGranularity}
            />
          </SobDemanda>
          <BankAccountsCard
            accounts={data.accounts}
            total={data.totalAvailable}
            onManage={() => setContasAbertas(true)}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* "Ver todos" leva para a tela cheia do assunto. Eram dois botões
              sem `onClick` — presentes na tela e mortos ao clique. */}
          <UpcomingReceivables
            items={data.upcomingReceivables}
            onVerTodos={() => navigate({ to: "/recebimentos" })}
          />
          <UpcomingPayables
            items={data.upcomingPayables}
            onVerTodos={() => navigate({ to: "/pagamentos" })}
          />
          <InsightsCard insights={data.insights} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <SobDemanda altura={280}>
            <RevenueByProcedure data={data.procedures} />
          </SobDemanda>
          <RevenueByDentist data={data.dentists} />
          <CommissionsTable data={data.commissions} />
        </div>
        <GerenciarContasSheet open={contasAbertas} onOpenChange={setContasAbertas} />
      </main>
    </div>
  );
}
