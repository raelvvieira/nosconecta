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
import { KpiCard } from "@/components/finance/KpiCard";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/finance/format";
import { useGreetingUser } from "@/components/home/use-greeting-user";
import {
  appointments,
  attentionItems,
  AGENDA_TODAY_COUNT,
  AGENDA_TODAY_DETAILS,
  PENDING_CONFIRMATIONS_COUNT,
} from "@/components/home/mock-data";

export function DesktopHome({
  revenueToday,
  overdueTotal,
  overduePatients,
}: {
  revenueToday: number;
  overdueTotal: number;
  overduePatients: number;
}) {
  const navigate = useNavigate();
  const { firstName, greeting } = useGreetingUser();

  return (
    <div className="space-y-6 md:space-y-8">
      <header className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4 min-h-[80px]">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            {greeting}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Resumo da clínica hoje</p>
        </div>
        <button
          type="button"
          className="relative h-11 w-11 rounded-2xl bg-white border border-border grid place-items-center shadow-soft shrink-0"
          aria-label="Notificações"
        >
          <Bell className="h-5 w-5 text-foreground" strokeWidth={1.75} />
          <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-danger border-2 border-white" />
        </button>
      </header>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-5">
        <KpiCard
          label="Agenda de hoje"
          value={String(AGENDA_TODAY_COUNT)}
          icon={CalendarDays}
          tone="violet"
          footer={<span className="text-muted-foreground">{AGENDA_TODAY_DETAILS.join(" · ")}</span>}
        />
        <KpiCard
          label="Confirmações pendentes"
          value={String(PENDING_CONFIRMATIONS_COUNT)}
          icon={Users}
          tone="violet"
          footer={<span className="text-muted-foreground">pacientes aguardando</span>}
        />
        <KpiCard
          label="Recebimentos de hoje"
          value={formatBRL(revenueToday)}
          icon={DollarSign}
          tone="success"
          footer={<span className="text-muted-foreground">a receber hoje</span>}
        />
        <KpiCard
          label="Alertas"
          value={String(overduePatients)}
          icon={AlertTriangle}
          tone="danger"
          footer={<span className="text-muted-foreground">{formatBRL(overdueTotal)} em atraso</span>}
        />
      </div>

      <section className="surface-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Próximos atendimentos</h2>
          <Link to="/agenda" className="text-sm font-semibold text-primary">
            Ver todos
          </Link>
        </div>
        <div className="divide-y divide-border">
          {appointments.map((appt, i) => (
            <div key={i} className="flex items-center gap-3 py-3">
              <div className="w-16 shrink-0 text-sm font-semibold tabular-nums">{appt.time}</div>
              <div
                className="h-10 w-10 shrink-0 rounded-full grid place-items-center text-xs font-bold"
                style={{ background: appt.avatarBg, color: appt.accentColor }}
              >
                {appt.initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{appt.patient}</p>
                <p className="text-xs text-muted-foreground truncate">{appt.procedure}</p>
              </div>
              <span
                className="text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0"
                style={{
                  background: appt.status === "Confirmado" ? "rgba(34,197,94,0.12)" : "rgba(249,115,22,0.12)",
                  color: appt.status === "Confirmado" ? "#16A34A" : "#F97316",
                }}
              >
                {appt.status}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="surface-card p-6">
        <h2 className="text-lg font-semibold mb-4">Ações rápidas</h2>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <Button
            variant="premium"
            className="h-auto flex-row items-center justify-start gap-3 px-4 py-4"
            onClick={() => navigate({ to: "/agenda" })}
          >
            <CalendarDays className="h-5 w-5 shrink-0" />
            <span className="text-sm font-semibold whitespace-normal text-left">Novo agendamento</span>
          </Button>
          <Button
            variant="secondary"
            className="h-auto flex-row items-center justify-start gap-3 px-4 py-4"
            onClick={() => navigate({ to: "/pacientes", search: { status: "all" } })}
          >
            <UserPlus className="h-5 w-5 shrink-0" />
            <span className="text-sm font-semibold whitespace-normal text-left">Novo paciente</span>
          </Button>
          <Button
            variant="secondary"
            className="h-auto flex-row items-center justify-start gap-3 px-4 py-4"
            onClick={() => navigate({ to: "/recebimentos" })}
          >
            <ArrowDownCircle className="h-5 w-5 shrink-0" />
            <span className="text-sm font-semibold whitespace-normal text-left">Registrar recebimento</span>
          </Button>
          <Button
            variant="secondary"
            className="h-auto flex-row items-center justify-start gap-3 px-4 py-4"
            onClick={() => navigate({ to: "/pagamentos" })}
          >
            <CreditCard className="h-5 w-5 shrink-0" />
            <span className="text-sm font-semibold whitespace-normal text-left">Novo pagamento</span>
          </Button>
        </div>
      </section>

      <section className="surface-card p-6">
        <h2 className="text-lg font-semibold mb-4">Precisa de atenção</h2>
        <div className="divide-y divide-border">
          {attentionItems.map((item, i) => (
            <button key={i} type="button" className="w-full flex items-center gap-3 py-3 text-left">
              <div className="h-9 w-9 shrink-0 rounded-full grid place-items-center" style={{ background: item.bg }}>
                <item.icon className="h-4 w-4" style={{ color: item.color }} strokeWidth={1.75} />
              </div>
              <span className="flex-1 text-sm text-foreground">{item.label}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
