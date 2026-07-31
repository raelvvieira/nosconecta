import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Sidebar } from "@/components/finance/Sidebar";

export const Route = createFileRoute("/atendimentos")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Atendimentos · NÓS Conecta" },
      { name: "description", content: "Chat, pipeline e campanhas de WhatsApp da clínica em um só lugar." },
    ],
  }),
  component: AtendimentosLayout,
});

function AtendimentosLayout() {
  return (
    <div className="min-h-screen app-bg lg:flex">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col lg:h-screen lg:overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
