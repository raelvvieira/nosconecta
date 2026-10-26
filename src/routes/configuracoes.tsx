import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { PageHeading } from "@/components/layout/PageHeading";
import { Settings2 } from "lucide-react";
import { Sidebar } from "@/components/finance/Sidebar";
import { ResponsiveRouteState } from "@/components/layout/ResponsiveRouteState";
import { SettingsNav } from "@/components/settings/SettingsNav";

export const Route = createFileRoute("/configuracoes")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Configurações · NÓS Conecta" },
      { name: "description", content: "Cadastros que mantêm a operação da clínica conectada." },
    ],
  }),
  errorComponent: ({ error }) => (
    <ResponsiveRouteState
      error={error}
      title="Não foi possível carregar as configurações"
      description="Houve uma falha ao buscar os dados da clínica. Tente novamente em instantes."
    />
  ),
  notFoundComponent: () => (
    <ResponsiveRouteState
      title="Configuração não encontrada"
      description="A área de configurações que você tentou acessar não está disponível."
      notFound
    />
  ),
  component: SettingsLayout,
});

// Casca do módulo: cabeçalho e menu ficam aqui, o conteúdo de cada área vem
// pelo Outlet. Antes esta rota renderizava a página inteira e nunca montava
// um <Outlet />, então /configuracoes/notificacoes mudava a URL e não abria
// nada — a sub-rota estava registrada mas não tinha onde renderizar.
function SettingsLayout() {
  // Numa subtela (Pessoal, Casos…) o celular mostrava dois cabeçalhos
  // empilhados: "Configurações" com explicação, e logo abaixo o da subtela.
  // Fica só o da subtela; o de Configurações volta no computador.
  const { pathname, searchStr } = useLocation();
  const naRaiz = pathname === "/configuracoes" || pathname === "/configuracoes/";
  // No celular, a raiz de Configurações É o menu: a lista de áreas, no
  // estilo dos Ajustes do iPhone. O conteúdo de uma área só aparece quando
  // ela foi escolhida (`?section=`) ou numa rota própria. A tira de chips
  // que rolava de lado saiu — "Biblioteca" aparecia cortado na borda e
  // metade das áreas ficava escondida (23/10).
  const menuNoCelular = naRaiz && !String(searchStr ?? "").includes("section=");
  return (
    <div className="min-h-dvh app-bg lg:flex">
      <Sidebar />
      <main className="w-full px-4 pb-nav pt-7 sm:px-6 lg:px-10 lg:pb-12 lg:pt-9">
        <PageHeading
          className={cn("pr-16 lg:pr-0", !menuNoCelular && "hidden lg:flex")}
          icon={Settings2}
          kicker="Base operacional"
          title="Configurações"
          subtitle="Cadastros e conexões que mantêm agenda, atendimento e financeiro funcionando juntos."
        />

        <div className="mt-7 grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
          <SettingsNav />
          <section className={cn("min-w-0", menuNoCelular && "hidden lg:block")}>
            <Outlet />
          </section>
        </div>
      </main>
    </div>
  );
}
