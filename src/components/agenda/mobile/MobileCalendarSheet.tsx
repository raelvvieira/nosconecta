import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { Appointment } from "../types";

const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Props {
  open: boolean;
  selectedDate: Date;
  appointments: Appointment[];
  onClose: () => void;
  onSelect: (d: Date) => void;
}

export function MobileCalendarSheet({ open, selectedDate, appointments, onClose, onSelect }: Props) {
  const [cursor, setCursor] = useState(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));

  useEffect(() => {
    if (open) setCursor(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  }, [open, selectedDate]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay === 0 ? 6 : firstDay - 1).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const todayStr = toDateStr(new Date());

  const countFor = (day: number) => {
    const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return appointments.filter((a) => a.date === ds).length;
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="rounded-t-[28px] border-0 p-0"
        style={{ background: "#F8F8FA" }}
      >
        <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-[#E2E8F0]" />
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-base font-semibold text-[#111827]">
              {MONTHS_PT[month]}, {year}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCursor(new Date(year, month - 1, 1))}
                className="h-9 w-9 grid place-items-center rounded-xl bg-white border border-[#EEF2F7] text-[#6B7280]"
              >
                <ChevronLeft className="h-4 w-4" strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => setCursor(new Date(year, month + 1, 1))}
                className="h-9 w-9 grid place-items-center rounded-xl bg-white border border-[#EEF2F7] text-[#6B7280]"
              >
                <ChevronRight className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
              <div key={i} className="text-center text-[11px] font-semibold text-[#6B7280] py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-1">
            {cells.map((day, i) => {
              if (!day) return <div key={i} />;
              const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isToday = ds === todayStr;
              const isSelected = toDateStr(selectedDate) === ds;
              const count = countFor(day);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => { onSelect(new Date(year, month, day)); onClose(); }}
                  className="flex flex-col items-center py-1 rounded-xl active:bg-[#F1F5F9] transition-colors"
                >
                  <span
                    className="text-sm font-medium w-9 h-9 flex items-center justify-center rounded-full"
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
                  {count > 0 && !isSelected && (
                    <div style={{ width: 4, height: 4, borderRadius: 999, background: "#FF6FA7", marginTop: 2 }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
