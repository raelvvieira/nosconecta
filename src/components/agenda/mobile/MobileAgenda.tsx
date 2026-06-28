import { useState } from "react";
import { useRegisterMobileFab, useRegisterMobileNavActions } from "@/components/finance/mobile-fab-context";
import {
  SlidersHorizontal,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CalendarCheck,
  CheckCircle2,
  Clock,
  UserX,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Appointment, BlockedTime, AgendaFilters, AppointmentStatus } from "../types";
import { statusStyle, STATUS_LABEL } from "../appointment-utils";
import { MobileAppointmentSheet } from "./MobileAppointmentSheet";
import { MobileFilterSheet } from "./MobileFilterSheet";
import { MobileCalendarSheet } from "./MobileCalendarSheet";

const DAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const MONTHS_CAP = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

type MobileTab = "day" | "list" | "month";

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function getMondayOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

interface Props {
  appointments: Appointment[];
  blockedTimes: BlockedTime[];
  selectedDate: Date;
  filters: AgendaFilters;
  onDateChange: (d: Date) => void;
  onFiltersChange: (f: AgendaFilters) => void;
  onNewAppointment: () => void;
  onNewBlock: () => void;
  onEditAppointment: (a: Appointment) => void;
  onStatusChange: (id: string, status: AppointmentStatus) => void;
}

// ─── Stats carousel ──────────────────────────────────────────────────────────

function StatsCarousel({ appointments, date }: { appointments: Appointment[]; date: string }) {
  const today = appointments.filter((a) => a.date === date);
  const total = today.length;
  const confirmed = today.filter((a) => a.status === "confirmed" || a.status === "completed").length;
  const pending = today.filter((a) => a.status === "pending").length;
  const missed = today.filter((a) => a.status === "missed").length;
  const pct = (n: number) => (total > 0 ? `${Math.round((n / total) * 100)}% do total` : "—");

  const cards = [
    { icon: CalendarCheck, label: "Atendimentos Hoje", value: String(total), sub: "Total de agendamentos", bg: "rgba(139,124,255,0.10)", color: "#8B7CFF" },
    { icon: CheckCircle2, label: "Confirmados", value: String(confirmed), sub: pct(confirmed), bg: "rgba(34,197,94,0.10)", color: "#22C55E" },
    { icon: Clock, label: "Pendentes", value: String(pending), sub: pct(pending), bg: "rgba(255,138,76,0.10)", color: "#FF8A4C" },
    { icon: UserX, label: "Faltas", value: String(missed), sub: pct(missed), bg: "rgba(239,68,68,0.10)", color: "#EF4444" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className="bg-white p-4 flex flex-col gap-2"
          style={{ borderRadius: 20, border: "1px solid #EEF2F7", boxShadow: "0 8px 24px rgba(15,23,42,0.04)" }}
        >
          <div className="h-9 w-9 rounded-xl grid place-items-center" style={{ background: c.bg }}>
            <c.icon style={{ color: c.color, width: 18, height: 18 }} strokeWidth={1.75} />
          </div>
          <div>
            <p className="text-[11px] text-[#6B7280] leading-tight">{c.label}</p>
            <p className="text-xl font-semibold text-[#111827] tracking-tight tabular-nums mt-0.5">{c.value}</p>
          </div>
          <p className="text-[11px] text-[#6B7280]">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Date selector ───────────────────────────────────────────────────────────

function DateSelector({ selectedDate, onDateChange }: { selectedDate: Date; onDateChange: (d: Date) => void }) {
  const weekStart = getMondayOfWeek(selectedDate);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
  const selStr = toDateStr(selectedDate);

  const shiftWeek = (dir: -1 | 1) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + dir * 7);
    onDateChange(d);
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => shiftWeek(-1)}
        className="h-10 w-7 shrink-0 grid place-items-center rounded-xl text-[#6B7280] active:bg-[#F1F5F9]"
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={2} />
      </button>

      <div className="flex-1 flex gap-2 overflow-x-auto scrollbar-none">
        {days.map((d) => {
          const ds = toDateStr(d);
          const active = ds === selStr;
          return (
            <button
              key={ds}
              type="button"
              onClick={() => onDateChange(d)}
              className={cn(
                "flex-1 min-w-[44px] flex flex-col items-center py-2.5 rounded-[18px] transition-all",
                !active && "bg-white",
              )}
              style={
                active
                  ? { background: "linear-gradient(135deg,#FF6FA7 0%,#FF8A4C 100%)", color: "#fff", boxShadow: "0 10px 24px rgba(255,111,167,0.24)" }
                  : { border: "1px solid #EEF2F7", color: "#374151" }
              }
            >
              <span className={cn("text-[11px] font-medium", active ? "text-white/90" : "text-[#6B7280]")}>
                {DAYS_SHORT[d.getDay()]}
              </span>
              <span className="text-base font-bold mt-0.5">{d.getDate()}</span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => shiftWeek(1)}
        className="h-10 w-7 shrink-0 grid place-items-center rounded-xl text-[#6B7280] active:bg-[#F1F5F9]"
      >
        <ChevronRight className="h-4 w-4" strokeWidth={2} />
      </button>
    </div>
  );
}

// ─── Appointment card ────────────────────────────────────────────────────────

function AppointmentCard({ appt, onClick }: { appt: Appointment; onClick: () => void }) {
  const s = statusStyle(appt.status);
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-white p-4 flex items-center gap-3 active:scale-[0.985] transition-transform"
      style={{ borderRadius: 20, border: "1px solid #EEF2F7", boxShadow: "0 8px 24px rgba(15,23,42,0.04)" }}
    >
      <div className="flex flex-col items-center shrink-0 w-12">
        <span className="text-sm font-bold text-[#111827]">{appt.startTime}</span>
        <span className="text-[10px] text-[#6B7280]">{appt.endTime}</span>
        <div className="mt-1.5" style={{ width: 8, height: 8, borderRadius: 999, background: s.badge }} />
      </div>

      <div
        className="h-11 w-11 rounded-full grid place-items-center text-white text-sm font-bold shrink-0"
        style={{ background: "linear-gradient(135deg,#FF6FA7 0%,#FF8A4C 100%)" }}
      >
        {initialsOf(appt.patientName)}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#111827] truncate">{appt.patientName}</p>
        <p className="text-[12px] text-[#6B7280] truncate">{appt.procedureName}</p>
        <p className="text-[11px] text-[#94A3B8] truncate mt-0.5">
          {appt.professionalName} · {appt.roomName}
        </p>
      </div>

      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <span
          className="px-2.5 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap"
          style={{ background: s.bg, color: s.text }}
        >
          {STATUS_LABEL[appt.status]}
        </span>
        <ChevronRight className="h-4 w-4 text-[#CBD5E1]" strokeWidth={2} />
      </div>
    </button>
  );
}

function BlockCard({ block }: { block: BlockedTime }) {
  return (
    <div
      className="w-full p-4 flex items-center gap-3"
      style={{
        borderRadius: 20,
        border: "1px solid rgba(148,163,184,0.20)",
        background: "repeating-linear-gradient(135deg,rgba(148,163,184,0.08),rgba(148,163,184,0.08) 8px,rgba(148,163,184,0.14) 8px,rgba(148,163,184,0.14) 16px)",
      }}
    >
      <div className="flex flex-col items-center shrink-0 w-12">
        <span className="text-sm font-bold text-[#64748B]">{block.startTime}</span>
        <span className="text-[10px] text-[#94A3B8]">{block.endTime}</span>
      </div>
      <div className="h-11 w-11 rounded-full grid place-items-center bg-[#E2E8F0] shrink-0">
        <Lock className="h-4 w-4 text-[#64748B]" strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#475569]">Bloqueado</p>
        <p className="text-[12px] text-[#64748B] truncate">{block.reason}</p>
      </div>
    </div>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ onNew: _onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-14 w-14 rounded-2xl grid place-items-center bg-[#F1F5F9] mb-4">
        <CalendarDays className="h-6 w-6 text-[#94A3B8]" strokeWidth={1.5} />
      </div>
      <p className="text-sm text-[#6B7280]">Nenhum agendamento para este dia.</p>
    </div>
  );
}

// ─── Month grid (mobile tab) ─────────────────────────────────────────────────

function MonthGrid({
  appointments,
  selectedDate,
  onSelectDay,
}: {
  appointments: Appointment[];
  selectedDate: Date;
  onSelectDay: (d: Date) => void;
}) {
  const [cursor, setCursor] = useState(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay === 0 ? 6 : firstDay - 1).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const todayStr = toDateStr(new Date());

  const statusDots = (day: number) => {
    const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayAppts = appointments.filter((a) => a.date === ds);
    return [...new Set(dayAppts.map((a) => statusStyle(a.status).badge))].slice(0, 3);
  };

  return (
    <div
      className="bg-white p-4"
      style={{ borderRadius: 20, border: "1px solid #EEF2F7", boxShadow: "0 8px 24px rgba(15,23,42,0.04)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-base font-semibold text-[#111827]">{MONTHS_CAP[month]}, {year}</span>
        <div className="flex gap-2">
          <button type="button" onClick={() => setCursor(new Date(year, month - 1, 1))} className="h-8 w-8 grid place-items-center rounded-lg border border-[#EEF2F7] text-[#6B7280]">
            <ChevronLeft className="h-4 w-4" strokeWidth={2} />
          </button>
          <button type="button" onClick={() => setCursor(new Date(year, month + 1, 1))} className="h-8 w-8 grid place-items-center rounded-lg border border-[#EEF2F7] text-[#6B7280]">
            <ChevronRight className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-semibold text-[#6B7280] py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isToday = ds === todayStr;
          const isSelected = toDateStr(selectedDate) === ds;
          const dots = statusDots(day);
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelectDay(new Date(year, month, day))}
              className="flex flex-col items-center py-1 rounded-xl active:bg-[#F1F5F9]"
            >
              <span
                className="text-sm font-medium w-8 h-8 flex items-center justify-center rounded-full"
                style={
                  isSelected
                    ? { background: "linear-gradient(135deg,#FF6FA7 0%,#FF8A4C 100%)", color: "#fff" }
                    : isToday
                    ? { border: "1.5px solid #FF6FA7", color: "#FF6FA7" }
                    : { color: "#374151" }
                }
              >
                {day}
              </span>
              <div className="flex gap-0.5 h-1.5 mt-0.5">
                {!isSelected && dots.map((c, idx) => (
                  <div key={idx} style={{ width: 4, height: 4, borderRadius: 999, background: c }} />
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function MobileAgenda({
  appointments,
  blockedTimes,
  selectedDate,
  filters,
  onDateChange,
  onFiltersChange,
  onNewAppointment,
  onNewBlock,
  onEditAppointment,
  onStatusChange,
}: Props) {
  const [tab, setTab] = useState<MobileTab>("day");
  const [detailAppt, setDetailAppt] = useState<Appointment | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  useRegisterMobileFab({ label: "Novo Agendamento", onClick: onNewAppointment });
  useRegisterMobileNavActions([
    { label: "Bloquear", icon: Lock, onClick: onNewBlock },
    { label: "Calendário", icon: CalendarDays, onClick: () => setCalendarOpen(true) },
  ]);

  const selStr = toDateStr(selectedDate);

  const matchesFilters = (a: Appointment) => {
    if (filters.professionalId && a.professionalId !== filters.professionalId) return false;
    if (filters.roomId && a.roomId !== filters.roomId) return false;
    if (filters.type && a.type !== filters.type) return false;
    if (filters.status && a.status !== filters.status) return false;
    return true;
  };

  const dayAppts = appointments
    .filter((a) => a.date === selStr && matchesFilters(a))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const dayBlocks = blockedTimes.filter((b) => b.date === selStr);

  // Day timeline = appointments + blocks ordered by time
  const timelineItems: ({ kind: "appt"; data: Appointment } | { kind: "block"; data: BlockedTime })[] = [
    ...dayAppts.map((a) => ({ kind: "appt" as const, data: a })),
    ...dayBlocks.map((b) => ({ kind: "block" as const, data: b })),
  ].sort((x, y) => x.data.startTime.localeCompare(y.data.startTime));

  // List view = whole visible week grouped by date
  const weekStart = getMondayOfWeek(selectedDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const isToday = selStr === toDateStr(new Date());
  const subtitle = isToday
    ? `Hoje, ${selectedDate.getDate()} de ${MONTHS_PT[selectedDate.getMonth()]}`
    : `${DAYS_SHORT[selectedDate.getDay()]}, ${selectedDate.getDate()} de ${MONTHS_PT[selectedDate.getMonth()]}`;

  const tabs: { id: MobileTab; label: string }[] = [
    { id: "day", label: "Dia" },
    { id: "list", label: "Lista" },
    { id: "month", label: "Mês" },
  ];

  return (
    <div className="lg:hidden flex-1 min-w-0 min-h-screen" style={{ background: "#F8F8FA" }}>
      <div className="px-4 pt-6 pb-28 space-y-5">
        {/* Header */}
        <header>
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-[#111827]">Agenda</h1>
            <p className="text-sm text-[#6B7280] mt-1 capitalize">{subtitle}</p>
          </div>
        </header>

        {/* Stats carousel */}
        <StatsCarousel appointments={appointments} date={selStr} />

        {/* Filters button */}
        <button
          type="button"
          onClick={() => setFilterOpen(true)}
          className="w-full flex items-center gap-2 px-4 h-11 rounded-[14px] bg-white border border-[#EEF2F7] text-[#374151]"
          style={{ boxShadow: "0 4px 12px rgba(15,23,42,0.04)" }}
        >
          <SlidersHorizontal className="h-4 w-4 text-[#6B7280]" strokeWidth={1.75} />
          <span className="text-sm font-medium text-[#374151]">Filtros</span>
        </button>

        {/* Date selector */}
        <DateSelector selectedDate={selectedDate} onDateChange={onDateChange} />

        {/* Tabs */}
        <div className="flex gap-1 bg-white p-1 rounded-[14px]" style={{ border: "1px solid #EEF2F7" }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "flex-1 py-2 text-sm font-medium rounded-[10px] transition-colors",
                tab === t.id ? "text-[#FF5F7E]" : "text-[#6B7280]",
              )}
              style={tab === t.id ? { background: "rgba(255,111,167,0.12)" } : {}}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === "day" && (
          timelineItems.length === 0 ? (
            <EmptyState onNew={onNewAppointment} />
          ) : (
            <div className="relative pl-4">
              {/* vertical connector line */}
              <div className="absolute left-1.5 top-2 bottom-2 w-px bg-[#E2E8F0]" />
              <div className="space-y-3">
                {timelineItems.map((item) => (
                  <div key={item.kind + item.data.id} className="relative">
                    <div
                      className="absolute -left-[14px] top-5 rounded-full ring-4 ring-[#F8F8FA]"
                      style={{
                        width: 9,
                        height: 9,
                        background: item.kind === "appt" ? statusStyle(item.data.status).badge : "#94A3B8",
                      }}
                    />
                    {item.kind === "appt" ? (
                      <AppointmentCard appt={item.data} onClick={() => setDetailAppt(item.data)} />
                    ) : (
                      <BlockCard block={item.data} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        )}

        {tab === "list" && (
          <div className="space-y-5">
            {weekDays.map((d) => {
              const ds = toDateStr(d);
              const items = appointments
                .filter((a) => a.date === ds && matchesFilters(a))
                .sort((a, b) => a.startTime.localeCompare(b.startTime));
              if (items.length === 0) return null;
              return (
                <div key={ds} className="space-y-2.5">
                  <h3 className="text-sm font-semibold text-[#111827] capitalize px-1">
                    {DAYS_SHORT[d.getDay()]}, {d.getDate()} de {MONTHS_PT[d.getMonth()]}
                  </h3>
                  {items.map((a) => (
                    <AppointmentCard key={a.id} appt={a} onClick={() => setDetailAppt(a)} />
                  ))}
                </div>
              );
            })}
            {weekDays.every((d) => appointments.filter((a) => a.date === toDateStr(d) && matchesFilters(a)).length === 0) && (
              <EmptyState onNew={onNewAppointment} />
            )}
          </div>
        )}

        {tab === "month" && (
          <MonthGrid
            appointments={appointments.filter(matchesFilters)}
            selectedDate={selectedDate}
            onSelectDay={(d) => { onDateChange(d); setTab("day"); }}
          />
        )}
      </div>

      {/* Sheets */}
      <MobileAppointmentSheet
        appointment={detailAppt}
        open={!!detailAppt}
        onClose={() => setDetailAppt(null)}
        onStatusChange={onStatusChange}
        onEdit={onEditAppointment}
      />
      <MobileFilterSheet
        open={filterOpen}
        filters={filters}
        onClose={() => setFilterOpen(false)}
        onApply={onFiltersChange}
      />
      <MobileCalendarSheet
        open={calendarOpen}
        selectedDate={selectedDate}
        appointments={appointments}
        onClose={() => setCalendarOpen(false)}
        onSelect={onDateChange}
      />
    </div>
  );
}
