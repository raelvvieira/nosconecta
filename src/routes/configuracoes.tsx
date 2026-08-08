import { createFileRoute, Outlet } from "@tanstack/react-router";
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
  errorComponent: () => (
    <ResponsiveRouteState
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
  return (
    <div className="min-h-screen app-bg lg:flex">
      <Sidebar />
      <main className="mx-auto w-full max-w-[1240px] px-4 pb-28 pt-7 sm:px-6 lg:px-10 lg:pb-12 lg:pt-9">
        <header className="pr-16 lg:pr-0">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-pink">
            <Settings2 className="h-4 w-4" />
            Base operacional
          </div>
          <h1 className="text-[30px] font-semibold tracking-[-0.035em] lg:text-4xl">
            Configurações
          </h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            Cadastros e conexões que mantêm agenda, atendimento e financeiro funcionando juntos.
          </p>
        </header>

        <div className="mt-7 grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
          <SettingsNav />
          <section className="min-w-0">
            <Outlet />
          </section>
        </div>
      </main>
    </div>
  );
}
