import {
  LayoutGrid,
  ArrowDownCircle,
  ArrowUpCircle,
  TrendingUp,
  Percent,
  Settings,
  LogOut,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
const STORAGE_KEY = "sidebar-collapsed";

export function Sidebar() {
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) setCollapsed(stored === "true");
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed, mounted]);

  const maybeTooltip = (trigger: React.ReactNode, label: string) => {
    if (!collapsed) return trigger;
    return (
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent side="right" className="font-medium">
          {label}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <TooltipProvider delayDuration={150}>
      <aside
        className={cn(
          "hidden lg:flex shrink-0 flex-col bg-sidebar border-r border-border py-6 gap-6 transition-[width] duration-200",
          collapsed ? "w-[88px] items-center px-0" : "w-[240px] items-stretch px-4",
        )}
      >
        {/* Logo + toggle */}
        <div
          className={cn(
            "flex items-center",
            collapsed ? "flex-col gap-3" : "justify-between",
          )}
        >
          <div
            className={cn(
              "flex items-center gap-3",
              collapsed && "flex-col",
            )}
          >
            <div className="h-11 w-11 rounded-2xl bg-gradient-primary text-white grid place-items-center font-bold text-lg shadow-soft shrink-0">
              N
            </div>
            {!collapsed && (
              <span className="font-semibold text-foreground text-sm leading-tight">
                NÓS Conecta
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="h-9 w-9 grid place-items-center rounded-xl text-muted-foreground hover:bg-[#FAFAFA] hover:text-foreground transition-colors"
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-[16px] w-[16px]" strokeWidth={1.75} />
            ) : (
              <PanelLeftClose className="h-[16px] w-[16px]" strokeWidth={1.75} />
            )}
          </button>
        </div>

        {/* Nav */}
        <nav
          className={cn(
            "flex-1 flex flex-col gap-2",
            collapsed ? "items-center" : "items-stretch",
          )}
        >
          {items.map((it) => {
            const active = pathname === it.to || (it.to !== "/" && pathname.startsWith(it.to));
            const isReal = REAL_ROUTES.has(it.to);
            const className = cn(
              "flex items-center rounded-2xl transition-colors",
              collapsed ? "h-12 w-12 justify-center" : "h-12 w-full px-3 gap-3",
              active
                ? "bg-[#1B1B1F] text-white"
                : "text-muted-foreground hover:bg-[#FAFAFA] hover:text-foreground",
              !isReal && "opacity-40 cursor-not-allowed",
            );
            const inner = (
              <>
                <it.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                {!collapsed && (
                  <span className="text-sm font-medium truncate">{it.label}</span>
                )}
              </>
            );
            const trigger = isReal ? (
              <Link to={it.to} className={className} aria-label={it.label}>
                {inner}
              </Link>
            ) : (
              <button type="button" className={className} disabled aria-label={it.label}>
                {inner}
              </button>
            );
            return <div key={it.label}>{maybeTooltip(trigger, it.label)}</div>;
          })}
        </nav>

        {/* Footer */}
        <div
          className={cn(
            "flex gap-3",
            collapsed ? "flex-col items-center" : "flex-col items-stretch",
          )}
        >
          {maybeTooltip(
            <button
              type="button"
              className={cn(
                "flex items-center rounded-2xl bg-gradient-primary text-white shadow-soft hover:opacity-90 transition-opacity",
                collapsed ? "h-11 w-11 justify-center" : "h-11 w-full px-3 gap-3",
              )}
              aria-label="Upgrade Premium"
            >
              <Sparkles className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
              {!collapsed && (
                <span className="text-sm font-semibold">Plano Premium</span>
              )}
            </button>,
            "Upgrade Premium",
          )}

          {maybeTooltip(
            <button
              type="button"
              className={cn(
                "flex items-center transition-colors",
                collapsed
                  ? "h-10 w-10 rounded-full bg-[#FAFAFA] border border-border text-foreground justify-center text-xs font-semibold hover:bg-muted"
                  : "h-12 w-full rounded-2xl px-3 gap-3 hover:bg-[#FAFAFA]",
              )}
              aria-label="Conta"
            >
              {collapsed ? (
                "N"
              ) : (
                <>
                  <span className="h-8 w-8 rounded-full bg-[#FAFAFA] border border-border grid place-items-center text-xs font-semibold shrink-0">
                    N
                  </span>
                  <span className="flex flex-col text-left leading-tight min-w-0">
                    <span className="text-sm font-medium text-foreground truncate">
                      NÓS Conecta
                    </span>
                    <span className="text-[11px] text-muted-foreground truncate">
                      Administrador
                    </span>
                  </span>
                </>
              )}
            </button>,
            "NÓS Conecta · Administrador",
          )}

          {maybeTooltip(
            <button
              type="button"
              className={cn(
                "flex items-center rounded-2xl text-muted-foreground hover:bg-[#FAFAFA] hover:text-foreground transition-colors",
                collapsed ? "h-10 w-10 justify-center" : "h-11 w-full px-3 gap-3",
              )}
              aria-label="Sair"
            >
              <LogOut className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
              {!collapsed && <span className="text-sm font-medium">Sair</span>}
            </button>,
            "Sair",
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}
