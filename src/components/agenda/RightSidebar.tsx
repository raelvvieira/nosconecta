import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Appointment } from "./types";
import { statusStyle, STATUS_LABEL } from "./appointment-utils";
import { RetornosAAgendarCard } from "./RetornosAAgendarCard";
import type { RetornoDaLista } from "@/lib/agenda/retornos.functions";

const MONTHS_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Mini Calendar ──────────────────────────────────────────────────────────

function MiniCalendar({
  selected,
  appointments,
  onSelect,
}: {
  selected: Date;
  appointments: Appointment[];
  onSelect: (d: Date) => void;
}) {
  const year = selected.getFullYear();
  const month = selected.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay === 0 ? 6 : firstDay - 1).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const todayStr = toDateStr(new Date());

  const hasAppts = (day: number) => {
    const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return appointments.some((a) => a.date === ds);
  };

  const navigateMonth = (dir: -1 | 1) => {
    const d = new Date(year, month + dir, 1);
    onSelect(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  return (
    <div className="surface-card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-foreground">
          {MONTHS_PT[month]}, {year}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => navigateMonth(-1)}
            aria-label="Mês anterior"
            className="h-7 w-7 grid place-items-center rounded-lg text-muted-foreground hover:bg-surface transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => navigateMonth(1)}
            aria-label="Próximo mês"
            className="h-7 w-7 grid place-items-center rounded-lg text-muted-foreground hover:bg-surface transition-colors"
          >
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
          <div key={i} className="text-center text-3xs font-semibold text-muted-foreground py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isToday = ds === todayStr;
          const isSelected = toDateStr(selected) === ds;
          const has = hasAppts(day);

          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(new Date(year, month, day))}
              className="flex flex-col items-center py-0.5 rounded-lg hover:bg-surface transition-colors"
            >
              <span
                className="text-2xs font-medium w-6 h-6 flex items-center justify-center rounded-full"
                style={
                  isSelected
                    ? { background: "var(--gradient-primary)", color: "var(--primary-foreground)" }
                    : isToday
                      ? { border: "1.5px solid var(--pink)", color: "var(--pink)" }
                      : { color: "var(--foreground-secondary)" }
                }
              >
                {day}
              </span>
              {has && !isSelected && (
                <div
                  style={{
                    width: 3,
                    height: 3,
                    borderRadius: 9999,
                    background: "var(--pink)",
                    marginTop: 1,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Upcoming Appointments ───────────────────────────────────────────────────

function UpcomingAppointmentsCard({
  appointments,
  selectedDate,
}: {
  appointments: Appointment[];
  selectedDate: Date;
}) {
  const ds = toDateStr(selectedDate);
  const now = new Date();
  const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const upcoming = appointments
    .filter(
      (a) =>
        a.date === ds &&
        a.startTime >= nowTime &&
        a.status !== "cancelled" &&
        a.status !== "missed",
    )
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .slice(0, 4);

  return (
    <div className="surface-card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-foreground">Próximos atendimentos</span>
        <button type="button" className="text-xs font-medium" style={{ color: "var(--pink)" }}>
          Ver todos
        </button>
      </div>

      {upcoming.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">Nenhum atendimento próximo</p>
      ) : (
        <div className="space-y-2">
          {upcoming.map((a) => {
            const s = statusStyle(a.status, a.type);
            return (
              <div
                key={a.id}
                className="flex items-start gap-3 p-3 rounded-xl"
                style={{ background: "var(--surface)" }}
              >
                <div className="flex flex-col items-center shrink-0">
                  <span className="text-xs font-bold text-pink">{a.startTime}</span>
                  <div
                    style={{
                      width: 1,
                      height: 16,
                      background: "var(--surface-muted)",
                      margin: "2px 0",
                    }}
                  />
                  <span className="text-3xs text-muted-foreground">{a.endTime}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{a.patientName}</p>
                  <p className="text-2xs text-muted-foreground truncate">{a.procedureName}</p>
                  <p className="text-2xs text-muted-foreground truncate">{a.professionalName}</p>
                </div>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 9999,
                    background: s.badge,
                    marginTop: 4,
                    flexShrink: 0,
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── RightSidebar ────────────────────────────────────────────────────────────

interface RightSidebarProps {
  selectedDate: Date;
  appointments: Appointment[];
  onDateChange: (d: Date) => void;
  onAgendarRetorno: (r: RetornoDaLista) => void;
}

export function RightSidebar({
  selectedDate,
  appointments,
  onDateChange,
  onAgendarRetorno,
}: RightSidebarProps) {
  return (
    <div className="flex flex-col gap-4">
      <RetornosAAgendarCard onAgendar={onAgendarRetorno} />
      <MiniCalendar selected={selectedDate} appointments={appointments} onSelect={onDateChange} />
      <UpcomingAppointmentsCard appointments={appointments} selectedDate={selectedDate} />
    </div>
  );
}
