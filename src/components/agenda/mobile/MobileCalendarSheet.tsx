import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
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
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="border-0" style={{ background: "var(--surface)" }}>
        <DrawerTitle className="sr-only">Escolher data</DrawerTitle>
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-base font-semibold text-foreground">
              {MONTHS_PT[month]}, {year}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCursor(new Date(year, month - 1, 1))}
                className="h-9 w-9 grid place-items-center rounded-xl bg-white border border-surface-muted text-muted-foreground"
              >
                <ChevronLeft className="h-4 w-4" strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => setCursor(new Date(year, month + 1, 1))}
                className="h-9 w-9 grid place-items-center rounded-xl bg-white border border-surface-muted text-muted-foreground"
              >
                <ChevronRight className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
              <div key={i} className="text-center text-2xs font-semibold text-muted-foreground py-1">{d}</div>
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
                  className="flex flex-col items-center py-1 rounded-xl active:bg-surface-muted transition-colors"
                >
                  <span
                    className="text-sm font-medium w-9 h-9 flex items-center justify-center rounded-full"
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
                  {count > 0 && !isSelected && (
                    <div style={{ width: 4, height: 4, borderRadius: 9999, background: "var(--pink)", marginTop: 2 }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
