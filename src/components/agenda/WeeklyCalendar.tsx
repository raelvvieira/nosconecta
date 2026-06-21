import { useRef, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Settings2 } from "lucide-react";
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
          <div key={d} className="text-center text-[11px] font-semibold text-[#6B7280] py-2">{d}</div>
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
              className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-[#F8F8FA] transition-colors"
            >
              <span
                className="text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full"
                style={isSelected ? {
                  background: "linear-gradient(135deg,#FF6FA7 0%,#FF8A4C 100%)",
                  color: "#fff",
                } : isToday ? { border: "2px solid #FF6FA7", color: "#FF6FA7" } : { color: "#111827" }}
              >
                {day}
              </span>
              {count > 0 && (
                <span className="text-[10px] font-medium" style={{ color: "#FF6FA7" }}>
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
    <div
      className="bg-white flex flex-col"
      style={{ borderRadius: 20, border: "1px solid #EEF2F7", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
    >
      {/* Top bar */}
      <div className="flex flex-col gap-3 p-4 border-b border-[#EEF2F7]">
        {/* View tabs */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1 bg-[#F8F8FA] rounded-xl p-1">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setView(v.id)}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-lg transition-colors",
                  view === v.id
                    ? "text-[#FF5F7E]"
                    : "text-[#6B7280] hover:text-[#111827]",
                )}
                style={view === v.id ? { background: "rgba(255,111,167,0.12)" } : {}}
              >
                {v.label}
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2">
            <select
              className="text-xs border border-[#EEF2F7] rounded-xl px-3 py-1.5 text-[#6B7280] bg-white focus:outline-none"
              value={filters.professionalId}
              onChange={(e) => onFiltersChange({ ...filters, professionalId: e.target.value })}
            >
              <option value="">Todos os profissionais</option>
              {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select
              className="text-xs border border-[#EEF2F7] rounded-xl px-3 py-1.5 text-[#6B7280] bg-white focus:outline-none"
              value={filters.roomId}
              onChange={(e) => onFiltersChange({ ...filters, roomId: e.target.value })}
            >
              <option value="">Todas as salas</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <button
              type="button"
              className="h-8 w-8 grid place-items-center rounded-xl border border-[#EEF2F7] text-[#6B7280] hover:bg-[#F8F8FA] transition-colors"
            >
              <Settings2 className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigateWeek(-1)}
            className="h-8 w-8 grid place-items-center rounded-xl border border-[#EEF2F7] text-[#6B7280] hover:bg-[#F8F8FA] transition-colors"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => onDateChange(new Date())}
            className="text-sm font-semibold text-[#111827] hover:text-[#FF6FA7] transition-colors min-w-[200px] text-left"
          >
            {weekLabel}
          </button>
          <button
            type="button"
            onClick={() => navigateWeek(1)}
            className="h-8 w-8 grid place-items-center rounded-xl border border-[#EEF2F7] text-[#6B7280] hover:bg-[#F8F8FA] transition-colors"
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
          <div className="flex border-b border-[#EEF2F7]">
            <div className="w-16 shrink-0" />
            {displayDays.map((day) => {
              const ds = toDateStr(day);
              const isToday = ds === todayStr;
              const isSelected = ds === toDateStr(selectedDate);
              return (
                <div
                  key={ds}
                  className="flex-1 flex flex-col items-center py-3 cursor-pointer hover:bg-[#FAFAFA] transition-colors"
                  onClick={() => onDateChange(day)}
                >
                  <span className="text-[11px] font-medium text-[#6B7280]">
                    {DAYS_PT[day.getDay()]}
                  </span>
                  <span
                    className="mt-1 h-8 w-8 flex items-center justify-center rounded-full text-sm font-semibold"
                    style={
                      isToday || isSelected
                        ? { background: "linear-gradient(135deg,#FF6FA7 0%,#FF8A4C 100%)", color: "#fff" }
                        : { color: "#111827" }
                    }
                  >
                    {day.getDate()}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Scrollable grid */}
          <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: 560 }}>
            <div className="flex">
              {/* Hour labels */}
              <div className="w-16 shrink-0 flex flex-col">
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="flex items-start justify-end pr-2 text-[11px] text-[#6B7280]"
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
                      className="flex-1 relative min-w-0"
                      style={{ borderLeft: "1px solid #EEF2F7" }}
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
                            borderTop: "1px solid #EEF2F7",
                            background: isToday ? "rgba(255,111,167,0.015)" : undefined,
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
                          <div style={{ width: 7, height: 7, borderRadius: 999, background: "#FF6FA7", marginLeft: -3.5 }} />
                          <div style={{ flex: 1, height: 2, background: "#FF6FA7" }} />
                        </div>
                      )}

                      {/* Blocked times */}
                      {dayBlocked.map((b) => (
                        <div
                          key={b.id}
                          style={{
                            position: "absolute",
                            top: apptTop(b.startTime),
                            left: 4,
                            right: 4,
                            height: Math.max(apptHeight(b.startTime, b.endTime), 28),
                            background: "repeating-linear-gradient(135deg,rgba(148,163,184,0.08),rgba(148,163,184,0.08) 8px,rgba(148,163,184,0.14) 8px,rgba(148,163,184,0.14) 16px)",
                            border: "1px solid rgba(148,163,184,0.20)",
                            borderRadius: 10,
                            padding: "4px 8px",
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          <span className="text-[10px] text-[#64748B] font-medium truncate">{b.reason}</span>
                        </div>
                      ))}

                      {/* Appointments */}
                      {dayAppts.map((appt) => {
                        const s = statusStyle(appt.status);
                        return (
                          <button
                            key={appt.id}
                            type="button"
                            onClick={() => onAppointmentClick(appt)}
                            style={{
                              position: "absolute",
                              top: apptTop(appt.startTime),
                              left: 4,
                              right: 4,
                              height: Math.max(apptHeight(appt.startTime, appt.endTime), 32),
                              background: s.bg,
                              border: `1px solid ${s.border}`,
                              borderRadius: 10,
                              padding: "4px 8px",
                              textAlign: "left",
                              cursor: "pointer",
                              zIndex: 5,
                              transition: "box-shadow 0.15s ease",
                            }}
                            className="hover:shadow-md"
                          >
                            <div className="flex items-start justify-between gap-1">
                              <div className="flex flex-col min-w-0">
                                <span className="text-[10px] font-semibold text-[#374151] truncate">
                                  {appt.startTime} – {appt.endTime}
                                </span>
                                <span className="text-[11px] font-semibold text-[#111827] truncate">
                                  {appt.patientName}
                                </span>
                                <span className="text-[10px] text-[#6B7280] truncate">{appt.procedureName}</span>
                                <span className="text-[10px] text-[#6B7280] truncate">{appt.professionalName}</span>
                              </div>
                              <div
                                className="shrink-0 mt-0.5"
                                style={{
                                  width: 7,
                                  height: 7,
                                  borderRadius: 999,
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
          <div className="flex flex-wrap items-center gap-3 p-4 border-t border-[#EEF2F7]">
            {(
              [
                ["Confirmado", "#22C55E"],
                ["Pendente", "#FF8A4C"],
                ["Em andamento", "#8B7CFF"],
                ["Faltou", "#EF4444"],
                ["Bloqueado", "#94A3B8"],
              ] as [string, string][]
            ).map(([label, color]) => (
              <div key={label} className="flex items-center gap-1.5">
                <div style={{ width: 8, height: 8, borderRadius: 999, background: color }} />
                <span className="text-[11px] text-[#6B7280]">{label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
