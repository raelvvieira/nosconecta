import { CalendarCheck, CheckCircle2, Clock, UserX } from "lucide-react";
import type { Appointment } from "./types";

interface Props {
  appointments: Appointment[];
  date: string;
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  iconBg,
  iconColor,
}: {
  icon: typeof CalendarCheck;
  label: string;
  value: string | number;
  sub: string;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <div
      className="bg-white flex flex-col gap-3 p-5"
      style={{ borderRadius: 20, border: "1px solid var(--surface-muted)", boxShadow: "var(--shadow-1)" }}
    >
      <div className="flex items-start gap-3">
        <div
          className="h-10 w-10 rounded-xl grid place-items-center shrink-0"
          style={{ background: iconBg }}
        >
          <Icon className="h-5 w-5" style={{ color: iconColor }} strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          <p className="text-2xl font-semibold text-foreground tracking-tight tabular-nums mt-0.5">
            {value}
          </p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

export function AgendaStatsCards({ appointments, date }: Props) {
  const todayAppts = appointments.filter((a) => a.date === date);
  const total = todayAppts.length;
  const confirmed = todayAppts.filter((a) => a.status === "confirmed" || a.status === "completed").length;
  const pending = todayAppts.filter((a) => a.status === "pending").length;
  const missed = todayAppts.filter((a) => a.status === "missed").length;

  const pct = (n: number) => total > 0 ? `${Math.round((n / total) * 100)}% do total` : "—";

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      <StatCard
        icon={CalendarCheck}
        label="Atendimentos Hoje"
        value={total}
        sub="Total de agendamentos"
        iconBg="color-mix(in oklab, var(--violet) 10%, transparent)"
        iconColor="var(--violet)"
      />
      <StatCard
        icon={CheckCircle2}
        label="Confirmados"
        value={confirmed}
        sub={pct(confirmed)}
        iconBg="rgba(34,197,94,0.10)"
        iconColor="var(--success)"
      />
      <StatCard
        icon={Clock}
        label="Pendentes"
        value={pending}
        sub={pct(pending)}
        iconBg="color-mix(in oklab, var(--coral) 10%, transparent)"
        iconColor="var(--coral)"
      />
      <StatCard
        icon={UserX}
        label="Faltas"
        value={missed}
        sub={pct(missed)}
        iconBg="rgba(239,68,68,0.10)"
        iconColor="var(--danger)"
      />
    </div>
  );
}
