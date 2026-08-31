import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Sidebar } from "@/components/finance/Sidebar";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";

export const Route = createFileRoute("/agente-ia")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Agente de IA · NÓS Conecta" },
      {
        name: "description",
        content: "O assistente que aprende a atender lendo as conversas que viraram tratamento.",
      },
    ],
  }),
  errorComponent: ({ error }) => (
    <ResponsiveRouteState
      error={error}
      title="Não foi possível carregar o agente"
      description="Houve uma falha ao buscar os dados do assistente. Tente novamente em instantes."
    />
  ),
  notFoundComponent: () => (
    <ResponsiveRouteState
      title="Página não encontrada"
      description="A área do agente que você tentou acessar não está disponível."
      notFound
    />
  ),
  component: AgenteLayout,
});

/**
 * Casca do módulo: só a barra lateral e o lugar onde cada tela entra.
 *
 * Sem menu próprio aqui de propósito. O `Sidebar` já troca a lista de módulos
 * pelo submenu do Agente assim que a rota entra em `/agente-ia` — é o mesmo
 * comportamento do Financeiro e de Atendimentos, e nenhum dos dois repete essa
 * navegação dentro da página.
 */
function AgenteLayout() {
  return (
    <div className="min-h-dvh app-bg lg:flex">
      <Sidebar />
      <div className="flex min-h-dvh flex-1 flex-col lg:h-dvh lg:overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
