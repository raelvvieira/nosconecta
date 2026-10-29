import { Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowDownCircle,
  CalendarDays,
  ChevronRight,
  CreditCard,
  DollarSign,
  LogOut,
  Palette,
  Settings2,
  UserPlus,
  UserRound,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRegisterMobileFab } from "@/components/finance/mobile-fab-context";
import { GrupoDeKpis } from "@/components/finance/GrupoDeKpis";
import { KpiCard } from "@/components/finance/KpiCard";
import { SinoDeAvisos } from "@/components/layout/SinoDeAvisos";
import type { HomeData } from "@/components/home/home-data";
import { formatBRL } from "@/lib/finance/format";
import { useGreetingUser } from "@/components/home/use-greeting-user";
import { cn } from "@/lib/utils";
import { PrimeirosPassos } from "@/components/home/PrimeirosPassos";

// Esta tela era escrita em estilo inline linha a linha — 53 blocos de `style`,
// com raio, sombra, cor e tamanho de texto cravados um a um. Era o lugar do
// app onde o design mais escapava do sistema, e onde qualquer ajuste de token
// simplesmente não chegava.
//
// Mesmo conteúdo, mesmas ações, mesmos destinos: o que muda é que agora ela
// usa os cartões, a escala tipográfica e os tokens do resto do app.

function Cabecalho() {
  const navigate = useNavigate();
  const { firstName, greeting } = useGreetingUser();
  return (
    <header className="flex items-start justify-between gap-3 px-6 pt-[calc(env(safe-area-inset-top)+52px)]">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-foreground">
          {greeting}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Resumo da clínica hoje</p>
      </div>
      <div className="flex shrink-0 gap-2.5">
        {/* Eram um botão e um bloco sem ação nenhuma. Agora levam aonde a
            informação de fato mora — sino para as notificações, inicial para a
            conta —, em vez de parecerem clicáveis e não fazerem nada. */}
        <SinoDeAvisos className="h-[52px] w-[52px] shrink-0 !rounded-xl shadow-2" />
        {/* A conta: um ícone de pessoa, não a inicial — a clínica estranhou o
            "R" num quadrado dourado sem saber o que fazia. Abre um menu com
            Aparência, Configurações e Sair. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Conta"
              className="press grid h-[52px] w-[52px] place-items-center rounded-xl border border-border bg-card text-foreground shadow-2"
            >
              <UserRound className="h-[22px] w-[22px]" strokeWidth={1.75} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 rounded-2xl p-1.5">
            <p className="px-2.5 pb-1.5 pt-1 text-xs text-muted-foreground">
              {firstName ? `Olá, ${firstName}` : "Sua conta"}
            </p>
            <DropdownMenuItem
              className="gap-2.5 rounded-xl py-2.5"
              onSelect={() => navigate({ to: "/configuracoes/aparencia" })}
            >
              <Palette className="h-4 w-4" /> Aparência
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2.5 rounded-xl py-2.5"
              onSelect={() => navigate({ to: "/configuracoes" })}
            >
              <Settings2 className="h-4 w-4" /> Configurações
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2.5 rounded-xl py-2.5 text-danger"
              onSelect={async () => {
                await supabase.auth.signOut();
                toast.success("Sessão encerrada.");
                navigate({ to: "/auth", replace: true });
              }}
            >
              <LogOut className="h-4 w-4" /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function cartoesResumo(dados: HomeData) {
  // Os dois cartões de dinheiro saem da lista para quem não vê o financeiro —
  // ver o comentário em `DesktopHome`. O filtro no fim da lista mantém a ordem
  // dos que ficam.
  return [
    {
      icon: CalendarDays,
      tone: "violet" as const,
      title: "Agenda de hoje",
      value: String(dados.agendaHoje.total),
      // A legenda de antes ("atendimentos", "pacientes aguardando") repetia o
      // rótulo com outras palavras. No lugar dela fica o destino do toque —
      // que é o que o cartão faz de fato.
      nota: "Ver agenda →",
      notaClass: "text-pink",
      to: "/agenda" as const,
    },
    {
      icon: Users,
      tone: "violet" as const,
      title: "Confirmações pendentes",
      value: String(dados.confirmacoesPendentes),
      nota: "Confirmar agora →",
      notaClass: "text-violet",
      to: "/agenda" as const,
    },
    {
      icon: DollarSign,
      tone: "success" as const,
      title: "Recebido hoje",
      value: formatBRL(dados.recebidoHoje),
      corNoValor: true,
      nota: "Recebimentos →",
      notaClass: "text-success",
      to: "/recebimentos" as const,
      soComFinanceiro: true,
    },
    {
      icon: AlertTriangle,
      tone: "danger" as const,
      title: "Alertas",
      value: String(dados.alertas.total),
      // Aqui a legenda carrega informação que o rótulo não tem — o valor em
      // atraso —, então ela toma o lugar do texto de ação. O cartão inteiro
      // continua sendo o link.
      nota:
        dados.alertas.valorEmAtraso > 0
          ? `${formatBRL(dados.alertas.valorEmAtraso)} em atraso`
          : "Recebimentos →",
      notaClass: "text-danger",
      to: "/recebimentos" as const,
      soComFinanceiro: true,
    },
  ].filter((c) => dados.verFinanceiro || !("soComFinanceiro" in c && c.soComFinanceiro));
}

function Resumo({ dados }: { dados: HomeData }) {
  return (
    <div className="px-6 pt-7">
      <GrupoDeKpis>
        {cartoesResumo(dados).map((card) => (
          <Link key={card.title} to={card.to} className="press flex min-w-0 flex-col">
            <KpiCard
              className="flex-1"
              label={card.title}
              value={card.value}
              icon={card.icon}
              tone={card.tone}
              corNoValor={card.corNoValor}
              nota={<span className={cn("font-semibold", card.notaClass)}>{card.nota}</span>}
              footer={<span className={cn("font-semibold", card.notaClass)}>{card.nota}</span>}
            />
          </Link>
        ))}
      </GrupoDeKpis>
    </div>
  );
}

function ProximosAtendimentos({ dados }: { dados: HomeData }) {
  return (
    <section className="px-6 pt-7">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">Próximos atendimentos</h2>
        <Link to="/agenda" className="text-sm font-semibold text-pink">
          Ver todos
        </Link>
      </div>

      <div className="surface-card overflow-hidden">
        {dados.proximos.length === 0 ? (
          <p className="px-4 py-5 text-sm text-muted-foreground">
            Nenhum atendimento pendente para o resto de hoje.
          </p>
        ) : (
          dados.proximos.map((appt, i) => (
            <div
              key={appt.id}
              className={cn(
                "flex h-[74px] items-center gap-3 px-3.5",
                i < dados.proximos.length - 1 && "border-b border-border",
              )}
            >
              <div className="flex w-[70px] shrink-0 items-center gap-2">
                <span
                  className="h-7 w-[3px] shrink-0 rounded-full"
                  style={{ background: appt.accentColor }}
                />
                <span className="text-sm font-bold tabular-nums text-foreground">{appt.time}</span>
              </div>
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold"
                style={{ background: appt.avatarBg, color: appt.accentColor }}
              >
                {appt.initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-foreground">{appt.patient}</p>
                <p className="truncate text-xs text-muted-foreground">{appt.procedure}</p>
              </div>
              <span
                className={cn(
                  "flex h-[26px] shrink-0 items-center rounded-full px-2.5 text-2xs font-semibold",
                  appt.confirmado ? "bg-success-soft text-success" : "bg-warning-soft text-warning",
                )}
              >
                {appt.confirmado ? "Confirmado" : "Pendente"}
              </span>
              <ChevronRight
                className="h-[15px] w-[15px] shrink-0 text-foreground-subtle"
                strokeWidth={2}
              />
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function AcoesRapidas() {
  const navigate = useNavigate();
  const acoes = [
    {
      label: "Agendar",
      icon: CalendarDays,
      principal: false,
      iconClass: "bg-pink-soft text-pink",
      onClick: () => navigate({ to: "/agenda" }),
    },
    {
      label: "Paciente",
      icon: UserPlus,
      principal: false,
      iconClass: "bg-violet-soft text-violet",
      onClick: () => navigate({ to: "/pacientes", search: { status: "all" } }),
    },
    {
      label: "Recebimento",
      icon: ArrowDownCircle,
      principal: false,
      iconClass: "bg-success-soft text-success",
      onClick: () => navigate({ to: "/recebimentos" }),
    },
    {
      label: "Pagamento",
      icon: CreditCard,
      principal: false,
      iconClass: "bg-warning-soft text-warning",
      onClick: () => navigate({ to: "/pagamentos" }),
    },
  ];

  return (
    <section className="px-6 pt-7">
      <h2 className="mb-3 text-xl font-bold text-foreground">Ações rápidas</h2>
      <div className="grid grid-cols-2 gap-3">
        {acoes.map((a) => (
          <button
            key={a.label}
            type="button"
            className={cn(
              // Quatro iguais, nenhum em degradê: o degradê é da ação principal
              // da tela, e numa grade de atalhos não há uma — o que havia era
              // um azulejo dourado com o texto cortado ao lado de três
              // brancos (padrão de botões, 23/10).
              // Ícone em cima, palavra embaixo: lado a lado, "Recebimento" não
              // cabia em meia tela e saía cortado.
              "press surface-card flex min-w-0 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl px-3 py-4 text-center text-foreground",
            )}
            onClick={a.onClick}
          >
            <span
              className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", a.iconClass)}
            >
              <a.icon className="h-5 w-5" strokeWidth={1.75} />
            </span>
            {/* Uma palavra, sem quebra: "Novo agendamento" em duas linhas num
                azulejo de meia tela saía cortado. O ícone já diz o que é. */}
            <span className="max-w-full truncate text-[13px] font-semibold">{a.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function PrecisaAtencao({ dados }: { dados: HomeData }) {
  const navigate = useNavigate();
  return (
    <section className="px-6 pt-7">
      <h2 className="mb-3 text-xl font-bold text-foreground">Precisa de atenção</h2>
      <div className="surface-card overflow-hidden">
        {dados.atencao.length === 0 ? (
          <p className="px-4 py-5 text-sm text-muted-foreground">Nada pendente por aqui.</p>
        ) : (
          dados.atencao.map((item, i) => (
            <button
              key={i}
              type="button"
              onClick={() => navigate({ to: item.to })}
              className={cn(
                "press flex h-[58px] w-full cursor-pointer items-center gap-3 px-4 text-left",
                i < dados.atencao.length - 1 && "border-b border-border",
              )}
            >
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                style={{ background: item.bg }}
              >
                <item.icon className="h-4 w-4" style={{ color: item.color }} strokeWidth={1.75} />
              </span>
              <span className="flex-1 text-sm text-foreground-secondary">{item.label}</span>
              <ChevronRight
                className="h-[15px] w-[15px] shrink-0 text-foreground-subtle"
                strokeWidth={2}
              />
            </button>
          ))
        )}
      </div>
    </section>
  );
}

export function MobileHome({ dados }: { dados: HomeData }) {
  useRegisterMobileFab(null);

  return (
    <div className="app-bg custom-scroll w-full min-w-0 flex-1 overflow-x-hidden overflow-y-auto pb-nav lg:hidden">
      <Cabecalho />
      <PrimeirosPassos className="mx-4 mb-4" />
      <Resumo dados={dados} />
      <ProximosAtendimentos dados={dados} />
      <AcoesRapidas />
      <PrecisaAtencao dados={dados} />
    </div>
  );
}
