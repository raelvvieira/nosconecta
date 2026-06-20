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
  Menu,
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

      {/* Mobile bottom navigation — island style */}
      <div
        className="lg:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-50"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        <nav className="bg-white rounded-[28px] shadow-xl shadow-black/10 flex items-end px-3 py-2 gap-1">
          {/* Left items */}
          {[
            { label: "Financeiro", icon: LayoutGrid, to: "/" as const },
            { label: "Recebimentos", icon: ArrowDownCircle, to: "/recebimentos" as const },
          ].map((item) => {
            const active = pathname === item.to || (item.to !== "/" && pathname.startsWith(item.to));
            const isReal = REAL_ROUTES.has(item.to);
            const inner = (
              <span className="flex flex-col items-center gap-1 py-1 px-2.5">
                <span className={cn("rounded-xl p-1.5", active ? "bg-primary/10" : "")}>
                  <item.icon
                    className={cn("h-[18px] w-[18px]", active ? "text-primary" : "text-muted-foreground")}
                    strokeWidth={active ? 2 : 1.75}
                  />
                </span>
                <span className={cn("text-[10px] font-medium leading-none", active ? "text-primary" : "text-muted-foreground")}>
                  {item.label}
                </span>
              </span>
            );
            return isReal ? (
              <Link key={item.label} to={item.to} aria-label={item.label}>{inner}</Link>
            ) : (
              <button key={item.label} type="button" disabled className="opacity-40" aria-label={item.label}>{inner}</button>
            );
          })}

          {/* FAB center */}
          <button
            type="button"
            className="h-14 w-14 rounded-full bg-gradient-to-br from-[#FF6B6B] to-[#FF9A3C] text-white shadow-lg flex items-center justify-center -mt-5 mx-1 shrink-0"
            aria-label="Adicionar"
          >
            <Plus className="h-6 w-6" strokeWidth={2.5} />
          </button>

          {/* Right items */}
          {[
            { label: "Pagamentos", icon: ArrowUpCircle, to: "/pagamentos" as const },
            { label: "Mais", icon: Menu, to: null },
          ].map((item) => {
            const active = item.to ? (pathname === item.to || pathname.startsWith(item.to)) : false;
            const isReal = item.to ? REAL_ROUTES.has(item.to) : false;
            const inner = (
              <span className="flex flex-col items-center gap-1 py-1 px-2.5">
                <span className={cn("rounded-xl p-1.5", active ? "bg-primary/10" : "")}>
                  <item.icon
                    className={cn("h-[18px] w-[18px]", active ? "text-primary" : "text-muted-foreground")}
                    strokeWidth={active ? 2 : 1.75}
                  />
                </span>
                <span className={cn("text-[10px] font-medium leading-none", active ? "text-primary" : "text-muted-foreground")}>
                  {item.label}
                </span>
              </span>
            );
            return item.to && isReal ? (
              <Link key={item.label} to={item.to} aria-label={item.label}>{inner}</Link>
            ) : (
              <button key={item.label} type="button" disabled className="opacity-40" aria-label={item.label}>{inner}</button>
            );
          })}
        </nav>
      </div>
    </TooltipProvider>
  );
}
