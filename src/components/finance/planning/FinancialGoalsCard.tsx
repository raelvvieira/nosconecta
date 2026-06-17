import { Info } from "lucide-react";
import { formatBRL } from "@/lib/finance/format";
import { MONTHLY_GOAL, MONTHLY_REALIZED, MONTHLY_PROJECTION } from "./planning-mock";

export function FinancialGoalsCard() {
  const pct = Math.round((MONTHLY_PROJECTION / MONTHLY_GOAL) * 100);
  const fill = Math.min(120, pct);

  return (
    <div className="surface-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">Metas Financeiras</h3>
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <button className="h-7 px-2 text-xs rounded-md border border-border/70 bg-card/70 text-muted-foreground hover:text-foreground">
          Mensal ▾
        </button>
      </div>

      <ul className="space-y-3 text-sm">
        <li className="flex items-center justify-between">
          <span className="text-muted-foreground">Meta Mensal</span>
          <span className="tabular-nums font-medium">{formatBRL(MONTHLY_GOAL)}</span>
        </li>
        <li className="flex items-center justify-between">
          <span className="text-muted-foreground">Realizado</span>
          <span className="tabular-nums font-medium">{formatBRL(MONTHLY_REALIZED)}</span>
        </li>
        <li className="flex items-center justify-between">
          <span className="text-muted-foreground">Projeção</span>
          <span className="tabular-nums font-medium">{formatBRL(MONTHLY_PROJECTION)}</span>
        </li>
      </ul>

      <div className="mt-4">
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet to-primary transition-all"
            style={{ width: `${(fill / 120) * 100}%` }}
          />
        </div>
        <p className="text-xs text-success font-medium text-right mt-1.5 tabular-nums">{pct}% da meta</p>
      </div>
    </div>
  );
}
