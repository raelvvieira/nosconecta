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
import {
  appointments,
  attentionItems,
  AGENDA_TODAY_COUNT,
  AGENDA_TODAY_DETAILS,
  PENDING_CONFIRMATIONS_COUNT,
} from "@/components/home/mock-data";
import { useGreetingUser } from "@/components/home/use-greeting-user";

const GRADIENT = "var(--gradient-primary)";

// ─── Card styles ──────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.94)",
  border: "1px solid var(--surface-muted)",
  borderRadius: 22,
  boxShadow: "var(--shadow-2)",
};

// ─── Header ───────────────────────────────────────────────────────────────────

function Header() {
  const { firstName, initial, greeting } = useGreetingUser();
  return (
    <div style={{ padding: "calc(env(safe-area-inset-top) + 52px) 24px 0 24px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        {/* 31px para 27px de corpo (1,15): título grande pede leading
            apertado, senão a saudação que quebra em duas linhas se desfaz. */}
        <h1 style={{ fontSize: "1.5rem", lineHeight: "31px", fontWeight: 700, letterSpacing: "-0.03em", color: "var(--foreground)", margin: 0 }}>
          {greeting}{firstName ? `, ${firstName}` : ""}
        </h1>
        <p style={{ fontSize: "0.875rem", lineHeight: "22px", fontWeight: 400, color: "var(--muted-foreground)", marginTop: 4 }}>
          Resumo da clínica hoje
        </p>
      </div>
      <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
        <button
          type="button"
          style={{ position: "relative", width: 52, height: 52, borderRadius: 17, background: "var(--card)", border: "1px solid var(--surface-muted)", boxShadow: "var(--shadow-2)", display: "flex", alignItems: "center", justifyContent: "center" }}
          aria-label="Notificações"
        >
          <Bell style={{ width: 21, height: 21, color: "var(--foreground)" }} strokeWidth={1.75} />
          <span style={{ position: "absolute", top: 10, right: 10, width: 8, height: 8, background: "var(--danger)", borderRadius: 999, border: "2px solid white" }} />
        </button>
        <div
          style={{ width: 52, height: 52, borderRadius: 17, background: GRADIENT, display: "flex", alignItems: "center", justifyContent: "center", border: "3px solid var(--card)", boxShadow: "var(--shadow-2)", color: "white", fontSize: "1.125rem", fontWeight: 700 }}
          aria-label="Perfil"
        >
          {initial}
        </div>
      </div>
    </div>
  );
}

// ─── Summary cards carousel ───────────────────────────────────────────────────

const SUMMARY_CARDS = [
  {
    icon: CalendarDays,
    iconBg: "color-mix(in oklab, var(--pink) 12%, transparent)",
    iconColor: "var(--pink)",
    title: "Agenda de hoje",
    value: String(AGENDA_TODAY_COUNT),
    valueColor: "var(--foreground)",
    subtitle: "atendimentos",
    details: AGENDA_TODAY_DETAILS,
    action: "Ver agenda",
    actionColor: "var(--pink)",
  },
  {
    icon: Users,
    iconBg: "color-mix(in oklab, var(--violet) 12%, transparent)",
    iconColor: "var(--violet)",
    title: "Confirmações pendentes",
    value: String(PENDING_CONFIRMATIONS_COUNT),
    valueColor: "var(--foreground)",
    subtitle: "pacientes aguardando",
    details: [],
    action: "Confirmar agora",
    actionColor: "var(--violet)",
  },
  {
    icon: DollarSign,
    iconBg: "rgba(34,197,94,0.12)",
    iconColor: "var(--success)",
    title: "Recebimentos de hoje",
    value: "R$ 8.200",
    valueColor: "var(--success)",
    subtitle: "a receber hoje",
    details: [],
    action: "Ver recebimentos",
    actionColor: "var(--success)",
  },
  {
    icon: AlertTriangle,
    iconBg: "rgba(239,68,68,0.10)",
    iconColor: "var(--danger)",
    title: "Alertas",
    value: "3",
    valueColor: "var(--foreground)",
    subtitle: "itens",
    details: [],
    action: "Ver alertas",
    actionColor: "var(--danger)",
  },
] as const;

function SummaryGrid() {
  return (
    <div style={{ padding: "28px 24px 0 24px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        {SUMMARY_CARDS.map((card, i) => (
          <div
            key={i}
            style={{ ...cardStyle, minWidth: 0, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}
          >
            {/* Icon + label row */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 12, background: card.iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <card.icon style={{ color: card.iconColor, width: 18, height: 18 }} strokeWidth={1.75} />
              </div>
              <p style={{ fontSize: "0.6875rem", color: "var(--muted-foreground)", lineHeight: "15px", margin: 0, paddingTop: 2, minWidth: 0 }}>{card.title}</p>
            </div>

            {/* Value */}
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: "1.25rem", fontWeight: 700, color: card.valueColor, letterSpacing: "-0.02em", margin: 0, lineHeight: "24px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{card.value}</p>
              <p style={{ fontSize: "0.6875rem", color: "var(--foreground-subtle)", margin: "2px 0 0" }}>{card.subtitle}</p>
            </div>

            {/* Footer action */}
            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: card.actionColor, marginTop: "auto" }}>
              {card.action} →
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Next appointments ────────────────────────────────────────────────────────

function NextAppointments() {
  return (
    <div style={{ padding: "28px 24px 0 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--foreground)", margin: 0 }}>
          Próximos atendimentos
        </h2>
        <Link to="/agenda" style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--pink)", textDecoration: "none" }}>
          Ver todos
        </Link>
      </div>

      <div style={{ ...cardStyle, overflow: "hidden" }}>
        {appointments.map((appt, i) => (
          <div
            key={i}
            style={{ height: 74, display: "flex", alignItems: "center", padding: "0 14px", gap: 12, borderBottom: i < appointments.length - 1 ? "1px solid var(--surface-muted)" : "none" }}
          >
            {/* Time + accent bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, width: 70, flexShrink: 0 }}>
              <div style={{ width: 3, height: 28, borderRadius: 999, background: appt.accentColor, flexShrink: 0 }} />
              <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--foreground)" }}>{appt.time}</span>
            </div>

            {/* Avatar */}
            <div
              style={{ width: 40, height: 40, borderRadius: 999, background: appt.avatarBg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.875rem", color: appt.accentColor, flexShrink: 0 }}
            >
              {appt.initials}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--foreground)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {appt.patient}
              </p>
              <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {appt.procedure}
              </p>
            </div>

            {/* Status badge */}
            <div
              style={{
                height: 26, paddingInline: 10, borderRadius: 999, fontSize: "0.6875rem", fontWeight: 600, display: "flex", alignItems: "center", flexShrink: 0,
                background: appt.status === "Confirmado" ? "rgba(34,197,94,0.12)" : "rgba(249,115,22,0.12)",
                color: appt.status === "Confirmado" ? "var(--success)" : "var(--warning)",
              }}
            >
              {appt.status}
            </div>

            <ChevronRight style={{ width: 15, height: 15, color: "var(--foreground-subtle)", flexShrink: 0 }} strokeWidth={2} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Quick actions ────────────────────────────────────────────────────────────

function QuickActions() {
  const navigate = useNavigate();

  const actions = [
    {
      label: "Novo\nagendamento",
      icon: CalendarDays,
      isPrimary: true,
      containerStyle: { background: GRADIENT, boxShadow: "var(--shadow-brand)" } as React.CSSProperties,
      iconBg: "rgba(255,255,255,0.20)",
      iconColor: "var(--card)",
      textColor: "var(--card)",
      onClick: () => navigate({ to: "/agenda" }),
    },
    {
      label: "Novo\npaciente",
      icon: UserPlus,
      isPrimary: false,
      containerStyle: { ...cardStyle } as React.CSSProperties,
      iconBg: "color-mix(in oklab, var(--violet) 12%, transparent)",
      iconColor: "var(--violet)",
      textColor: "var(--foreground)",
      onClick: () => navigate({ to: "/pacientes", search: { status: "all" } }),
    },
    {
      label: "Registrar\nrecebimento",
      icon: ArrowDownCircle,
      isPrimary: false,
      containerStyle: { ...cardStyle } as React.CSSProperties,
      iconBg: "rgba(34,197,94,0.12)",
      iconColor: "var(--success)",
      textColor: "var(--foreground)",
      onClick: () => navigate({ to: "/recebimentos" }),
    },
    {
      label: "Novo\npagamento",
      icon: CreditCard,
      isPrimary: false,
      containerStyle: { ...cardStyle } as React.CSSProperties,
      iconBg: "rgba(249,115,22,0.12)",
      iconColor: "var(--warning)",
      textColor: "var(--foreground)",
      onClick: () => navigate({ to: "/pagamentos" }),
    },
  ];

  return (
    <div style={{ padding: "28px 24px 0 24px" }}>
      <h2 style={{ fontSize: "1.25rem", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--foreground)", margin: "0 0 12px" }}>
        Ações rápidas
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        {actions.map((a, i) => (
          <button
            key={i}
            type="button"
            className="press"
            onClick={a.onClick}
            style={{ height: 86, minWidth: 0, borderRadius: 22, padding: "0 16px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer", border: "none", ...a.containerStyle }}
          >
            <div style={{ width: 44, height: 44, borderRadius: 14, background: a.iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <a.icon style={{ width: 20, height: 20, color: a.iconColor }} strokeWidth={1.75} />
            </div>
            <span style={{ fontSize: "0.875rem", fontWeight: 700, lineHeight: "20px", color: a.textColor, textAlign: "left", whiteSpace: "pre-line", minWidth: 0, overflow: "hidden" }}>
              {a.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Attention section ────────────────────────────────────────────────────────

function HighlightedText({ text, highlight, color }: { text: string; highlight: string; color: string }) {
  const parts = text.split(highlight);
  return (
    <span>
      {parts[0]}
      <span style={{ color, fontWeight: 700 }}>{highlight}</span>
      {parts[1]}
    </span>
  );
}

function AttentionSection() {
  return (
    <div style={{ padding: "28px 24px 0 24px" }}>
      <h2 style={{ fontSize: "1.25rem", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--foreground)", margin: "0 0 12px" }}>
        Precisa de atenção
      </h2>
      <div style={{ ...cardStyle, overflow: "hidden" }}>
        {attentionItems.map((item, i) => (
          <button
            key={i}
            type="button"
            className="press"
            style={{ width: "100%", height: 58, display: "flex", alignItems: "center", padding: "0 16px", gap: 12, borderBottom: i < attentionItems.length - 1 ? "1px solid var(--surface-muted)" : "none", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
          >
            <div style={{ width: 36, height: 36, borderRadius: 999, background: item.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <item.icon style={{ width: 16, height: 16, color: item.color }} strokeWidth={1.75} />
            </div>
            <span style={{ flex: 1, fontSize: "0.875rem", color: "var(--foreground-secondary)", lineHeight: "20px" }}>
              <HighlightedText text={item.label} highlight={item.highlight} color={item.color} />
            </span>
            <ChevronRight style={{ width: 15, height: 15, color: "var(--foreground-subtle)", flexShrink: 0 }} strokeWidth={2} />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function MobileHome() {
  useRegisterMobileFab(null);

  return (
    <div
      className="lg:hidden flex-1 min-w-0 w-full overflow-x-hidden overflow-y-auto custom-scroll"
      style={{
        background: "radial-gradient(circle at top right, color-mix(in oklab, var(--pink) 6%, transparent), transparent 32%), var(--surface)",
        paddingBottom: 110,
      }}
    >
      <Header />
      <SummaryGrid />
      <NextAppointments />
      <QuickActions />
      <AttentionSection />
    </div>
  );
}
