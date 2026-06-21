import { ChevronLeft, ChevronRight, Bell } from "lucide-react";
import type { Appointment, AgendaFilters, WaitingListItem } from "./types";
import { statusStyle, STATUS_LABEL } from "./appointment-utils";
import { professionals, rooms } from "./mock-data";

const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
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
    <div
      className="bg-white p-4"
      style={{ borderRadius: 20, border: "1px solid #EEF2F7", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-[#111827]">
          {MONTHS_PT[month]}, {year}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => navigateMonth(-1)}
            className="h-7 w-7 grid place-items-center rounded-lg text-[#6B7280] hover:bg-[#F8F8FA] transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => navigateMonth(1)}
            className="h-7 w-7 grid place-items-center rounded-lg text-[#6B7280] hover:bg-[#F8F8FA] transition-colors"
          >
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-semibold text-[#6B7280] py-1">{d}</div>
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
              className="flex flex-col items-center py-0.5 rounded-lg hover:bg-[#F8F8FA] transition-colors"
            >
              <span
                className="text-[11px] font-medium w-6 h-6 flex items-center justify-center rounded-full"
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
              {has && !isSelected && (
                <div style={{ width: 3, height: 3, borderRadius: 999, background: "#FF6FA7", marginTop: 1 }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Upcoming Appointments ───────────────────────────────────────────────────

function UpcomingAppointmentsCard({ appointments, selectedDate }: { appointments: Appointment[]; selectedDate: Date }) {
  const ds = toDateStr(selectedDate);
  const now = new Date();
  const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const upcoming = appointments
    .filter((a) => a.date === ds && a.startTime >= nowTime && a.status !== "cancelled" && a.status !== "missed")
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .slice(0, 4);

  return (
    <div
      className="bg-white p-4"
      style={{ borderRadius: 20, border: "1px solid #EEF2F7", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-[#111827]">Próximos atendimentos</span>
        <button type="button" className="text-xs font-medium" style={{ color: "#FF6FA7" }}>
          Ver todos
        </button>
      </div>

      {upcoming.length === 0 ? (
        <p className="text-xs text-[#6B7280] text-center py-4">Nenhum atendimento próximo</p>
      ) : (
        <div className="space-y-2">
          {upcoming.map((a) => {
            const s = statusStyle(a.status);
            return (
              <div
                key={a.id}
                className="flex items-start gap-3 p-3 rounded-xl"
                style={{ background: "#F8F8FA" }}
              >
                <div className="flex flex-col items-center shrink-0">
                  <span className="text-xs font-bold text-[#FF6FA7]">{a.startTime}</span>
                  <div style={{ width: 1, height: 16, background: "#EEF2F7", margin: "2px 0" }} />
                  <span className="text-[10px] text-[#6B7280]">{a.endTime}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[#111827] truncate">{a.patientName}</p>
                  <p className="text-[11px] text-[#6B7280] truncate">{a.procedureName}</p>
                  <p className="text-[11px] text-[#6B7280] truncate">{a.professionalName}</p>
                </div>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: s.badge,
                    marginTop: 4,
                    shrink: 0,
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

// ─── Waiting List ────────────────────────────────────────────────────────────

function WaitingListCard({ items }: { items: WaitingListItem[] }) {
  return (
    <div
      className="bg-white p-4"
      style={{ borderRadius: 20, border: "1px solid #EEF2F7", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-[#111827]">Lista de Espera</span>
        <button type="button" className="text-xs font-medium" style={{ color: "#FF6FA7" }}>
          Ver todos
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-[#6B7280] text-center py-4">Lista de espera vazia</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 p-3 rounded-xl"
              style={{ background: "#F8F8FA" }}
            >
              <div
                className="h-8 w-8 rounded-full grid place-items-center text-xs font-bold text-white shrink-0"
                style={{ background: "linear-gradient(135deg,#FF6FA7 0%,#FF8A4C 100%)" }}
              >
                {item.patientName.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-[#111827] truncate">{item.patientName}</p>
                <p className="text-[11px] text-[#6B7280] truncate">{item.procedureName}</p>
                <p className="text-[10px] text-[#94A3B8]">Entrou há {item.daysWaiting} dia{item.daysWaiting !== 1 ? "s" : ""}</p>
              </div>
              <button
                type="button"
                className="h-7 w-7 grid place-items-center rounded-lg hover:bg-white transition-colors"
              >
                <Bell className="h-3.5 w-3.5 text-[#6B7280]" strokeWidth={1.75} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Quick Filters ───────────────────────────────────────────────────────────

function QuickFiltersCard({ filters, onFiltersChange }: { filters: AgendaFilters; onFiltersChange: (f: AgendaFilters) => void }) {
  const clearAll = () =>
    onFiltersChange({ professionalId: "", roomId: "", type: "", status: "" });

  const hasFilters = filters.professionalId || filters.roomId || filters.type || filters.status;

  return (
    <div
      className="bg-white p-4"
      style={{ borderRadius: 20, border: "1px solid #EEF2F7", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-[#111827]">Filtros rápidos</span>
        {hasFilters && (
          <button type="button" onClick={clearAll} className="text-xs font-medium text-[#6B7280] hover:text-[#FF6FA7] transition-colors">
            Limpar filtros
          </button>
        )}
      </div>
      <div className="space-y-2">
        <select
          className="w-full text-xs border border-[#EEF2F7] rounded-xl px-3 py-2 text-[#6B7280] bg-white focus:outline-none"
          value={filters.professionalId}
          onChange={(e) => onFiltersChange({ ...filters, professionalId: e.target.value })}
        >
          <option value="">Todos os profissionais</option>
          {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select
          className="w-full text-xs border border-[#EEF2F7] rounded-xl px-3 py-2 text-[#6B7280] bg-white focus:outline-none"
          value={filters.roomId}
          onChange={(e) => onFiltersChange({ ...filters, roomId: e.target.value })}
        >
          <option value="">Todas as salas</option>
          {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select
          className="w-full text-xs border border-[#EEF2F7] rounded-xl px-3 py-2 text-[#6B7280] bg-white focus:outline-none"
          value={filters.type}
          onChange={(e) => onFiltersChange({ ...filters, type: e.target.value })}
        >
          <option value="">Todos os tipos</option>
          <option value="consultation">Consulta</option>
          <option value="evaluation">Avaliação</option>
          <option value="procedure">Procedimento</option>
          <option value="return">Retorno</option>
          <option value="emergency">Emergência</option>
        </select>
        <select
          className="w-full text-xs border border-[#EEF2F7] rounded-xl px-3 py-2 text-[#6B7280] bg-white focus:outline-none"
          value={filters.status}
          onChange={(e) => onFiltersChange({ ...filters, status: e.target.value })}
        >
          <option value="">Todos os status</option>
          <option value="confirmed">Confirmado</option>
          <option value="pending">Pendente</option>
          <option value="in_progress">Em andamento</option>
          <option value="completed">Concluído</option>
          <option value="missed">Faltou</option>
          <option value="cancelled">Cancelado</option>
        </select>
      </div>
    </div>
  );
}

// ─── RightSidebar ────────────────────────────────────────────────────────────

interface RightSidebarProps {
  selectedDate: Date;
  appointments: Appointment[];
  waitingList: WaitingListItem[];
  filters: AgendaFilters;
  onDateChange: (d: Date) => void;
  onFiltersChange: (f: AgendaFilters) => void;
}

export function RightSidebar({
  selectedDate,
  appointments,
  waitingList,
  filters,
  onDateChange,
  onFiltersChange,
}: RightSidebarProps) {
  return (
    <div className="flex flex-col gap-4">
      <MiniCalendar selected={selectedDate} appointments={appointments} onSelect={onDateChange} />
      <UpcomingAppointmentsCard appointments={appointments} selectedDate={selectedDate} />
      <WaitingListCard items={waitingList} />
      <QuickFiltersCard filters={filters} onFiltersChange={onFiltersChange} />
    </div>
  );
}
