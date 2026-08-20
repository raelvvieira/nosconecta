import { useRef, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Appointment, BlockedTime, ViewMode, AgendaFilters } from "./types";
import {
  HOURS,
  HOUR_HEIGHT,
  START_HOUR,
  apptTop,
  apptHeight,
  statusStyle,
  STATUS_LABEL,
  TYPE_LABEL,
} from "./appointment-utils";
import { useCalendarDrag, type AlvoArraste, type ItemArrastavel } from "./useCalendarDrag";

const DAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS_PT = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getMondayOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return monday;
}

const VIEWS: { id: ViewMode; label: string }[] = [
  { id: "day", label: "Dia" },
  { id: "week", label: "Semana" },
  { id: "month", label: "Mês" },
  { id: "professionals", label: "Profissionais" },
  { id: "rooms", label: "Salas" },
];

interface Props {
  appointments: Appointment[];
  blockedTimes: BlockedTime[];
  filters: AgendaFilters;
  selectedDate: Date;
  onDateChange: (d: Date) => void;
  onAppointmentClick: (appt: Appointment) => void;
  onBlockClick?: (block: BlockedTime) => void;
  /** Arrastou um bloco para outro horário/dia. Sem isto, o arraste fica off. */
  onMove?: (item: ItemArrastavel, alvo: AlvoArraste, tipo: "consulta" | "compromisso") => void;
  professionals: { id: string; name: string }[];
  rooms: { id: string; name: string }[];
  onFiltersChange: (f: AgendaFilters) => void;
}

function MonthView({ appointments, selectedDate, onDateChange }: {
  appointments: Appointment[];
  selectedDate: Date;
  onDateChange: (d: Date) => void;
}) {
  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay === 0 ? 6 : firstDay - 1).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const countForDay = (day: number) => {
    const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return appointments.filter((a) => a.date === ds).length;
  };

  return (
    <div className="p-4">
      <div className="grid grid-cols-7 mb-2">
        {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
          <div key={d} className="text-center text-2xs font-semibold text-muted-foreground py-2">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const count = countForDay(day);
          const isToday = toDateStr(new Date()) === `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
          const isSelected = selectedDate.getDate() === day && selectedDate.getMonth() === month;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onDateChange(new Date(year, month, day))}
              className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-surface transition-colors"
            >
              <span
                className="text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full"
                style={isSelected ? {
                  background: "var(--gradient-primary)",
                  color: "var(--primary-foreground)",
                } : isToday ? { border: "2px solid var(--pink)", color: "var(--pink)" } : { color: "var(--foreground)" }}
              >
                {day}
              </span>
              {count > 0 && (
                <span className="text-3xs font-medium" style={{ color: "var(--pink)" }}>
                  {count} apmt{count > 1 ? "s" : ""}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function WeeklyCalendar({
  appointments,
  blockedTimes,
  filters,
  selectedDate,
  onDateChange,
  onAppointmentClick,
  onBlockClick,
  onMove,
  professionals,
  rooms,
  onFiltersChange,
}: Props) {
  const [view, setView] = useState<ViewMode>("week");
  const scrollRef = useRef<HTMLDivElement>(null);
  const weekStart = getMondayOfWeek(selectedDate);
  const weekDays = getWeekDays(weekStart);
  const todayStr = toDateStr(new Date());

  const displayDays = view === "day" ? [selectedDate] : weekDays;

  // Duas instâncias porque são duas entidades diferentes no banco, com
  // gravações diferentes — e assim cada uma tem seu próprio estado de arraste
  // sem precisar carregar um "tipo" por dentro do hook.
  const arrasteConsulta = useCalendarDrag({
    ativo: view !== "month" && Boolean(onMove),
    onDrop: (item, alvo) => onMove?.(item, alvo, "consulta"),
  });
  const arrasteCompromisso = useCalendarDrag({
    ativo: view !== "month" && Boolean(onMove),
    onDrop: (item, alvo) => onMove?.(item, alvo, "compromisso"),
  });

  useEffect(() => {
    if (scrollRef.current) {
      const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
      const top = (nowMinutes - START_HOUR * 60) * (HOUR_HEIGHT / 60);
      scrollRef.current.scrollTo({ top: Math.max(0, top - 100), behavior: "smooth" });
    }
  }, [view]);

  const filtered = appointments.filter((a) => {
    if (filters.professionalId && a.professionalId !== filters.professionalId) return false;
    if (filters.roomId && a.roomId !== filters.roomId) return false;
    if (filters.type && a.type !== filters.type) return false;
    if (filters.status && a.status !== filters.status) return false;
    return true;
  });

  const filteredBlocked = blockedTimes.filter((b) => {
    if (filters.professionalId && b.professionalId !== filters.professionalId) return false;
    if (filters.roomId && b.roomId !== filters.roomId) return false;
    return true;
  });

  const now = new Date();
  const nowTop = (now.getHours() * 60 + now.getMinutes() - START_HOUR * 60) * (HOUR_HEIGHT / 60);
  const showNowLine = now.getHours() >= START_HOUR && now.getHours() <= 19;

  const navigateWeek = (dir: -1 | 1) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + dir * (view === "day" ? 1 : 7));
    onDateChange(d);
  };

  const weekLabel =
    view === "week"
      ? `${weekDays[0].getDate()} – ${weekDays[6].getDate()} ${MONTHS_PT[weekDays[6].getMonth()]} ${weekDays[6].getFullYear()}`
      : `${selectedDate.getDate()} de ${MONTHS_PT[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`;

  return (
    <div className="surface-card flex flex-col">
      {/* Top bar */}
      <div className="flex flex-col gap-3 p-4 border-b border-border">
        {/* View tabs */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1 bg-surface rounded-xl p-1">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setView(v.id)}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-lg transition-colors",
                  view === v.id
                    ? "text-pink"
                    : "text-muted-foreground hover:text-foreground",
                )}
                style={view === v.id ? { background: "color-mix(in oklab, var(--pink) 12%, transparent)" } : {}}
              >
                {v.label}
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2">
            <select
              className="text-xs border border-border rounded-xl px-3 py-1.5 text-muted-foreground bg-white focus:outline-none"
              value={filters.professionalId}
              onChange={(e) => onFiltersChange({ ...filters, professionalId: e.target.value })}
            >
              <option value="">Todos os profissionais</option>
              {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select
              className="text-xs border border-border rounded-xl px-3 py-1.5 text-muted-foreground bg-white focus:outline-none"
              value={filters.roomId}
              onChange={(e) => onFiltersChange({ ...filters, roomId: e.target.value })}
            >
              <option value="">Todas as salas</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigateWeek(-1)} aria-label="Semana anterior"
            className="h-8 w-8 grid place-items-center rounded-xl border border-border text-muted-foreground hover:bg-surface transition-colors"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => onDateChange(new Date())}
            className="text-sm font-semibold text-foreground hover:text-pink transition-colors min-w-[200px] text-left"
          >
            {weekLabel}
          </button>
          <button
            type="button"
            onClick={() => navigateWeek(1)} aria-label="Próxima semana"
            className="h-8 w-8 grid place-items-center rounded-xl border border-border text-muted-foreground hover:bg-surface transition-colors"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Month view */}
      {view === "month" && (
        <MonthView appointments={filtered} selectedDate={selectedDate} onDateChange={(d) => { onDateChange(d); setView("day"); }} />
      )}

      {/* Week/Day/Professionals/Rooms grid */}
      {view !== "month" && (
        <>
          {/* Day headers */}
          <div className="flex border-b border-border">
            <div className="w-16 shrink-0" />
            {displayDays.map((day) => {
              const ds = toDateStr(day);
              const isToday = ds === todayStr;
              const isSelected = ds === toDateStr(selectedDate);
              return (
                <div
                  key={ds}
                  className="flex-1 flex flex-col items-center py-3 cursor-pointer hover:bg-surface-subtle transition-colors"
                  onClick={() => onDateChange(day)}
                >
                  <span className="text-2xs font-medium text-muted-foreground">
                    {DAYS_PT[day.getDay()]}
                  </span>
                  <span
                    className="mt-1 h-8 w-8 flex items-center justify-center rounded-full text-sm font-semibold"
                    style={
                      isToday || isSelected
                        ? { background: "var(--gradient-primary)", color: "var(--primary-foreground)" }
                        : { color: "var(--foreground)" }
                    }
                  >
                    {day.getDate()}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Scrollable grid */}
          <div
            ref={scrollRef}
            data-agenda-scroll=""
            className="overflow-y-auto"
            style={{ maxHeight: 560 }}
          >
            <div className="flex">
              {/* Hour labels */}
              <div className="w-16 shrink-0 flex flex-col">
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="flex items-start justify-end pr-2 text-2xs text-muted-foreground"
                    style={{ height: HOUR_HEIGHT, paddingTop: 4 }}
                  >
                    {String(h).padStart(2, "0")}:00
                  </div>
                ))}
              </div>

              {/* Day columns */}
              <div className="flex flex-1 min-w-0">
                {displayDays.map((day) => {
                  const ds = toDateStr(day);
                  const isToday = ds === todayStr;
                  const dayAppts = filtered.filter((a) => a.date === ds);
                  const dayBlocked = filteredBlocked.filter((b) => b.date === ds);

                  return (
                    <div
                      key={ds}
                      // Única marca do dia no DOM: o `key` do React não chega
                      // até aqui, e o arraste precisa saber sobre qual coluna o
                      // dedo está para descobrir a data de destino.
                      data-day={ds}
                      className="flex-1 relative min-w-0"
                      style={{ borderLeft: "1px solid var(--border)" }}
                    >
                      {/* Hour lines */}
                      {HOURS.map((h) => (
                        <div
                          key={h}
                          style={{
                            position: "absolute",
                            top: (h - START_HOUR) * HOUR_HEIGHT,
                            left: 0,
                            right: 0,
                            height: HOUR_HEIGHT,
                            borderTop: "1px solid var(--border)",
                            background: isToday ? "color-mix(in oklab, var(--pink) 1.5%, transparent)" : undefined,
                          }}
                        />
                      ))}

                      {/* Current time line */}
                      {isToday && showNowLine && (
                        <div
                          style={{
                            position: "absolute",
                            top: nowTop,
                            left: 0,
                            right: 0,
                            zIndex: 10,
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          <div style={{ width: 7, height: 7, borderRadius: 9999, background: "var(--pink)", marginLeft: -3.5 }} />
                          <div style={{ flex: 1, height: 2, background: "var(--pink)" }} />
                        </div>
                      )}

                      {/* Blocked times */}
                      {dayBlocked.map((b) => (
                        // Era uma `div` inerte: dava para criar um compromisso
                        // e nunca mais abri-lo, editá-lo ou removê-lo.
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => {
                            // Arrastou e soltou aqui mesmo? O clique que vem a
                            // seguir não pode abrir a gaveta.
                            if (arrasteCompromisso.consumiuClique()) return;
                            onBlockClick?.(b);
                          }}
                          {...(onMove
                            ? {
                                ...arrasteCompromisso.handlers,
                                onPointerDown: arrasteCompromisso.handlers.onPointerDown({
                                  id: b.id,
                                  date: b.date,
                                  startTime: b.startTime,
                                  endTime: b.endTime,
                                }),
                              }
                            : {})}
                          className="text-left hover:brightness-95"
                          style={{
                            position: "absolute",
                            top: apptTop(b.startTime),
                            left: 4,
                            right: 4,
                            height: Math.max(apptHeight(b.startTime, b.endTime), 28),
                            touchAction: onMove ? "none" : undefined,
                            cursor: onMove ? "grab" : undefined,
                            background: "repeating-linear-gradient(135deg,color-mix(in oklab, var(--foreground-subtle) 8%, transparent),color-mix(in oklab, var(--foreground-subtle) 8%, transparent) 8px,color-mix(in oklab, var(--foreground-subtle) 14%, transparent) 8px,color-mix(in oklab, var(--foreground-subtle) 14%, transparent) 16px)",
                            border: "1px solid var(--divider)",
                            borderRadius: "var(--radius-chip)",
                            padding: "4px 8px",
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          <span className="text-3xs text-muted-foreground font-medium truncate">{b.reason}</span>
                        </button>
                      ))}

                      {/* Appointments */}
                      {dayAppts.map((appt) => {
                        const s = statusStyle(appt.status);
                        return (
                          <button
                            key={appt.id}
                            type="button"
                            onClick={() => {
                              if (arrasteConsulta.consumiuClique()) return;
                              onAppointmentClick(appt);
                            }}
                            {...(onMove
                              ? {
                                  ...arrasteConsulta.handlers,
                                  onPointerDown: arrasteConsulta.handlers.onPointerDown({
                                    id: appt.id,
                                    date: appt.date,
                                    startTime: appt.startTime,
                                    endTime: appt.endTime,
                                  }),
                                }
                              : {})}
                            style={{
                              position: "absolute",
                              top: apptTop(appt.startTime),
                              left: 4,
                              right: 4,
                              height: Math.max(apptHeight(appt.startTime, appt.endTime), 32),
                              background: s.bg,
                              border: `1px solid ${s.border}`,
                              borderRadius: "var(--radius-chip)",
                              padding: "4px 8px",
                              textAlign: "left",
                              // `touch-action: none` é o que deixa o dedo
                              // arrastar o card em vez de rolar a grade.
                              touchAction: onMove ? "none" : undefined,
                              cursor: onMove ? "grab" : "pointer",
                              zIndex: 5,
                              transition: "box-shadow 0.15s ease",
                            }}
                            className="hover:shadow-md"
                          >
                            <div className="flex items-start justify-between gap-1">
                              <div className="flex flex-col min-w-0">
                                <span className="flex items-center gap-1 text-3xs font-semibold text-foreground-secondary">
                                  <span className="truncate">
                                    {/* Durante o arraste, o rótulo mostra o
                                        horário de destino — é a confirmação de
                                        onde o bloco vai cair. */}
                                    {arrasteConsulta.arrastando?.id === appt.id && arrasteConsulta.alvo
                                      ? `${arrasteConsulta.alvo.startTime} – ${arrasteConsulta.alvo.endTime}`
                                      : `${appt.startTime} – ${appt.endTime}`}
                                  </span>
                                  {/* Retorno vinha sem nenhuma marca visual: a cor
                                      do card é só do status, e TYPE_LABEL estava
                                      importado aqui sem nunca ser usado. */}
                                  {appt.type === "return" && (
                                    <span className="shrink-0 rounded-full bg-violet-soft px-1.5 text-3xs font-semibold text-violet">
                                      {TYPE_LABEL.return}
                                    </span>
                                  )}
                                </span>
                                <span className="text-2xs font-semibold text-foreground truncate">
                                  {appt.patientName}
                                </span>
                                <span className="text-3xs text-muted-foreground truncate">{appt.procedureName}</span>
                                <span className="text-3xs text-muted-foreground truncate">{appt.professionalName}</span>
                              </div>
                              <div
                                className="shrink-0 mt-0.5"
                                style={{
                                  width: 7,
                                  height: 7,
                                  borderRadius: 9999,
                                  background: s.badge,
                                }}
                              />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3 p-4 border-t border-border">
            {(
              [
                ["Confirmado", "var(--success)"],
                ["Pendente", "var(--coral)"],
                ["Em andamento", "var(--violet)"],
                ["Faltou", "var(--danger)"],
                ["Bloqueado", "var(--foreground-subtle)"],
              ] as [string, string][]
            ).map(([label, color]) => (
              <div key={label} className="flex items-center gap-1.5">
                <div style={{ width: 8, height: 8, borderRadius: 9999, background: color }} />
                <span className="text-2xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
