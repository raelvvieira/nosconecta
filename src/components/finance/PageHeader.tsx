import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Period } from "@/lib/finance/queries.functions";

const options: { label: string; value: Period }[] = [
  { label: "Hoje", value: "today" },
  { label: "7 dias", value: "7d" },
  { label: "30 dias", value: "30d" },
  { label: "90 dias", value: "90d" },
];

export function PageHeader({
  period,
  onPeriodChange,
  rangeLabel,
}: {
  period: Period;
  onPeriodChange: (p: Period) => void;
  rangeLabel: string;
}) {
  return (
    <header className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Financeiro</h1>
        <p className="text-sm text-muted-foreground mt-1">Resumo financeiro da clínica</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 px-4 h-11 rounded-xl bg-card/70 backdrop-blur border border-border/70 text-sm text-foreground/80 shadow-sm">
          <span className="tabular-nums">{rangeLabel}</span>
          <Calendar className="h-4 w-4 text-muted-foreground ml-2" />
        </div>

        <div className="flex items-center p-1 rounded-xl bg-card/70 backdrop-blur border border-border/70 shadow-sm">
          {options.map((o) => (
            <button
              key={o.value}
              onClick={() => onPeriodChange(o.value)}
              className={cn(
                "px-4 h-9 text-sm rounded-lg transition-all",
                period === o.value
                  ? "bg-primary text-primary-foreground shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
