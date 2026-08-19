import { createFileRoute } from "@tanstack/react-router";

import { Sidebar } from "@/components/finance/Sidebar";
import { DesktopHome } from "@/components/home/DesktopHome";
import { MobileHome } from "@/components/home/MobileHome";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { RouteSkeleton } from "@/components/layout/RouteSkeleton";
import { getFinanceOverview } from "@/lib/finance/queries.functions";
import { getHomeToday } from "@/lib/agenda/agenda.functions";
import { homeOverviewOptions, homeTodayOptions, useHomeData } from "@/components/home/useHomeData";

export const Route = createFileRoute("/inicio")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Início · NÓS Conecta" },
      { name: "description", content: "Resumo do dia da clínica odontológica." },
    ],
  }),
  // As duas consultas que a tela usa. Deixar a agenda de fora aqui faria o
  // esqueleto sumir com os cards do dia ainda em branco.
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(homeOverviewOptions(getFinanceOverview as any)),
      context.queryClient.ensureQueryData(homeTodayOptions(getHomeToday as any)),
    ]),
  pendingComponent: () => <RouteSkeleton shape="kpis" />,
  // 150ms evita o piscar em navegação instantânea; 400ms de mínimo
  // evita que o esqueleto apareça e suma num susto.
  pendingMs: 150,
  pendingMinMs: 400,
  errorComponent: ({ error }) => <ResponsiveRouteState error={error} title="Não foi possível carregar o início" />,
  notFoundComponent: () => <ResponsiveRouteState title="Página não encontrada" notFound />,
  component: InicioPage,
});

function InicioPage() {
  const dados = useHomeData();

  return (
    <div className="app-bg h-dvh flex overflow-hidden">
      <Sidebar />

      {dados && <MobileHome dados={dados} />}

      <main className="hidden lg:block flex-1 min-w-0 overflow-y-auto custom-scroll px-4 md:px-8 lg:px-12 py-6 md:py-8 pb-24 lg:pb-8">
        {dados && <DesktopHome dados={dados} />}
      </main>
    </div>
  );
}
