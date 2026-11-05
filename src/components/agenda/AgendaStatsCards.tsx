import { CalendarCheck, CheckCircle2, Clock, UserCheck, UserPlus, UserX } from "lucide-react";
import { resumoDaSemana } from "@/lib/agenda/resumo-da-semana";
import { cn } from "@/lib/utils";
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
  progresso,
}: {
  icon: typeof CalendarCheck;
  label: string;
  value: string | number;
  sub: string;
  iconBg: string;
  iconColor: string;
  /** Barra fina embaixo: quanto da meta já foi. */
  progresso?: { valor: number; meta: number; cor: string };
}) {
  return (
    <div className="surface-card flex flex-col gap-3 p-5">
      <div className="flex items-start gap-3">
        <div
          className="h-10 w-10 rounded-xl grid place-items-center shrink-0"
          style={{ background: iconBg }}
        >
          <Icon className="h-5 w-5" style={{ color: iconColor }} strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          <p className="text-2xl font-semibold text-foreground tabular-nums mt-0.5">{value}</p>
        </div>
      </div>
      {progresso && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted/70">
          <div
            className="h-full rounded-full transition-[width]"
            style={{
              width: `${Math.min(100, (progresso.valor / progresso.meta) * 100)}%`,
              background: progresso.cor,
            }}
          />
        </div>
      )}
      <p className={cn("text-xs text-muted-foreground")}>{sub}</p>
    </div>
  );
}

export function AgendaStatsCards({ appointments, date }: Props) {
  const todayAppts = appointments.filter((a) => a.date === date);
  const total = todayAppts.length;
  const confirmed = todayAppts.filter(
    (a) => a.status === "confirmed" || a.status === "completed",
  ).length;
  const pending = todayAppts.filter((a) => a.status === "pending").length;
  const missed = todayAppts.filter((a) => a.status === "missed").length;

  const pct = (n: number) => (total > 0 ? `${Math.round((n / total) * 100)}% do total` : "—");

  // A semana de verdade, não a que o calendário está mostrando: o ritmo da
  // recepção se acompanha sempre no hoje.
  const { novos, comparecimento } = resumoDaSemana(appointments);
  const corDoRitmo = novos.noRitmo ? "var(--success)" : "var(--coral)";

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
      <StatCard
        icon={UserPlus}
        label="Novos na semana"
        value={`${novos.total} de ${novos.meta}`}
        sub={`Hoje ${novos.hoje} de ${novos.metaDiaria}${novos.noRitmo ? "" : ` · ritmo pede ${novos.esperadoAteHoje}`}`}
        iconBg={`color-mix(in oklab, ${corDoRitmo} 10%, transparent)`}
        iconColor={corDoRitmo}
        progresso={{ valor: novos.total, meta: novos.meta, cor: corDoRitmo }}
      />
      <StatCard
        icon={UserCheck}
        label="Comparecimento"
        value={comparecimento.pct === null ? "—" : `${Math.round(comparecimento.pct)}%`}
        sub={
          comparecimento.pct === null
            ? "Nenhum atendimento ainda"
            : `na semana · ${comparecimento.compareceram} de ${comparecimento.compareceram + comparecimento.faltaram}${comparecimento.semBaixa ? ` · ${comparecimento.semBaixa} sem baixa` : ""}`
        }
        iconBg="color-mix(in oklab, var(--success) 10%, transparent)"
        iconColor="var(--success)"
      />
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
        iconBg="color-mix(in oklab, var(--success) 10%, transparent)"
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
        iconBg="color-mix(in oklab, var(--danger) 10%, transparent)"
        iconColor="var(--danger)"
      />
    </div>
  );
}
