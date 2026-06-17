import { Calendar as CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

export interface DateRangePickerProps {
  from?: string;
  to?: string;
  onChange: (range: { from?: string; to?: string }) => void;
  className?: string;
}

const fmt = (d?: string) => {
  if (!d) return "";
  const x = new Date(d + "T00:00:00");
  return x.toLocaleDateString("pt-BR");
};

const toIso = (d?: Date) => (d ? d.toISOString().slice(0, 10) : undefined);

export function DateRangePicker({ from, to, onChange, className }: DateRangePickerProps) {
  const selected: DateRange | undefined =
    from && to
      ? { from: new Date(from + "T00:00:00"), to: new Date(to + "T00:00:00") }
      : undefined;
  const label = from && to ? `${fmt(from)} – ${fmt(to)}` : "Selecionar período";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-3 px-4 h-11 rounded-xl bg-card/70 backdrop-blur border border-border/70 text-sm text-foreground/80 shadow-sm hover:bg-card transition-colors",
            className,
          )}
        >
          <span className="tabular-nums">{label}</span>
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="range"
          numberOfMonths={2}
          selected={selected}
          onSelect={(range) => onChange({ from: toIso(range?.from), to: toIso(range?.to) })}
          className="p-3 pointer-events-auto"
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
