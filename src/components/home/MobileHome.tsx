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

const GRADIENT = "linear-gradient(135deg, #FF6FA7 0%, #FF8A4C 100%)";

// ─── Card styles ──────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.94)",
  border: "1px solid #EEF2F7",
  borderRadius: 22,
  boxShadow: "0 10px 30px rgba(15,23,42,0.045), 0 1px 2px rgba(15,23,42,0.03)",
};

// ─── Header ───────────────────────────────────────────────────────────────────

function Header() {
  const { firstName, initial, greeting } = useGreetingUser();
  return (
    <div style={{ padding: "52px 24px 0 24px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ fontSize: 27, lineHeight: "33px", fontWeight: 700, letterSpacing: "-0.03em", color: "#111827", margin: 0 }}>
          {greeting}{firstName ? `, ${firstName}` : ""}
        </h1>
        <p style={{ fontSize: 15, lineHeight: "22px", fontWeight: 400, color: "#6B7280", marginTop: 4 }}>
          Resumo da clínica hoje
        </p>
      </div>
      <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
        <button
          type="button"
          style={{ position: "relative", width: 52, height: 52, borderRadius: 17, background: "#FFFFFF", border: "1px solid #EEF2F7", boxShadow: "0 8px 24px rgba(15,23,42,0.05)", display: "flex", alignItems: "center", justifyContent: "center" }}
          aria-label="Notificações"
        >
          <Bell style={{ width: 21, height: 21, color: "#111827" }} strokeWidth={1.75} />
          <span style={{ position: "absolute", top: 10, right: 10, width: 8, height: 8, background: "#FF6B6B", borderRadius: 999, border: "2px solid white" }} />
        </button>
        <div
          style={{ width: 52, height: 52, borderRadius: 17, background: GRADIENT, display: "flex", alignItems: "center", justifyContent: "center", border: "3px solid #FFFFFF", boxShadow: "0 8px 24px rgba(15,23,42,0.05)", color: "white", fontSize: 18, fontWeight: 700 }}
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
    iconBg: "rgba(255,111,167,0.12)",
    iconColor: "#FF5F7E",
    title: "Agenda de hoje",
    value: String(AGENDA_TODAY_COUNT),
    valueColor: "#111827",
    subtitle: "atendimentos",
    details: AGENDA_TODAY_DETAILS,
    action: "Ver agenda",
    actionColor: "#FF5F7E",
  },
  {
    icon: Users,
    iconBg: "rgba(139,92,246,0.12)",
    iconColor: "#8B5CF6",
    title: "Confirmações pendentes",
    value: String(PENDING_CONFIRMATIONS_COUNT),
    valueColor: "#111827",
    subtitle: "pacientes aguardando",
    details: [],
    action: "Confirmar agora",
    actionColor: "#8B5CF6",
  },
  {
    icon: DollarSign,
    iconBg: "rgba(34,197,94,0.12)",
    iconColor: "#16A34A",
    title: "Recebimentos de hoje",
    value: "R$ 8.200",
    valueColor: "#16A34A",
    subtitle: "a receber hoje",
    details: [],
    action: "Ver recebimentos",
    actionColor: "#16A34A",
  },
  {
    icon: AlertTriangle,
    iconBg: "rgba(239,68,68,0.10)",
    iconColor: "#EF4444",
    title: "Alertas",
    value: "3",
    valueColor: "#111827",
    subtitle: "itens",
    details: [],
    action: "Ver alertas",
    actionColor: "#EF4444",
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
              <p style={{ fontSize: 11, color: "#6B7280", lineHeight: "15px", margin: 0, paddingTop: 2, minWidth: 0 }}>{card.title}</p>
            </div>

            {/* Value */}
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 20, fontWeight: 700, color: card.valueColor, letterSpacing: "-0.02em", margin: 0, lineHeight: "24px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{card.value}</p>
              <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>{card.subtitle}</p>
            </div>

            {/* Footer action */}
            <span style={{ fontSize: 12, fontWeight: 600, color: card.actionColor, marginTop: "auto" }}>
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
        <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", color: "#111827", margin: 0 }}>
          Próximos atendimentos
        </h2>
        <Link to="/agenda" style={{ fontSize: 14, fontWeight: 600, color: "#FF5F7E", textDecoration: "none" }}>
          Ver todos
        </Link>
      </div>

      <div style={{ ...cardStyle, overflow: "hidden" }}>
        {appointments.map((appt, i) => (
          <div
            key={i}
            style={{ height: 74, display: "flex", alignItems: "center", padding: "0 14px", gap: 12, borderBottom: i < appointments.length - 1 ? "1px solid #F1F5F9" : "none" }}
          >
            {/* Time + accent bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, width: 70, flexShrink: 0 }}>
              <div style={{ width: 3, height: 28, borderRadius: 999, background: appt.accentColor, flexShrink: 0 }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{appt.time}</span>
            </div>

            {/* Avatar */}
            <div
              style={{ width: 40, height: 40, borderRadius: 999, background: appt.avatarBg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, color: appt.accentColor, flexShrink: 0 }}
            >
              {appt.initials}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#111827", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {appt.patient}
              </p>
              <p style={{ fontSize: 12, color: "#6B7280", margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {appt.procedure}
              </p>
            </div>

            {/* Status badge */}
            <div
              style={{
                height: 26, paddingInline: 10, borderRadius: 999, fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", flexShrink: 0,
                background: appt.status === "Confirmado" ? "rgba(34,197,94,0.12)" : "rgba(249,115,22,0.12)",
                color: appt.status === "Confirmado" ? "#16A34A" : "#F97316",
              }}
            >
              {appt.status}
            </div>

            <ChevronRight style={{ width: 15, height: 15, color: "#9CA3AF", flexShrink: 0 }} strokeWidth={2} />
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
      containerStyle: { background: GRADIENT, boxShadow: "0 10px 30px rgba(255,111,167,0.22)" } as React.CSSProperties,
      iconBg: "rgba(255,255,255,0.20)",
      iconColor: "#FFFFFF",
      textColor: "#FFFFFF",
      onClick: () => navigate({ to: "/agenda" }),
    },
    {
      label: "Novo\npaciente",
      icon: UserPlus,
      isPrimary: false,
      containerStyle: { ...cardStyle } as React.CSSProperties,
      iconBg: "rgba(139,92,246,0.12)",
      iconColor: "#8B5CF6",
      textColor: "#111827",
      onClick: () => navigate({ to: "/pacientes", search: { status: "all" } }),
    },
    {
      label: "Registrar\nrecebimento",
      icon: ArrowDownCircle,
      isPrimary: false,
      containerStyle: { ...cardStyle } as React.CSSProperties,
      iconBg: "rgba(34,197,94,0.12)",
      iconColor: "#16A34A",
      textColor: "#111827",
      onClick: () => navigate({ to: "/recebimentos" }),
    },
    {
      label: "Novo\npagamento",
      icon: CreditCard,
      isPrimary: false,
      containerStyle: { ...cardStyle } as React.CSSProperties,
      iconBg: "rgba(249,115,22,0.12)",
      iconColor: "#F97316",
      textColor: "#111827",
      onClick: () => navigate({ to: "/pagamentos" }),
    },
  ];

  return (
    <div style={{ padding: "28px 24px 0 24px" }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", color: "#111827", margin: "0 0 12px" }}>
        Ações rápidas
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        {actions.map((a, i) => (
          <button
            key={i}
            type="button"
            onClick={a.onClick}
            style={{ height: 86, minWidth: 0, borderRadius: 22, padding: "0 16px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer", border: "none", ...a.containerStyle }}
          >
            <div style={{ width: 44, height: 44, borderRadius: 14, background: a.iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <a.icon style={{ width: 20, height: 20, color: a.iconColor }} strokeWidth={1.75} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, lineHeight: "20px", color: a.textColor, textAlign: "left", whiteSpace: "pre-line", minWidth: 0, overflow: "hidden" }}>
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
      <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", color: "#111827", margin: "0 0 12px" }}>
        Precisa de atenção
      </h2>
      <div style={{ ...cardStyle, overflow: "hidden" }}>
        {attentionItems.map((item, i) => (
          <button
            key={i}
            type="button"
            style={{ width: "100%", height: 58, display: "flex", alignItems: "center", padding: "0 16px", gap: 12, borderBottom: i < attentionItems.length - 1 ? "1px solid #F1F5F9" : "none", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
          >
            <div style={{ width: 36, height: 36, borderRadius: 999, background: item.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <item.icon style={{ width: 16, height: 16, color: item.color }} strokeWidth={1.75} />
            </div>
            <span style={{ flex: 1, fontSize: 14, color: "#374151", lineHeight: "20px" }}>
              <HighlightedText text={item.label} highlight={item.highlight} color={item.color} />
            </span>
            <ChevronRight style={{ width: 15, height: 15, color: "#9CA3AF", flexShrink: 0 }} strokeWidth={2} />
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
        background: "radial-gradient(circle at top right, rgba(255,111,167,0.06), transparent 32%), #F8F8FA",
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
