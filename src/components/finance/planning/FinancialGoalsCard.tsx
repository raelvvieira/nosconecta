import { Info } from "lucide-react";
import { formatBRL } from "@/lib/finance/format";
import type { FinancialGoal } from "@/lib/finance/planning.functions";

export function FinancialGoalsCard({ goals }: { goals: FinancialGoal[] }) {
  const primary = goals.find(g => g.goal_type === "revenue") ?? goals[0];

  if (!primary) {
    return (
      <div className="surface-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="font-medium">Metas Financeiras</h3>
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">Nenhuma meta cadastrada ainda.</p>
      </div>
    );
  }

  const fill = Math.min(120, primary.percentage);

  return (
    <div className="surface-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">Metas Financeiras</h3>
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <button className="h-7 px-2 text-xs rounded-md border border-border/70 bg-card/70 text-muted-foreground hover:text-foreground capitalize">
          {primary.period === "monthly" ? "Mensal" : primary.period === "quarterly" ? "Trimestral" : primary.period === "yearly" ? "Anual" : "Custom"} ▾
        </button>
      </div>

      <p className="text-xs text-muted-foreground mb-3 truncate">{primary.name}</p>

      <ul className="space-y-3 text-sm">
        <li className="flex items-center justify-between">
          <span className="text-muted-foreground">Meta</span>
          <span className="tabular-nums font-medium">{formatBRL(primary.target_amount)}</span>
        </li>
        <li className="flex items-center justify-between">
          <span className="text-muted-foreground">Realizado</span>
          <span className="tabular-nums font-medium">{formatBRL(primary.realized)}</span>
        </li>
        <li className="flex items-center justify-between">
          <span className="text-muted-foreground">Projeção</span>
          <span className="tabular-nums font-medium">{formatBRL(primary.projection)}</span>
        </li>
      </ul>

      <div className="mt-4">
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet to-primary transition-all"
            style={{ width: `${(fill / 120) * 100}%` }}
          />
        </div>
        <p className={`text-xs font-medium text-right mt-1.5 tabular-nums ${primary.percentage >= 100 ? "text-success" : "text-muted-foreground"}`}>
          {primary.percentage}% da meta
        </p>
      </div>
    </div>
  );
}
