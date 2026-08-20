import { Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowDownCircle,
  Bell,
  CalendarDays,
  ChevronRight,
  CreditCard,
  DollarSign,
  UserPlus,
  Users,
} from "lucide-react";
import { useRegisterMobileFab } from "@/components/finance/mobile-fab-context";
import type { HomeData } from "@/components/home/home-data";
import { formatBRL } from "@/lib/finance/format";
import { useGreetingUser } from "@/components/home/use-greeting-user";
import { cn } from "@/lib/utils";

// Esta tela era escrita em estilo inline linha a linha — 53 blocos de `style`,
// com raio, sombra, cor e tamanho de texto cravados um a um. Era o lugar do
// app onde o design mais escapava do sistema, e onde qualquer ajuste de token
// simplesmente não chegava.
//
// Mesmo conteúdo, mesmas ações, mesmos destinos: o que muda é que agora ela
// usa os cartões, a escala tipográfica e os tokens do resto do app.

function Cabecalho() {
  const { firstName, initial, greeting } = useGreetingUser();
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
        <Link
          to="/configuracoes/notificacoes"
          aria-label="Notificações"
          className="press relative grid h-[52px] w-[52px] place-items-center rounded-xl border border-surface-muted bg-card shadow-2"
        >
          <Bell className="h-[21px] w-[21px] text-foreground" strokeWidth={1.75} />
        </Link>
        <Link
          to="/configuracoes"
          aria-label="Conta"
          className="press grid h-[52px] w-[52px] place-items-center rounded-xl border-[3px] border-card bg-gradient-primary text-lg font-bold text-white shadow-2"
        >
          {initial}
        </Link>
      </div>
    </header>
  );
}

function cartoesResumo(dados: HomeData) {
  return [
    {
      icon: CalendarDays,
      iconClass: "bg-pink-soft text-pink",
      title: "Agenda de hoje",
      value: String(dados.agendaHoje.total),
      valueClass: "text-foreground",
      subtitle: "atendimentos",
      action: "Ver agenda",
      actionClass: "text-pink",
      to: "/agenda" as const,
    },
    {
      icon: Users,
      iconClass: "bg-violet-soft text-violet",
      title: "Confirmações pendentes",
      value: String(dados.confirmacoesPendentes),
      valueClass: "text-foreground",
      subtitle: "pacientes aguardando",
      action: "Confirmar agora",
      actionClass: "text-violet",
      to: "/agenda" as const,
    },
    {
      icon: DollarSign,
      iconClass: "bg-success-soft text-success",
      title: "Recebido hoje",
      value: formatBRL(dados.recebidoHoje),
      valueClass: "text-success",
      subtitle: "entrou no caixa hoje",
      action: "Ver recebimentos",
      actionClass: "text-success",
      to: "/recebimentos" as const,
    },
    {
      icon: AlertTriangle,
      iconClass: "bg-danger-soft text-danger",
      title: "Alertas",
      value: String(dados.alertas.total),
      valueClass: "text-foreground",
      subtitle:
        dados.alertas.valorEmAtraso > 0
          ? `${formatBRL(dados.alertas.valorEmAtraso)} em atraso`
          : "itens",
      action: "Ver recebimentos",
      actionClass: "text-danger",
      to: "/recebimentos" as const,
    },
  ];
}

function Resumo({ dados }: { dados: HomeData }) {
  return (
    <div className="grid grid-cols-2 gap-3 px-6 pt-7">
      {cartoesResumo(dados).map((card) => (
        <Link
          key={card.title}
          to={card.to}
          className="press surface-card flex min-w-0 flex-col gap-2.5 p-4"
        >
          <div className="flex items-start gap-2.5">
            <span
              className={cn(
                "grid h-9 w-9 shrink-0 place-items-center rounded-md",
                card.iconClass,
              )}
            >
              <card.icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </span>
            <p className="min-w-0 pt-0.5 text-2xs text-muted-foreground">{card.title}</p>
          </div>
          <div className="min-w-0">
            <p className={cn("truncate text-xl font-bold tabular-nums", card.valueClass)}>
              {card.value}
            </p>
            <p className="mt-0.5 text-2xs text-foreground-subtle">{card.subtitle}</p>
          </div>
          <span className={cn("mt-auto text-xs font-semibold", card.actionClass)}>
            {card.action} →
          </span>
        </Link>
      ))}
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
                i < dados.proximos.length - 1 && "border-b border-surface-muted",
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
              <ChevronRight className="h-[15px] w-[15px] shrink-0 text-foreground-subtle" strokeWidth={2} />
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
      label: "Novo\nagendamento",
      icon: CalendarDays,
      principal: true,
      iconClass: "bg-white/20 text-white",
      onClick: () => navigate({ to: "/agenda" }),
    },
    {
      label: "Novo\npaciente",
      icon: UserPlus,
      principal: false,
      iconClass: "bg-violet-soft text-violet",
      onClick: () => navigate({ to: "/pacientes", search: { status: "all" } }),
    },
    {
      label: "Registrar\nrecebimento",
      icon: ArrowDownCircle,
      principal: false,
      iconClass: "bg-success-soft text-success",
      onClick: () => navigate({ to: "/recebimentos" }),
    },
    {
      label: "Novo\npagamento",
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
              "press flex h-[86px] min-w-0 cursor-pointer items-center gap-3.5 rounded-2xl px-4 text-left",
              a.principal
                ? "bg-gradient-primary text-white shadow-brand"
                : "surface-card text-foreground",
            )}
            onClick={a.onClick}
          >
            <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-lg", a.iconClass)}>
              <a.icon className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <span className="min-w-0 overflow-hidden whitespace-pre-line text-sm font-bold">
              {a.label}
            </span>
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
                i < dados.atencao.length - 1 && "border-b border-surface-muted",
              )}
            >
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                style={{ background: item.bg }}
              >
                <item.icon className="h-4 w-4" style={{ color: item.color }} strokeWidth={1.75} />
              </span>
              <span className="flex-1 text-sm text-foreground-secondary">{item.label}</span>
              <ChevronRight className="h-[15px] w-[15px] shrink-0 text-foreground-subtle" strokeWidth={2} />
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
      <Resumo dados={dados} />
      <ProximosAtendimentos dados={dados} />
      <AcoesRapidas />
      <PrecisaAtencao dados={dados} />
    </div>
  );
}
