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

      {/* Mobile bottom navigation — premium floating card */}
      <nav
        className="lg:hidden fixed z-50"
        style={{
          left: 16,
          right: 16,
          bottom: 14,
          height: 92,
          borderRadius: 28,
          background: "linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(250,250,250,1) 100%)",
          boxShadow: "0 8px 30px rgba(15,23,42,0.08), 0 2px 8px rgba(15,23,42,0.04)",
          border: "1px solid rgba(226,232,240,0.6)",
          paddingTop: 12,
          paddingBottom: 10,
          paddingLeft: 8,
          paddingRight: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-around",
          marginBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {[
          { label: "Financeiro", icon: LayoutGrid, to: "/" as const },
          { label: "Recebimentos", icon: ArrowDownCircle, to: "/recebimentos" as const },
          { label: "Pagamentos", icon: ArrowUpCircle, to: "/pagamentos" as const },
          { label: "Planejamento", icon: TrendingUp, to: "/planejamento" as const },
          { label: "Mais", icon: Menu, to: null as unknown as "/" },
        ].map((item) => {
          const active = item.to
            ? pathname === item.to || (item.to !== "/" && pathname.startsWith(item.to))
            : false;
          const isReal = item.to ? REAL_ROUTES.has(item.to) : false;

          const inner = (
            <span
              style={{
                minWidth: 60,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                transition: "transform 0.25s ease",
                transform: active ? "translateY(-2px)" : "translateY(0)",
              }}
            >
              <span
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 999,
                  background: active ? "rgba(255,107,87,0.12)" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.25s ease",
                }}
              >
                <item.icon
                  style={{
                    width: 24,
                    height: 24,
                    color: active ? "#FF6B57" : "#6B7280",
                    transition: "all 0.25s ease",
                  }}
                  strokeWidth={2}
                />
              </span>
              <span
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: 11,
                  fontWeight: 500,
                  lineHeight: 1,
                  color: active ? "#FF6B57" : "#6B7280",
                  transition: "color 0.25s ease",
                  whiteSpace: "nowrap",
                }}
              >
                {item.label}
              </span>
            </span>
          );

          return item.to && isReal ? (
            <Link
              key={item.label}
              to={item.to}
              aria-label={item.label}
              style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              {inner}
            </Link>
          ) : (
            <button
              key={item.label}
              type="button"
              disabled={!isReal}
              aria-label={item.label}
              style={{ opacity: isReal ? 1 : 0.4, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              {inner}
            </button>
          );
        })}
      </nav>
    </TooltipProvider>
  );
}
