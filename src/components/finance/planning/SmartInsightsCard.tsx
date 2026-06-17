import { TrendingUp, AlertTriangle, PieChart as PieIcon, Sparkles, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { INSIGHTS } from "./planning-mock";

const ICONS = { trend: TrendingUp, alert: AlertTriangle, pie: PieIcon, spark: Sparkles };
const TONE: Record<string, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  violet: "bg-violet-soft text-violet",
  info: "bg-blue-50 text-info dark:bg-blue-950/40",
};

export function SmartInsightsCard() {
  return (
    <div className="surface-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="font-medium">Insights Inteligentes</h3>
        <Info className="h-3.5 w-3.5 text-muted-foreground" />
      </div>

      <ul className="space-y-3">
        {INSIGHTS.map((i) => {
          const Icon = ICONS[i.icon];
          return (
            <li key={i.id} className="flex items-start gap-3">
              <div className={cn("h-8 w-8 shrink-0 rounded-lg grid place-items-center", TONE[i.tone])}>
                <Icon className="h-4 w-4" />
              </div>
              <p className="text-sm leading-snug pt-1.5">{i.text}</p>
            </li>
          );
        })}
      </ul>

      <button className="mt-4 w-full text-xs text-muted-foreground hover:text-foreground py-2 rounded-lg hover:bg-muted/40">
        Ver todos os insights
      </button>
    </div>
  );
}
