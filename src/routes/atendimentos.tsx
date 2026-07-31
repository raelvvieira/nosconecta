import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { Megaphone, MessageCircle, Workflow, type LucideIcon } from "lucide-react";
import { Sidebar } from "@/components/finance/Sidebar";
import { WhatsappStatusBadge } from "@/components/atendimentos/WhatsappStatusBadge";
import { cn } from "@/lib/utils";

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

const TABS: { label: string; to: "/atendimentos" | "/atendimentos/pipeline" | "/atendimentos/campanhas"; icon: LucideIcon }[] = [
  { label: "Chat", to: "/atendimentos", icon: MessageCircle },
  { label: "Pipeline", to: "/atendimentos/pipeline", icon: Workflow },
  { label: "Campanhas", to: "/atendimentos/campanhas", icon: Megaphone },
];

function AtendimentosLayout() {
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen app-bg lg:flex">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col lg:h-screen lg:overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-white/70 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-pink">
              <MessageCircle className="h-4 w-4" />
              Atendimentos
            </span>
            <nav className="flex items-center gap-1">
              {TABS.map((tab) => {
                const active = tab.to === "/atendimentos" ? pathname === tab.to : pathname.startsWith(tab.to);
                return (
                  <Link
                    key={tab.to}
                    to={tab.to}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                      active ? "bg-foreground text-white" : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    <tab.icon className="h-3.5 w-3.5" />
                    {tab.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <WhatsappStatusBadge />
        </header>

        <div className="flex-1 lg:min-h-0 lg:overflow-y-auto">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
