import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Sidebar } from "@/components/finance/Sidebar";

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
  component: AgenteLayout,
});

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
