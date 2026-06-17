import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/finance/format";
import type { TimelineEvent } from "@/lib/finance/planning.functions";

const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function FinancialTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <div className="surface-card p-5 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium">Linha do Tempo Financeira</h3>
      </div>

      <ul className="space-y-3 flex-1">
        {events.length === 0 && (
          <li className="text-sm text-muted-foreground">Nenhum evento financeiro previsto.</li>
        )}
        {events.map((e) => {
          const d = new Date(e.date + "T00:00:00");
          const isIn = e.amount > 0;
          return (
            <li key={e.id} className="flex items-center gap-4 p-2 -mx-2 rounded-xl hover:bg-muted/40 transition-colors">
              <div className="h-14 w-14 shrink-0 rounded-2xl bg-muted/60 grid place-content-center text-center">
                <div className="text-base font-semibold leading-none tabular-nums">{String(d.getDate()).padStart(2, "0")}</div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">{MONTHS_PT[d.getMonth()]}</div>
              </div>

              <div className={cn(
                "h-9 w-9 shrink-0 rounded-full grid place-items-center",
                isIn ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
              )}>
                {isIn ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{e.category}</p>
                <p className="text-xs text-muted-foreground truncate">{e.description}</p>
              </div>

              <div className="text-right shrink-0">
                <p className={cn(
                  "text-sm font-semibold tabular-nums whitespace-nowrap",
                  isIn ? "text-success" : "text-danger",
                )}>
                  {isIn ? "+" : "-"} {formatBRL(Math.abs(e.amount))}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {isIn ? "Recebimento" : "Pagamento"}
                </p>
              </div>

              <div className="hidden xl:block text-right shrink-0 min-w-[120px]">
                <p className="text-[11px] text-muted-foreground">Saldo após evento</p>
                <p className="text-sm font-medium tabular-nums">{formatBRL(e.balanceAfter)}</p>
              </div>
            </li>
          );
        })}
      </ul>

      <Button variant="ghost" size="sm" className="mt-4 w-full bg-muted/40 hover:bg-muted/60">
        Ver todos os eventos
      </Button>
    </div>
  );
}
