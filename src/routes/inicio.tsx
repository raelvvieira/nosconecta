import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";

import { Sidebar } from "@/components/finance/Sidebar";
import { DesktopHome } from "@/components/home/DesktopHome";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { getFinanceOverview } from "@/lib/finance/queries.functions";

const homeOverviewOptions = (
  fetcher: (args: {
    data: { period: "today"; granularity: "daily" };
  }) => Promise<Awaited<ReturnType<typeof getFinanceOverview>>>,
) =>
  queryOptions({
    queryKey: ["home-overview", "today"],
    queryFn: () => fetcher({ data: { period: "today", granularity: "daily" } }),
    staleTime: 30_000,
  });

export const Route = createFileRoute("/inicio")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Início · NÓS Conecta" },
      { name: "description", content: "Resumo do dia da clínica odontológica." },
    ],
  }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(homeOverviewOptions(getFinanceOverview as any)),
  errorComponent: () => <ResponsiveRouteState title="Não foi possível carregar o início" />,
  notFoundComponent: () => <ResponsiveRouteState title="Página não encontrada" notFound />,
  component: InicioPage,
});

function InicioPage() {
  const fetchOverview = useServerFn(getFinanceOverview);
  const { data } = useSuspenseQuery(homeOverviewOptions(fetchOverview as any));

  return (
    <div className="app-bg h-screen flex overflow-hidden">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-y-auto custom-scroll px-4 md:px-8 lg:px-12 py-6 md:py-8 pb-24 lg:pb-8">
        <DesktopHome
          revenueToday={data.kpis.revenue.current}
          overdueTotal={data.kpis.overdue.total}
          overduePatients={data.kpis.overdue.patients}
        />
      </main>
    </div>
  );
}
