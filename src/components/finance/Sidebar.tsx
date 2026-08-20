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
  MessageCircle,
  Workflow,
  Megaphone,
  Bot,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useMobileFab } from "@/components/finance/mobile-fab-context";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { UnitSwitcher } from "@/components/settings/UnitSwitcher";
import { useUnitSelection } from "@/lib/settings/unit-context";
import { supabase } from "@/integrations/supabase/client";

type FinanceItem = {
  label: string;
  icon: LucideIcon;
  to: "/financeiro" | "/recebimentos" | "/pagamentos" | "/planejamento" | "/comissoes";
};

const financeItems: FinanceItem[] = [
  { label: "Visão Geral", icon: LayoutGrid, to: "/financeiro" },
  { label: "Recebimentos", icon: ArrowDownCircle, to: "/recebimentos" },
  { label: "Pagamentos", icon: ArrowUpCircle, to: "/pagamentos" },
  { label: "Planejamento", icon: TrendingUp, to: "/planejamento" },
  { label: "Comissões", icon: Percent, to: "/comissoes" },
];

type AtendimentosItem = {
  label: string;
  icon: LucideIcon;
  to:
    | "/atendimentos"
    | "/atendimentos/chat"
    | "/atendimentos/pipeline"
    | "/atendimentos/campanhas"
    | "/atendimentos/automacoes";
};

const atendimentosItems: AtendimentosItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/atendimentos" },
  { label: "Chat", icon: MessageCircle, to: "/atendimentos/chat" },
  { label: "Pipeline", icon: Workflow, to: "/atendimentos/pipeline" },
  { label: "Campanhas", icon: Megaphone, to: "/atendimentos/campanhas" },
  { label: "Automação", icon: Bot, to: "/atendimentos/automacoes" },
];

// Espelha a estrutura do menu lateral do desktop pro painel "Mais" do
// celular. Só entram rotas que existem de verdade — no desktop há itens
// desabilitados (ex.: Comissões), que aqui só confundiriam.
const MOBILE_MENU_GROUPS: {
  label: string;
  items: { label: string; icon: LucideIcon; to: string }[];
}[] = [
  {
    label: "Módulos",
    items: [
      { label: "Início", icon: Home, to: "/inicio" },
      { label: "Agenda", icon: CalendarDays, to: "/agenda" },
      { label: "Pacientes", icon: Users, to: "/pacientes" },
      { label: "Configurações", icon: Settings, to: "/configuracoes" },
    ],
  },
  {
    label: "Atendimentos",
    items: [
      { label: "Dashboard", icon: LayoutDashboard, to: "/atendimentos" },
      { label: "Chat", icon: MessageCircle, to: "/atendimentos/chat" },
      { label: "Pipeline", icon: Workflow, to: "/atendimentos/pipeline" },
      { label: "Campanhas", icon: Megaphone, to: "/atendimentos/campanhas" },
      { label: "Automação", icon: Bot, to: "/atendimentos/automacoes" },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { label: "Visão Geral", icon: LayoutGrid, to: "/financeiro" },
      { label: "Recebimentos", icon: ArrowDownCircle, to: "/recebimentos" },
      { label: "Pagamentos", icon: ArrowUpCircle, to: "/pagamentos" },
      { label: "Planejamento", icon: TrendingUp, to: "/planejamento" },
    ],
  },
];

const REAL_ROUTES = new Set(["/financeiro", "/pagamentos", "/recebimentos", "/planejamento"]);
const FINANCE_PATHS = new Set(["/financeiro", "/recebimentos", "/pagamentos", "/planejamento", "/comissoes"]);
const AGENDA_PATHS = new Set(["/agenda"]);
const isPatientsPath = (pathname: string) =>
  pathname === "/pacientes" || pathname.startsWith("/pacientes/");
const isSettingsPath = (pathname: string) => pathname.startsWith("/configuracoes");
const isAtendimentosPath = (pathname: string) =>
  pathname === "/atendimentos" || pathname.startsWith("/atendimentos/");
const STORAGE_KEY = "sidebar-collapsed";

export function Sidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // Dois estados, uma largura.
  //
  // `fixado` é a escolha por clique, que persiste; `espiando` é a abertura por
  // hover, que retrai sozinha. São separados de propósito — só o que muda é a
  // persistência —, e a largura sai de qualquer um dos dois estar ativo.
  const [fixado, setFixado] = useState(false);
  const [espiando, setEspiando] = useState(false);
  const aberto = fixado || espiando;
  // O foco volta para o botão que abriu, e não some no começo da página.
  const recolherRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const fabCtx = useMobileFab();
  const fab = fabCtx?.fab ?? null;
  const navActions = fabCtx?.navActions ?? [];
  const { isAdmin, units } = useUnitSelection();

  const collapsed = !aberto;

  const inFinance = useMemo(
    () =>
      FINANCE_PATHS.has(pathname) ||
      financeItems.some((i) => pathname.startsWith(i.to)),
    [pathname],
  );
  const inAgenda = useMemo(() => AGENDA_PATHS.has(pathname), [pathname]);
  const inPatients = useMemo(() => isPatientsPath(pathname), [pathname]);
  const inSettings = useMemo(() => isSettingsPath(pathname), [pathname]);
  const inInicio = useMemo(() => pathname === "/inicio", [pathname]);
  const inAtendimentos = useMemo(() => isAtendimentosPath(pathname), [pathname]);

  type SidebarView = "modules" | "financeiro" | "agenda" | "atendimentos";
  const [view, setView] = useState<SidebarView>(
    inFinance ? "financeiro" : inAgenda ? "agenda" : inAtendimentos ? "atendimentos" : "modules",
  );

  // Switch view automatically when the route changes
  useEffect(() => {
    if (inPatients || inSettings || inInicio) setView("modules");
    else if (inFinance) setView("financeiro");
    else if (inAgenda) setView("agenda");
    else if (inAtendimentos) setView("atendimentos");
  }, [inFinance, inAgenda, inPatients, inSettings, inInicio, inAtendimentos]);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) setFixado(stored === "false");
    setMounted(true);
  }, []);

  useEffect(() => {
    // Guarda o estado FIXADO, não o visível: senão passar o mouse por cima
    // faria o app "lembrar" de um menu aberto que ninguém pediu para abrir.
    if (mounted) localStorage.setItem(STORAGE_KEY, String(!fixado));
  }, [fixado, mounted]);

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

  // Era "Administrador" cravado para todo mundo, inclusive para quem não é.
  const papel = isAdmin ? "Administrador" : "Equipe";

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
    to: "/inicio" | "/agenda" | "/pacientes" | "/atendimentos" | "/configuracoes" | "/financeiro";
    disabled?: boolean;
  }[] = [
    { label: "Início", icon: Home, to: "/inicio" },
    { label: "Agenda", icon: Calendar, to: "/agenda" },
    { label: "Pacientes", icon: Users, to: "/pacientes" },
    { label: "Atendimentos", icon: MessageCircle, to: "/atendimentos" },
    { label: "Financeiro", icon: Wallet, to: "/financeiro" },
    { label: "Configurações", icon: Settings, to: "/configuracoes" },
  ];

  return (
    <TooltipProvider delayDuration={150}>
      {/* Espaçador no fluxo.
          A ilha em si é `fixed`, mas alguma coisa precisa reservar o lugar
          dela — senão o conteúdo passa por baixo do vidro. Reservar aqui, e
          não com padding em cada tela, é o que permite as 25 rotas ficarem
          como estão: elas continuam sendo `flex` com a navegação de primeiro
          filho, e nem sabem que a navegação passou a flutuar.

          A largura é ilha + respiro da borda + ar até o conteúdo, e transiciona
          junto com a ilha, no mesmo tempo e na mesma curva, para as duas se
          moverem como uma coisa só. */}
      <div
        aria-hidden="true"
        className="hidden lg:block shrink-0 transition-[width] duration-[320ms] ease-spring"
        style={{
          width: collapsed
            ? "calc(var(--nav-gutter) + var(--nav-collapsed) + var(--nav-gap))"
            : "calc(var(--nav-gutter) + var(--nav-expanded) + var(--nav-gap))",
        }}
      />
      <aside
        id="menu-principal"
        aria-label="Navegação principal"
        onKeyDown={(e) => {
          // Escape recolhe quando o foco está dentro da navegação — o mesmo
          // gesto de fechar de qualquer painel. Limpa OS DOIS estados: zerar
          // só o fixado faria o Escape parecer inerte, com o menu seguindo
          // aberto pelo hover.
          if (e.key === "Escape" && aberto) {
            setFixado(false);
            setEspiando(false);
            recolherRef.current?.focus();
          }
        }}
        onPointerEnter={(e) => {
          // Exclui o toque, em vez de exigir mouse: `pointerType === "mouse"`
          // falha fechado em qualquer ambiente que não reporte o tipo, e caneta
          // também paira de verdade. No toque, `pointerenter` chega junto com o
          // toque no destino — sem esta guarda o menu pisca aberto a cada toque.
          if (e.pointerType !== "touch") setEspiando(true);
        }}
        // Sem guarda nenhuma na saída: um `enter` sem o `leave` correspondente
        // deixaria a ilha aberta para sempre.
        onPointerLeave={() => setEspiando(false)}
        // Foco entrando na ilha revela os rótulos do mesmo jeito que o hover —
        // rótulo que só o mouse alcança é rótulo que parte das pessoas nunca lê.
        onFocus={() => setEspiando(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEspiando(false);
        }}
        className={cn(
          "nav-island hidden lg:flex flex-col gap-6 py-5 glass-island",
          // `top` e `bottom` pareados, nunca `height: 100vh`: no celular a
          // altura da janela muda quando a barra de endereço some, e `100vh`
          // transborda a tela.
          "fixed left-[var(--nav-gutter)] top-[var(--nav-gutter)] bottom-[var(--nav-gutter)] z-40",
          "rounded-3xl transition-[width] duration-[320ms] ease-spring",
          collapsed ? "items-center px-2" : "items-stretch px-3",
        )}
        style={{ width: collapsed ? "var(--nav-collapsed)" : "var(--nav-expanded)" }}
      >
        {/* Marca + alternar.
            A marca fica ancorada na mesma posição x nos dois estados — é o que
            evita a sensação de que a ilha inteira pulou ao expandir. */}
        <div className={cn("flex items-center", collapsed ? "flex-col gap-2" : "justify-between")}>
          <div className={cn("flex items-center gap-3", collapsed && "flex-col")}>
            <div className="h-11 w-11 rounded-xl bg-gradient-primary text-white grid place-items-center font-bold text-lg shadow-2 shrink-0">
              N
            </div>
            {!collapsed && (
              <span className="font-semibold text-foreground text-sm">NÓS Conecta</span>
            )}
          </div>
          {/* Rótulo e ícone seguem o FIXADO, não o estado visível: seguindo o
              visível, mudariam sozinhos enquanto o mouse passa por cima, e o
              botão diria "recolher" sem que ninguém tenha aberto nada. */}
          <button
            ref={recolherRef}
            type="button"
            onClick={() => setFixado((v) => !v)}
            aria-expanded={aberto}
            aria-controls="menu-principal"
            className="h-9 w-9 grid place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label={fixado ? "Recolher menu" : "Manter menu aberto"}
          >
            {fixado ? (
              <PanelLeftClose className="h-[16px] w-[16px]" strokeWidth={1.75} />
            ) : (
              <PanelLeftOpen className="h-[16px] w-[16px]" strokeWidth={1.75} />
            )}
          </button>
        </div>

        {/* Nav */}
        <nav
          className={cn(
            // `min-h-0` + rolagem própria: sem os dois, uma lista longa empurra
            // o rodapé (unidade, conta, sair) para fora da ilha em vez de rolar.
            "flex-1 flex flex-col gap-1.5 min-h-0 overflow-y-auto scrollbar-none",
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
                    "press flex items-center rounded-xl text-muted-foreground hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
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
                <span className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground px-3 mb-1">
                  Agenda
                </span>
              )}

              {maybeTooltip(
                <Link
                  to="/agenda"
                  className={cn(
                    "press flex items-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    collapsed ? "h-12 w-12 justify-center" : "h-12 w-full px-3 gap-3",
                    pathname === "/agenda"
                      ? "bg-foreground text-white"
                      : "text-muted-foreground hover:bg-surface-subtle hover:text-foreground",
                  )}
                  aria-label="Agenda"
                  aria-current={pathname === "/agenda" ? "page" : undefined}
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
                <span className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground px-3 mb-1">
                  Módulos
                </span>
              )}
              {modules.map((m) => {
                const active =
                  m.to === "/pacientes"
                    ? inPatients
                    : m.to === "/configuracoes"
                      ? inSettings
                      : m.to === "/atendimentos"
                        ? inAtendimentos
                        : pathname === m.to;
                const className = cn(
                  "press flex items-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  collapsed ? "h-12 w-12 justify-center" : "h-12 w-full px-3 gap-3",
                  active
                    ? "bg-foreground text-white"
                    : m.disabled
                      ? "text-muted-foreground opacity-40 cursor-not-allowed"
                      : "text-foreground hover:bg-surface-subtle",
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
                      <Link
                        to={m.to}
                        className={className}
                        aria-label={m.label}
                        aria-current={active ? "page" : undefined}
                      >
                        {inner}
                      </Link>,
                      m.label,
                    )}
                  </div>
                );
              })}
            </>
          ) : view === "atendimentos" ? (
            <>
              {/* Back to modules */}
              {maybeTooltip(
                <button
                  type="button"
                  onClick={() => setView("modules")}
                  className={cn(
                    "press flex items-center rounded-xl text-muted-foreground hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
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
                <span className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground px-3 mb-1">
                  Atendimentos
                </span>
              )}

              {atendimentosItems.map((it) => {
                const active = it.to === "/atendimentos" ? pathname === it.to : pathname.startsWith(it.to);
                const className = cn(
                  "press flex items-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  collapsed ? "h-12 w-12 justify-center" : "h-12 w-full px-3 gap-3",
                  active
                    ? "bg-foreground text-white"
                    : "text-muted-foreground hover:bg-surface-subtle hover:text-foreground",
                );
                const inner = (
                  <>
                    <it.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                    {!collapsed && <span className="text-sm font-medium truncate">{it.label}</span>}
                  </>
                );
                return (
                  <div key={it.label}>
                    {maybeTooltip(
                      <Link
                        to={it.to}
                        className={className}
                        aria-label={it.label}
                        aria-current={active ? "page" : undefined}
                      >
                        {inner}
                      </Link>,
                      it.label,
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
                    "press flex items-center rounded-xl text-muted-foreground hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
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
                <span className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground px-3 mb-1">
                  Financeiro
                </span>
              )}

              {financeItems.map((it) => {
                const active = pathname === it.to || pathname.startsWith(it.to);
                const isReal = REAL_ROUTES.has(it.to);
                const className = cn(
                  "press flex items-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  collapsed ? "h-12 w-12 justify-center" : "h-12 w-full px-3 gap-3",
                  active
                    ? "bg-foreground text-white"
                    : "text-muted-foreground hover:bg-surface-subtle hover:text-foreground",
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
                  <Link
                    to={it.to as "/" | "/recebimentos" | "/pagamentos" | "/planejamento"}
                    className={className}
                    aria-label={it.label}
                    aria-current={active ? "page" : undefined}
                  >
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
          {/* Selo de plano, não botão: não havia `onClick` nenhum aqui — era um
              botão que não fazia nada, e o degradê ainda disputava atenção com
              a ação principal de cada tela. Como informação, o mesmo conteúdo
              é honesto e para de competir. */}
          {maybeTooltip(
            <div
              className={cn(
                "flex items-center rounded-xl bg-coral-soft text-coral",
                collapsed ? "h-11 w-11 justify-center" : "h-11 w-full px-3 gap-3",
              )}
            >
              <Sparkles className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
              {!collapsed && <span className="text-sm font-semibold">Plano Premium</span>}
            </div>,
            "Plano Premium",
          )}

          {maybeTooltip(
            <div
              className={cn(
                "flex items-center",
                collapsed
                  ? "h-10 w-10 rounded-full bg-surface-muted border border-border text-foreground justify-center text-xs font-semibold"
                  : "h-12 w-full rounded-xl px-3 gap-3",
              )}
            >
              {collapsed ? (
                userInitial
              ) : (
                <>
                  <span className="h-8 w-8 rounded-full bg-surface-muted border border-border grid place-items-center text-xs font-semibold shrink-0">
                    {userInitial}
                  </span>
                  <span className="flex flex-col text-left leading-tight min-w-0">
                    <span className="text-sm font-medium text-foreground truncate">
                      {userName}
                    </span>
                    <span className="text-2xs text-muted-foreground truncate">{papel}</span>
                  </span>
                </>
              )}
            </div>,
            `${userName} · ${papel}`,
          )}

          {isAdmin && units.length > 1 && maybeTooltip(<UnitSwitcher collapsed={collapsed} />, "Unidade")}

          {maybeTooltip(
            <button
              type="button"
              onClick={handleSignOut}
              className={cn(
                "press flex items-center rounded-xl text-muted-foreground hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
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
        className="nav-island-mobile lg:hidden fixed z-50 flex items-center justify-between material-bar"
        style={{
          left: 16,
          right: 16,
          // O marginBottom com env() abaixo era inerte até o viewport-fit=cover
          // entrar; agora ele vale de verdade. Em aparelho com barra de gestos
          // o inset já afasta o suficiente, então o respiro fixo cai de 14 para
          // 8 e a ilha não descola demais da borda.
          bottom: 8,
          height: 68,
          borderRadius: "var(--radius-island)",
          // O fundo vem do utilitário `material-bar` (vidro fosco, com volta
          // para superfície sólida quando o sistema pede menos transparência).
          boxShadow: "var(--shadow-3)",
          border: "1px solid var(--border)",
          paddingLeft: 6,
          paddingRight: 6,
          marginBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {(() => {
          const navItems = [
            { label: "Financeiro", icon: LayoutGrid, to: "/financeiro" as const },
            { label: "Recebimentos", icon: ArrowDownCircle, to: "/recebimentos" as const },
            { label: "Pagamentos", icon: ArrowUpCircle, to: "/pagamentos" as const },
            { label: "Planejamento", icon: TrendingUp, to: "/planejamento" as const },
          ];
          const left = navItems.slice(0, 2);
          const right = navItems.slice(2);

          const renderItem = (item: (typeof navItems)[number]) => {
            const active = pathname === item.to || pathname.startsWith(item.to);
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
                    borderRadius: 9999,
                    background: active ? "var(--coral-soft)" : "transparent",
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
                      color: active ? "var(--coral)" : "var(--muted-foreground)",
                    }}
                    strokeWidth={2}
                  />
                </span>
                <span
                  style={{
                    fontFamily: "Inter, sans-serif",
                    // Texto miúdo precisa de tracking POSITIVO para respirar;
                    // o negativo (herdado do corpo) fechava as letras e é o
                    // contrário do que o tamanho pede.
                    fontSize: "0.625rem",
                    fontWeight: 500,
                    letterSpacing: "0.01em",
                    lineHeight: 1,
                    color: active ? "var(--coral)" : "var(--muted-foreground)",
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
              <Link
                key={item.label}
                to={item.to}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className="press rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                style={wrapperStyle}
              >
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
              // O deslocamento saiu do style inline e virou classe: inline
              // vence classe, e sem isso o `:active` não conseguiria compor a
              // escala com o translate.
              className="press-fab bg-gradient-primary shadow-soft"
              style={{
                width: 56,
                height: 56,
                borderRadius: 9999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                flexShrink: 0,
                border: "4px solid white",
                opacity: fabActive ? 1 : 0.4,
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
                      borderRadius: 9999,
                      background: "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <a.icon style={{ width: 18, height: 18, color: "var(--muted-foreground)" }} strokeWidth={2} />
                  </span>
                  <span
                    style={{
                      fontFamily: "Inter, sans-serif",
                      fontSize: "0.625rem",
                      fontWeight: 500,
                      letterSpacing: "0.01em",
                      lineHeight: 1,
                      color: "var(--muted-foreground)",
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
                  className="press rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
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

          if (pathname === "/inicio" || inPatients || inSettings || inAtendimentos) {
            // Dentro de um módulo com submenu, a barra mostra o submenu —
            // espelha o que o menu lateral faz no desktop. Fora dele, mostra
            // os módulos principais. "Mais" abre o resto em vez de ir direto
            // pra Configurações, que escondia todas as outras opções.
            const homeItems: {
              label: string;
              icon: LucideIcon;
              to: string | null;
              isReal: boolean;
            }[] = inAtendimentos
              ? [
                  ...atendimentosItems.map((it) => ({
                    label: it.label,
                    icon: it.icon,
                    to: it.to as string,
                    isReal: true,
                  })),
                  { label: "Mais", icon: MoreHorizontal, to: null, isReal: true },
                ]
              : [
                  { label: "Início", icon: Home, to: "/inicio", isReal: true },
                  { label: "Agenda", icon: Calendar, to: "/agenda", isReal: true },
                  { label: "Pacientes", icon: Users, to: "/pacientes", isReal: true },
                  { label: "Financeiro", icon: Wallet, to: "/financeiro", isReal: true },
                  { label: "Mais", icon: MoreHorizontal, to: null, isReal: true },
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
                    (item.to === "/atendimentos"
                      ? pathname === item.to
                      : pathname === item.to ||
                        (item.to === "/pacientes" && inPatients) ||
                        (item.to.startsWith("/atendimentos/") && pathname.startsWith(item.to)));
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
                          borderRadius: 9999,
                          background: active ? "var(--coral-soft)" : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transition: "all 0.25s ease",
                        }}
                      >
                        <item.icon
                          style={{ width: 18, height: 18, color: active ? "var(--coral)" : "var(--muted-foreground)" }}
                          strokeWidth={2}
                        />
                      </span>
                      <span
                        style={{
                          fontFamily: "Inter, sans-serif",
                          fontSize: "0.625rem",
                          fontWeight: 500,
                          letterSpacing: "0.01em",
                          lineHeight: 1,
                          color: active ? "var(--coral)" : "var(--muted-foreground)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.label}
                      </span>
                    </span>
                  );
                  if (!item.to) {
                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => setMoreOpen(true)}
                        aria-label="Mais opções"
                        className="press rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        style={homeItemStyle}
                      >
                        {iconEl}
                      </button>
                    );
                  }
                  if (!item.isReal) {
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
                      aria-current={active ? "page" : undefined}
                      className="press rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
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

      {/* Painel "Mais" (mobile): antes o botão ia direto pras Configurações,
          então todo o resto do sistema ficava sem caminho no celular. Aqui
          ficam os módulos e, nos que têm submenu, os itens deles — mesma
          estrutura do menu lateral do desktop. */}
      <Drawer open={moreOpen} onOpenChange={setMoreOpen}>
        <DrawerContent className="max-h-[80dvh] lg:hidden">
          <DrawerHeader className="text-left">
            <DrawerTitle className="text-base">Navegar</DrawerTitle>
          </DrawerHeader>

          <div className="mt-2 space-y-5 px-4 pb-4">
            {MOBILE_MENU_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="px-1 text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </p>
                <div className="mt-1.5 space-y-0.5">
                  {group.items.map((item) => {
                    const active =
                      item.to === "/atendimentos" || item.to === "/pacientes"
                        ? pathname === item.to
                        : pathname === item.to || pathname.startsWith(`${item.to}/`);
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={() => setMoreOpen(false)}
                        className={cn(
                          "flex h-12 w-full items-center gap-3 rounded-2xl px-3 transition-colors",
                          active ? "bg-foreground text-white" : "text-foreground hover:bg-surface-subtle",
                        )}
                      >
                        <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                        <span className="text-sm font-medium">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Mobile top-right home button.
          Escondido em Atendimentos: ele é `fixed` e caía em cima do
          cabeçalho da conversa, colidindo com o seletor de etapa do
          pipeline. Não se perde navegação — a barra inferior já mostra
          "Início" nessas telas. */}
      <Link
        to="/inicio"
        className={cn(
          "lg:hidden fixed z-40 flex items-center justify-center",
          (pathname === "/inicio" || inAtendimentos || (inPatients && pathname !== "/pacientes")) && "hidden",
        )}
        style={{
          // Em standalone com notch, um top fixo colide com a status bar.
          top: "calc(env(safe-area-inset-top) + 20px)",
          right: 16,
          width: 52,
          height: 52,
          borderRadius: "var(--radius-card)",
          background: "var(--card)",
          border: "1px solid var(--surface-muted)",
          boxShadow: "var(--shadow-2)",
        }}
        aria-label="Home"
      >
        <Home className="h-[21px] w-[21px] text-foreground" strokeWidth={1.75} />
      </Link>
    </TooltipProvider>
  );
}
