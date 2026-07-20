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
  Plus,
  Calendar,
  Wallet,
  ChevronLeft,
  CalendarDays,
  Home,
  Users,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useMobileFab } from "@/components/finance/mobile-fab-context";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";

type FinanceItem = {
  label: string;
  icon: LucideIcon;
  to: "/" | "/recebimentos" | "/pagamentos" | "/planejamento" | "/comissoes";
};

const financeItems: FinanceItem[] = [
  { label: "Visão Geral", icon: LayoutGrid, to: "/" },
  { label: "Recebimentos", icon: ArrowDownCircle, to: "/recebimentos" },
  { label: "Pagamentos", icon: ArrowUpCircle, to: "/pagamentos" },
  { label: "Planejamento", icon: TrendingUp, to: "/planejamento" },
  { label: "Comissões", icon: Percent, to: "/comissoes" },
];

const REAL_ROUTES = new Set(["/", "/pagamentos", "/recebimentos", "/planejamento"]);
const FINANCE_PATHS = new Set(["/", "/recebimentos", "/pagamentos", "/planejamento", "/comissoes"]);
const AGENDA_PATHS = new Set(["/agenda"]);
const isPatientsPath = (pathname: string) =>
  pathname === "/pacientes" || pathname.startsWith("/pacientes/");
const isSettingsPath = (pathname: string) => pathname === "/configuracoes";
const STORAGE_KEY = "sidebar-collapsed";

export function Sidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(true);
  const [mounted, setMounted] = useState(false);
  const fabCtx = useMobileFab();
  const fab = fabCtx?.fab ?? null;
  const navActions = fabCtx?.navActions ?? [];

  const inFinance = useMemo(
    () =>
      FINANCE_PATHS.has(pathname) ||
      financeItems.some((i) => i.to !== "/" && pathname.startsWith(i.to)),
    [pathname],
  );
  const inAgenda = useMemo(() => AGENDA_PATHS.has(pathname), [pathname]);
  const inPatients = useMemo(() => isPatientsPath(pathname), [pathname]);
  const inSettings = useMemo(() => isSettingsPath(pathname), [pathname]);
  const inInicio = useMemo(() => pathname === "/inicio", [pathname]);

  type SidebarView = "modules" | "financeiro" | "agenda";
  const [view, setView] = useState<SidebarView>(
    inFinance ? "financeiro" : inAgenda ? "agenda" : "modules",
  );

  // Switch view automatically when the route changes
  useEffect(() => {
    if (inPatients || inSettings || inInicio) setView("modules");
    else if (inFinance) setView("financeiro");
    else if (inAgenda) setView("agenda");
  }, [inFinance, inAgenda, inPatients, inSettings, inInicio]);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) setCollapsed(stored === "true");
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed, mounted]);

  // Logged-in user info
  const [userName, setUserName] = useState<string>("Conta");
  const [userInitial, setUserInitial] = useState<string>("N");
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const meta = (data.user?.user_metadata ?? {}) as { full_name?: string };
      const name = meta.full_name || data.user?.email?.split("@")[0] || "Conta";
      setUserName(name);
      setUserInitial(name.charAt(0).toLocaleUpperCase("pt-BR"));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const meta = (session?.user?.user_metadata ?? {}) as { full_name?: string };
      const name = meta.full_name || session?.user?.email?.split("@")[0] || "Conta";
      setUserName(name);
      setUserInitial(name.charAt(0).toLocaleUpperCase("pt-BR"));
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Sessão encerrada.");
    navigate({ to: "/auth", replace: true });
  };

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

  // Module-level items (primary menu)
  const modules: {
    label: string;
    icon: LucideIcon;
    to: "/inicio" | "/agenda" | "/pacientes" | "/configuracoes" | "/";
    disabled?: boolean;
  }[] = [
    { label: "Início", icon: Home, to: "/inicio" },
    { label: "Agenda", icon: Calendar, to: "/agenda" },
    { label: "Pacientes", icon: Users, to: "/pacientes" },
    { label: "Financeiro", icon: Wallet, to: "/" },
    { label: "Configurações", icon: Settings, to: "/configuracoes" },
  ];

  return (
    <TooltipProvider delayDuration={150}>
      <aside
        className={cn(
          "hidden lg:flex shrink-0 flex-col bg-sidebar border-r border-border py-6 gap-6 transition-[width] duration-200",
          "h-screen sticky top-0",
          collapsed ? "w-[88px] items-center px-0" : "w-[240px] items-stretch px-4",
        )}
      >
        {/* Logo + toggle */}
        <div className={cn("flex items-center", collapsed ? "flex-col gap-3" : "justify-between")}>
          <div className={cn("flex items-center gap-3", collapsed && "flex-col")}>
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
            "flex-1 flex flex-col gap-2 min-h-0",
            collapsed ? "items-center" : "items-stretch",
          )}
        >
          {view === "agenda" ? (
            <>
              {maybeTooltip(
                <button
                  type="button"
                  onClick={() => setView("modules")}
                  className={cn(
                    "flex items-center rounded-2xl text-muted-foreground hover:bg-[#FAFAFA] hover:text-foreground transition-colors",
                    collapsed ? "h-10 w-10 justify-center" : "h-9 w-full px-3 gap-2 mb-1",
                  )}
                  aria-label="Voltar aos módulos"
                >
                  <ChevronLeft className="h-[16px] w-[16px] shrink-0" strokeWidth={2} />
                  {!collapsed && <span className="text-xs font-medium">Módulos</span>}
                </button>,
                "Voltar aos módulos",
              )}

              {!collapsed && (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-3 mb-1">
                  Agenda
                </span>
              )}

              {maybeTooltip(
                <Link
                  to="/agenda"
                  className={cn(
                    "flex items-center rounded-2xl transition-colors",
                    collapsed ? "h-12 w-12 justify-center" : "h-12 w-full px-3 gap-3",
                    pathname === "/agenda"
                      ? "bg-[#1B1B1F] text-white"
                      : "text-muted-foreground hover:bg-[#FAFAFA] hover:text-foreground",
                  )}
                  aria-label="Agenda"
                >
                  <CalendarDays className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                  {!collapsed && <span className="text-sm font-medium truncate">Agenda</span>}
                </Link>,
                "Agenda",
              )}
            </>
          ) : view === "modules" ? (
            <>
              {!collapsed && (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-3 mb-1">
                  Módulos
                </span>
              )}
              {modules.map((m) => {
                const active =
                  m.to === "/pacientes"
                    ? inPatients
                    : m.to === "/configuracoes"
                      ? inSettings
                      : pathname === m.to;
                const className = cn(
                  "flex items-center rounded-2xl transition-colors",
                  collapsed ? "h-12 w-12 justify-center" : "h-12 w-full px-3 gap-3",
                  active
                    ? "bg-[#1B1B1F] text-white"
                    : m.disabled
                      ? "text-muted-foreground opacity-40 cursor-not-allowed"
                      : "text-foreground hover:bg-[#FAFAFA]",
                );
                const inner = (
                  <>
                    <m.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                    {!collapsed && <span className="text-sm font-medium truncate">{m.label}</span>}
                  </>
                );
                return (
                  <div key={m.label}>
                    {maybeTooltip(
                      <Link to={m.to} className={className} aria-label={m.label}>
                        {inner}
                      </Link>,
                      m.label,
                    )}
                  </div>
                );
              })}
            </>
          ) : (
            <>
              {/* Back to modules */}
              {maybeTooltip(
                <button
                  type="button"
                  onClick={() => setView("modules")}
                  className={cn(
                    "flex items-center rounded-2xl text-muted-foreground hover:bg-[#FAFAFA] hover:text-foreground transition-colors",
                    collapsed ? "h-10 w-10 justify-center" : "h-9 w-full px-3 gap-2 mb-1",
                  )}
                  aria-label="Voltar aos módulos"
                >
                  <ChevronLeft className="h-[16px] w-[16px] shrink-0" strokeWidth={2} />
                  {!collapsed && <span className="text-xs font-medium">Módulos</span>}
                </button>,
                "Voltar aos módulos",
              )}

              {!collapsed && (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-3 mb-1">
                  Financeiro
                </span>
              )}

              {financeItems.map((it) => {
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
                    {!collapsed && <span className="text-sm font-medium truncate">{it.label}</span>}
                  </>
                );
                const trigger = isReal ? (
                  // "/comissoes" is a placeholder nav entry with no real route
                  // yet; isReal already gates it out of this branch at runtime.
                  <Link to={it.to as "/" | "/recebimentos" | "/pagamentos" | "/planejamento"} className={className} aria-label={it.label}>
                    {inner}
                  </Link>
                ) : (
                  <button type="button" className={className} disabled aria-label={it.label}>
                    {inner}
                  </button>
                );
                return <div key={it.label}>{maybeTooltip(trigger, it.label)}</div>;
              })}
            </>
          )}
        </nav>

        {/* Footer (pinned bottom) */}
        <div
          className={cn(
            "flex gap-3 mt-auto",
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
              {!collapsed && <span className="text-sm font-semibold">Plano Premium</span>}
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
                userInitial
              ) : (
                <>
                  <span className="h-8 w-8 rounded-full bg-[#FAFAFA] border border-border grid place-items-center text-xs font-semibold shrink-0">
                    {userInitial}
                  </span>
                  <span className="flex flex-col text-left leading-tight min-w-0">
                    <span className="text-sm font-medium text-foreground truncate">
                      {userName}
                    </span>
                    <span className="text-[11px] text-muted-foreground truncate">
                      Administrador
                    </span>
                  </span>
                </>
              )}
            </button>,
            `${userName} · Administrador`,
          )}

          {maybeTooltip(
            <button
              type="button"
              onClick={handleSignOut}
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

      {/* Mobile bottom navigation — premium floating card with central FAB */}
      <nav
        className="lg:hidden fixed z-50 flex items-center justify-between"
        style={{
          left: 16,
          right: 16,
          bottom: 14,
          height: 68,
          borderRadius: 24,
          background: "linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(250,250,250,1) 100%)",
          boxShadow: "0 8px 30px rgba(15,23,42,0.08), 0 2px 8px rgba(15,23,42,0.04)",
          border: "1px solid rgba(226,232,240,0.6)",
          paddingLeft: 6,
          paddingRight: 6,
          marginBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {(() => {
          const navItems = [
            { label: "Financeiro", icon: LayoutGrid, to: "/" as const },
            { label: "Recebimentos", icon: ArrowDownCircle, to: "/recebimentos" as const },
            { label: "Pagamentos", icon: ArrowUpCircle, to: "/pagamentos" as const },
            { label: "Planejamento", icon: TrendingUp, to: "/planejamento" as const },
          ];
          const left = navItems.slice(0, 2);
          const right = navItems.slice(2);

          const renderItem = (item: (typeof navItems)[number]) => {
            const active =
              pathname === item.to || (item.to !== "/" && pathname.startsWith(item.to));
            const isReal = REAL_ROUTES.has(item.to);

            const inner = (
              <span
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 3,
                  paddingTop: 4,
                  transition: "transform 0.25s ease",
                }}
              >
                <span
                  style={{
                    width: 30,
                    height: 30,
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
                      width: 18,
                      height: 18,
                      color: active ? "#FF6B57" : "#6B7280",
                    }}
                    strokeWidth={2}
                  />
                </span>
                <span
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontSize: 9.5,
                    fontWeight: 500,
                    letterSpacing: "-0.01em",
                    lineHeight: 1,
                    color: active ? "#FF6B57" : "#6B7280",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.label}
                </span>
              </span>
            );

            const wrapperStyle: React.CSSProperties = {
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 0,
            };

            return isReal ? (
              <Link key={item.label} to={item.to} aria-label={item.label} style={wrapperStyle}>
                {inner}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                disabled
                aria-label={item.label}
                style={{ ...wrapperStyle, opacity: 0.4 }}
              >
                {inner}
              </button>
            );
          };

          const fabActive = !!fab || inAgenda;
          const fabButton = (
            <button
              type="button"
              onClick={() => fab?.onClick()}
              disabled={!fabActive}
              aria-label={fab?.label ?? "Adicionar"}
              className="bg-gradient-primary shadow-soft"
              style={{
                width: 56,
                height: 56,
                borderRadius: 999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                transform: "translateY(-18px)",
                flexShrink: 0,
                border: "4px solid white",
                opacity: fabActive ? 1 : 0.4,
                transition: "transform 0.2s ease, opacity 0.2s ease",
              }}
            >
              <Plus style={{ width: 26, height: 26 }} strokeWidth={2.5} />
            </button>
          );

          if (inAgenda) {
            const renderNav = (a: (typeof navActions)[number], key: string) => {
              const wrapperStyle: React.CSSProperties = {
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 0,
              };
              const inner = (
                <span
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 3,
                    paddingTop: 4,
                  }}
                >
                  <span
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 999,
                      background: "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <a.icon style={{ width: 18, height: 18, color: "#6B7280" }} strokeWidth={2} />
                  </span>
                  <span
                    style={{
                      fontFamily: "Inter, sans-serif",
                      fontSize: 9.5,
                      fontWeight: 500,
                      letterSpacing: "-0.01em",
                      lineHeight: 1,
                      color: "#6B7280",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {a.label}
                  </span>
                </span>
              );
              return (
                <button
                  key={key}
                  type="button"
                  onClick={a.onClick}
                  aria-label={a.label}
                  style={wrapperStyle}
                >
                  {inner}
                </button>
              );
            };

            const splitIndex = Math.ceil(navActions.length / 2);
            const leftNav = navActions.slice(0, splitIndex);
            const rightNav = navActions.slice(splitIndex);

            return (
              <>
                {leftNav.map((a, i) => renderNav(a, `l-${i}`))}
                {fabButton}
                {rightNav.map((a, i) => renderNav(a, `r-${i}`))}
              </>
            );
          }

          if (pathname === "/" || inPatients || inSettings) {
            const homeItems = [
              { label: "Início", icon: Home, to: "/" as const, isReal: true },
              { label: "Agenda", icon: Calendar, to: "/agenda" as const, isReal: true },
              { label: "Pacientes", icon: Users, to: "/pacientes" as const, isReal: true },
              { label: "Financeiro", icon: Wallet, to: "/recebimentos" as const, isReal: true },
              { label: "Mais", icon: MoreHorizontal, to: "/configuracoes" as const, isReal: true },
            ];
            const homeItemStyle: React.CSSProperties = {
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 0,
            };

            return (
              <>
                {homeItems.map((item) => {
                  const active =
                    item.to !== null &&
                    (pathname === item.to || (item.to === "/pacientes" && inPatients));
                  const iconEl = (
                    <span
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 3,
                        paddingTop: 4,
                      }}
                    >
                      <span
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 999,
                          background: active ? "rgba(255,107,87,0.12)" : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transition: "all 0.25s ease",
                        }}
                      >
                        <item.icon
                          style={{ width: 18, height: 18, color: active ? "#FF6B57" : "#6B7280" }}
                          strokeWidth={2}
                        />
                      </span>
                      <span
                        style={{
                          fontFamily: "Inter, sans-serif",
                          fontSize: 9.5,
                          fontWeight: 500,
                          letterSpacing: "-0.01em",
                          lineHeight: 1,
                          color: active ? "#FF6B57" : "#6B7280",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.label}
                      </span>
                    </span>
                  );
                  if (!item.isReal || !item.to) {
                    return (
                      <button
                        key={item.label}
                        type="button"
                        disabled
                        aria-label={item.label}
                        style={{ ...homeItemStyle, opacity: 0.4 }}
                      >
                        {iconEl}
                      </button>
                    );
                  }
                  return (
                    <Link
                      key={item.label}
                      to={item.to}
                      aria-label={item.label}
                      style={homeItemStyle}
                    >
                      {iconEl}
                    </Link>
                  );
                })}
              </>
            );
          }

          return (
            <>
              {left.map(renderItem)}
              {fabButton}
              {right.map(renderItem)}
            </>
          );
        })()}
      </nav>

      {/* Mobile top-right home button */}
      <Link
        to="/"
        className={cn(
          "lg:hidden fixed z-40 flex items-center justify-center",
          (pathname === "/" || (inPatients && pathname !== "/pacientes")) && "hidden",
        )}
        style={{
          top: 20,
          right: 16,
          width: 52,
          height: 52,
          borderRadius: 17,
          background: "#FFFFFF",
          border: "1px solid #EEF2F7",
          boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
        }}
        aria-label="Home"
      >
        <Home className="h-[21px] w-[21px] text-[#111827]" strokeWidth={1.75} />
      </Link>
    </TooltipProvider>
  );
}
