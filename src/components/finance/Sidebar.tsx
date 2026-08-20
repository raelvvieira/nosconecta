import {
  Home,
  LogOut,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  MoreHorizontal,
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
import { CabecalhoDeSecao } from "@/components/layout/CabecalhoDeSecao";
import { ItemDeMenu } from "@/components/layout/ItemDeMenu";
import { BotaoDaIlha, LinkDaIlha } from "@/components/layout/ItemDaIlha";
import {
  ACOES_DA_AGENDA,
  GRUPOS_DO_MAIS,
  ITENS_ATENDIMENTOS,
  ITENS_FINANCEIRO,
  MODULOS,
  SUBMENUS,
  navegaveis,
  type ItemDoMenu,
} from "@/components/layout/destinos";

// As listas de destino (módulos, itens do financeiro, itens de atendimentos e
// os grupos da gaveta "Mais") moravam aqui, cada uma declarada por conta
// própria. Agora vêm de `destinos.ts` — ver o comentário de lá sobre o ícone da
// Agenda, que era o sintoma visível dessa duplicação.

const FINANCE_PATHS = new Set(ITENS_FINANCEIRO.map((i) => i.to));
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
  const handlers = fabCtx?.handlers ?? {};
  const { isAdmin, units } = useUnitSelection();

  const collapsed = !aberto;

  const inFinance = useMemo(() => FINANCE_PATHS.has(pathname), [pathname]);
  const inAgenda = useMemo(() => pathname === "/agenda", [pathname]);
  const inPatients = useMemo(() => isPatientsPath(pathname), [pathname]);
  const inSettings = useMemo(() => isSettingsPath(pathname), [pathname]);
  const inAtendimentos = useMemo(() => isAtendimentosPath(pathname), [pathname]);

  // Qual seção o menu mostra é DERIVADO da rota, não guardado em estado e
  // sincronizado por efeito. O efeito rodava depois da pintura, então trocar de
  // página desenhava um quadro com a seção anterior antes de se corrigir — é
  // parte do "abre errado e depois arruma".
  //
  // Só existe submenu para módulo com mais de uma página. A Agenda tinha um
  // submenu de UM item: entrar nela trocava a lista de módulos por "‹ Módulos"
  // + "AGENDA" + um link para a própria Agenda. Era isso que empurrava o rótulo
  // uma linha para baixo, sem entregar navegação nenhuma em troca.
  const secaoDaRota = inFinance ? "financeiro" : inAtendimentos ? "atendimentos" : null;

  // O "‹ Módulos" é um desvio momentâneo: vale enquanto a pessoa não sai da
  // seção. Guardar a rota em que o desvio foi pedido (e não um booleano) é o
  // que faz ele expirar sozinho ao navegar, sem nenhum efeito para limpá-lo.
  const [rotaDoDesvio, setRotaDoDesvio] = useState<string | null>(null);
  const setVoltouAosModulos = (v: boolean) => setRotaDoDesvio(v ? pathname : null);
  const submenu = rotaDoDesvio === pathname || !secaoDaRota ? null : SUBMENUS[secaoDaRota];

  // Duas leituras de "ativo", porque a pergunta é diferente em cada lista.
  //
  // Na lista de MÓDULOS, "Financeiro" está ativo em qualquer tela financeira —
  // é o módulo inteiro que está aceso. Já DENTRO do módulo, "Visão Geral" só
  // acende na Visão Geral, senão o submenu inteiro apareceria aceso de uma vez.
  const moduloAtivo = (destino: ItemDoMenu) => {
    if (destino.to === "/pacientes") return inPatients;
    if (destino.to === "/configuracoes") return inSettings;
    if (destino.to === "/atendimentos") return inAtendimentos;
    if (destino.to === "/financeiro") return inFinance;
    return pathname === destino.to;
  };
  const itemAtivo = (destino: ItemDoMenu) =>
    destino.to === "/atendimentos" || destino.to === "/financeiro"
      ? pathname === destino.to
      : pathname === destino.to || pathname.startsWith(`${destino.to}/`);

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
          {/* Uma vista, um cabeçalho, uma lista.
              Antes havia quatro blocos escritos à mão aqui, com o botão
              "voltar" repetido palavra por palavra em três deles — e foi assim
              que o ícone da Agenda acabou sendo `Calendar` na lista de módulos
              e `CalendarDays` dentro do módulo. */}
          <CabecalhoDeSecao
            titulo={submenu ? submenu.titulo : "Módulos"}
            collapsed={collapsed}
            onVoltar={submenu ? () => setVoltouAosModulos(true) : undefined}
          />

          {(submenu ? submenu.itens : MODULOS).map((destino) => (
            <div key={destino.to}>
              <ItemDeMenu
                destino={destino}
                ativo={submenu ? itemAtivo(destino) : moduloAtivo(destino)}
                collapsed={collapsed}
              />
            </div>
          ))}
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

      {/* Ilha inferior do celular.
          Uma peça só. Antes havia três blocos escritos à mão aqui — o do
          financeiro, o da agenda e o de início/pacientes/configurações — e eles
          tinham divergido em tudo que dá para perceber usando: transição,
          estado ativo e, principalmente, a largura de cada item. */}
      <nav
        aria-label="Navegação"
        className="nav-island-mobile lg:hidden fixed z-50 flex items-center justify-center material-bar"
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
          gap: 2,
          marginBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {(() => {
          const fabAtivo = !!fab;
          const botaoFab = (
            <button
              type="button"
              onClick={() => fab?.onClick()}
              disabled={!fabAtivo}
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
                opacity: fabAtivo ? 1 : 0.4,
              }}
            >
              <Plus style={{ width: 26, height: 26 }} strokeWidth={2.5} />
            </button>
          );

          // Agenda: duas ações da própria tela, com o "+" no meio.
          //
          // A FORMA vem de `destinos.ts`, não da página. Antes a página
          // registrava rótulo, ícone e ação juntos ao montar — e a ilha também
          // é desenhada durante o carregamento da rota, quando a página ainda
          // não montou. A lista chegava vazia e sobrava só o "+", encostado na
          // borda esquerda pelo `justify-between`. Era a tela errada que
          // aparecia antes da certa.
          if (inAgenda) {
            const [esquerda, direita] = [ACOES_DA_AGENDA[0], ACOES_DA_AGENDA[1]];
            return (
              <>
                <BotaoDaIlha label={esquerda.label} icon={esquerda.icon} onClick={handlers[esquerda.id]} />
                {botaoFab}
                <BotaoDaIlha label={direita.label} icon={direita.icon} onClick={handlers[direita.id]} />
              </>
            );
          }

          // Dentro de um módulo com submenu, a barra mostra o submenu — espelha
          // o que a ilha do desktop faz. Fora dele, mostra os módulos.
          if (inFinance) {
            const itens = ITENS_FINANCEIRO.filter((i) => !i.placeholder);
            return (
              <>
                {itens.slice(0, 2).map((d) => (
                  <LinkDaIlha key={d.to} to={d.to} label={d.label} icon={d.icon} ativo={itemAtivo(d)} />
                ))}
                {botaoFab}
                {itens.slice(2).map((d) => (
                  <LinkDaIlha key={d.to} to={d.to} label={d.label} icon={d.icon} ativo={itemAtivo(d)} />
                ))}
              </>
            );
          }

          const itens = inAtendimentos
            ? ITENS_ATENDIMENTOS
            : MODULOS.filter((m) => m.to !== "/configuracoes" && m.to !== "/atendimentos");
          return (
            <>
              {itens.map((d) => (
                <LinkDaIlha
                  key={d.to}
                  to={d.to}
                  label={d.label}
                  icon={d.icon}
                  ativo={inAtendimentos ? itemAtivo(d) : moduloAtivo(d)}
                />
              ))}
              <BotaoDaIlha label="Mais" icon={MoreHorizontal} onClick={() => setMoreOpen(true)} />
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
            {GRUPOS_DO_MAIS.map((group) => (
              <div key={group.label}>
                <p className="px-1 text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </p>
                <div className="mt-1.5 space-y-0.5">
                  {navegaveis(group.itens).map((item) => {
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
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-2)",
        }}
        aria-label="Home"
      >
        <Home className="h-[21px] w-[21px] text-foreground" strokeWidth={1.75} />
      </Link>
    </TooltipProvider>
  );
}
