import { CalendarCheck, CheckCircle2, Clock, UserCheck, UserPlus, UserX } from "lucide-react";
import { resumoDaAgenda } from "@/lib/agenda/resumo-da-agenda";
import { cn } from "@/lib/utils";
import type { Appointment } from "./types";

interface Props {
  appointments: Appointment[];
  date: string;
  /** Remarcações do mês (histórico do banco). */
  remarcacoes?: number;
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
  progresso?: { valor: number; meta: number; cor: string; marca?: number };
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
        <div className="relative h-1.5 overflow-hidden rounded-full bg-muted/70">
          <div
            className="h-full rounded-full transition-[width]"
            style={{
              width: `${Math.min(100, (progresso.valor / progresso.meta) * 100)}%`,
              background: progresso.cor,
            }}
          />
          {/* O traço marca onde a recepção deveria estar hoje. */}
          {progresso.marca !== undefined && progresso.marca > 0 && (
            <div
              className="absolute inset-y-0 w-0.5 bg-foreground/40"
              style={{ left: `${Math.min(100, (progresso.marca / progresso.meta) * 100)}%` }}
            />
          )}
        </div>
      )}
      <p className={cn("text-xs text-muted-foreground")}>{sub}</p>
    </div>
  );
}

export function AgendaStatsCards({ appointments, date, remarcacoes = 0 }: Props) {
  const todayAppts = appointments.filter((a) => a.date === date);
  const total = todayAppts.length;
  const confirmed = todayAppts.filter(
    (a) => a.status === "confirmed" || a.status === "completed",
  ).length;
  const pending = todayAppts.filter((a) => a.status === "pending").length;
  const missed = todayAppts.filter((a) => a.status === "missed").length;

  const pct = (n: number) => (total > 0 ? `${Math.round((n / total) * 100)}% do total` : "—");

  // O mês de verdade, não o que o calendário está mostrando: a meta da
  // recepção se acompanha sempre no hoje.
  const { novos, agenda } = resumoDaAgenda(appointments);
  const corDoRitmo = novos.noRitmo ? "var(--success)" : "var(--coral)";

  const ritmo = novos.atingida
    ? "Meta do mês batida"
    : novos.noRitmo
      ? `No ritmo (+${novos.saldo})`
      : `Faltam ${novos.meta - novos.total} · ${novos.precisaPorDia} por dia útil`;

  const cancelamento =
    agenda.cancelamentoPct === null
      ? null
      : `Cancelaram ${Math.round(agenda.cancelamentoPct)}%${agenda.cancelaramNoDia ? ` (${agenda.cancelaramNoDia} no dia)` : ""}`;
  const partes = [
    agenda.comparecimentoPct === null
      ? "Nenhum atendimento ainda"
      : `${agenda.compareceram} de ${agenda.compareceram + agenda.faltaram} vieram`,
    cancelamento,
    remarcacoes > 0 ? `${remarcacoes} remarcaram` : null,
    agenda.semBaixa ? `${agenda.semBaixa} sem baixa` : null,
  ].filter(Boolean);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
      <StatCard
        icon={UserPlus}
        label="Novos agendamentos · mês"
        value={`${novos.total} de ${novos.meta}`}
        sub={`Hoje ${novos.hoje} de ${novos.metaDiaria} · semana ${novos.semana} · ${ritmo}`}
        iconBg={`color-mix(in oklab, ${corDoRitmo} 10%, transparent)`}
        iconColor={corDoRitmo}
        progresso={{
          valor: novos.total,
          meta: novos.meta,
          cor: corDoRitmo,
          marca: novos.esperadoAteHoje,
        }}
      />
      <StatCard
        icon={UserCheck}
        label="Comparecimento · mês"
        value={agenda.comparecimentoPct === null ? "—" : `${Math.round(agenda.comparecimentoPct)}%`}
        sub={partes.join(" · ")}
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
