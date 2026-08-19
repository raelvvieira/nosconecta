import { useState } from "react";
import { TrendingUp, AlertTriangle, PieChart as PieIcon, Sparkles, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Insight } from "@/lib/finance/planning.functions";

const ICONS = { trend: TrendingUp, alert: AlertTriangle, pie: PieIcon, spark: Sparkles };
const TONE: Record<string, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  violet: "bg-violet-soft text-violet",
  info: "bg-blue-50 text-info dark:bg-blue-950/40",
};

/** O botão "Gerar mais" foi removido: ele devolvia frases de uma lista fixa no
 *  código ("Segunda-feira gera mais faturamento médio…"), sem consultar o banco
 *  — texto genérico apresentado como análise da clínica. Os insights que ficam
 *  são todos calculados a partir dos lançamentos reais (ver `computeInsights`). */
export function SmartInsightsCard({ insights }: { insights: Insight[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const visible = insights.filter((i) => !dismissed.has(i.id));

  return (
    <div className="surface-card p-5">
      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="font-medium truncate">Insights Inteligentes</h3>
          <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">
            Ainda não há lançamentos suficientes para gerar um insight.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((i) => {
            const Icon = ICONS[i.icon];
            return (
              <li key={i.id} className="group flex items-start gap-3 -mx-2 px-2 py-1.5 rounded-lg hover:bg-muted/30 transition-colors">
                <div className={cn("h-8 w-8 shrink-0 rounded-lg grid place-items-center", TONE[i.tone])}>
                  <Icon className="h-4 w-4" />
                </div>
                <p className="text-sm leading-snug pt-1.5 flex-1 min-w-0">{i.text}</p>
                <button
                  type="button"
                  aria-label="Dispensar insight"
                  onClick={() => setDismissed(prev => new Set(prev).add(i.id))}
                  className="relative tap-44 h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {(insights.length > 0 || dismissed.size > 0) && (
        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>{visible.length} de {insights.length} insights</span>
          {dismissed.size > 0 && (
            <button
              onClick={() => setDismissed(new Set())}
              className="hover:text-foreground underline-offset-2 hover:underline"
            >
              Restaurar dispensados
            </button>
          )}
        </div>
      )}
    </div>
  );
}
