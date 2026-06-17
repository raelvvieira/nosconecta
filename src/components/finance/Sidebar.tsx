import {
  LayoutGrid,
  ArrowDownCircle,
  ArrowUpCircle,
  TrendingUp,
  Percent,
  Settings,
  LogOut,
  Sparkles,
} from "lucide-react";
import { Link, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const items = [
  { label: "Visão Geral", icon: LayoutGrid, to: "/" },
  { label: "Recebimentos", icon: ArrowDownCircle, to: "/recebimentos" },
  { label: "Pagamentos", icon: ArrowUpCircle, to: "/pagamentos" },
  { label: "Planejamento", icon: TrendingUp, to: "/planejamento" },
  { label: "Comissões", icon: Percent, to: "/comissoes" },
  { label: "Configurações", icon: Settings, to: "/configuracoes" },
] as const;

const REAL_ROUTES = new Set(["/", "/pagamentos", "/recebimentos", "/planejamento"]);

export function Sidebar() {
  const { pathname } = useLocation();
  return (
    <TooltipProvider delayDuration={150}>
      <aside className="hidden lg:flex w-[88px] shrink-0 flex-col items-center bg-sidebar border-r border-border py-6 gap-6">
        {/* Logo */}
        <div className="h-11 w-11 rounded-2xl bg-gradient-primary text-white grid place-items-center font-bold text-lg shadow-soft">
          N
        </div>

        {/* Nav */}
        <nav className="flex-1 flex flex-col items-center gap-2">
          {items.map((it) => {
            const active = pathname === it.to || (it.to !== "/" && pathname.startsWith(it.to));
            const isReal = REAL_ROUTES.has(it.to);
            const className = cn(
              "h-12 w-12 grid place-items-center rounded-2xl transition-colors",
              active
                ? "bg-[#1B1B1F] text-white"
                : "text-muted-foreground hover:bg-[#FAFAFA] hover:text-foreground",
              !isReal && "opacity-40 cursor-not-allowed",
            );
            const inner = <it.icon className="h-[18px] w-[18px]" strokeWidth={1.75} />;
            return (
              <Tooltip key={it.label}>
                <TooltipTrigger asChild>
                  {isReal ? (
                    <Link to={it.to} className={className} aria-label={it.label}>
                      {inner}
                    </Link>
                  ) : (
                    <button type="button" className={className} disabled aria-label={it.label}>
                      {inner}
                    </button>
                  )}
                </TooltipTrigger>
                <TooltipContent side="right" className="font-medium">
                  {it.label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="flex flex-col items-center gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="h-11 w-11 rounded-2xl bg-gradient-primary text-white grid place-items-center shadow-soft hover:opacity-90 transition-opacity"
                aria-label="Upgrade Premium"
              >
                <Sparkles className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Upgrade Premium</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="h-10 w-10 rounded-full bg-[#FAFAFA] border border-border text-foreground grid place-items-center text-xs font-semibold hover:bg-muted transition-colors"
                aria-label="Conta"
              >
                N
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">NÓS Conecta · Administrador</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="h-10 w-10 grid place-items-center rounded-2xl text-muted-foreground hover:bg-[#FAFAFA] hover:text-foreground transition-colors"
                aria-label="Sair"
              >
                <LogOut className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Sair</TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}
