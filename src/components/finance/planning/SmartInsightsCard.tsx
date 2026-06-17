import { useState, useMemo } from "react";
import { TrendingUp, AlertTriangle, PieChart as PieIcon, Sparkles, Info, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Insight } from "@/lib/finance/planning.functions";

const ICONS = { trend: TrendingUp, alert: AlertTriangle, pie: PieIcon, spark: Sparkles };
const TONE: Record<string, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  violet: "bg-violet-soft text-violet",
  info: "bg-blue-50 text-info dark:bg-blue-950/40",
};

export function SmartInsightsCard({
  insights,
  onGenerateMore,
  isGenerating,
}: {
  insights: Insight[];
  onGenerateMore: (excludeIds: string[]) => void;
  isGenerating?: boolean;
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState<Insight[]>([]);

  const allInsights = useMemo(() => {
    const seen = new Set<string>();
    return [...insights, ...extra].filter(i => {
      if (seen.has(i.id)) return false;
      seen.add(i.id);
      return true;
    });
  }, [insights, extra]);
  const visible = allInsights.filter(i => !dismissed.has(i.id));

  const handleGenerate = async () => {
    const excludeIds = allInsights.map(i => i.id);
    try {
      const more = await Promise.resolve(onGenerateMore(excludeIds)) as unknown as Insight[] | void;
      if (Array.isArray(more) && more.length) {
        setExtra(prev => [...prev, ...more]);
      }
    } catch { /* handled by mutation toast */ }
  };

  return (
    <div className="surface-card p-5">
      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="font-medium truncate">Insights Inteligentes</h3>
          <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs shrink-0"
          onClick={handleGenerate}
          disabled={isGenerating}
        >
          {isGenerating
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Sparkles className="h-3.5 w-3.5" />}
          Gerar mais
        </Button>
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-8 space-y-3">
          <p className="text-sm text-muted-foreground">Nenhum insight ativo no momento.</p>
          <Button variant="outline" size="sm" onClick={handleGenerate} disabled={isGenerating} className="gap-2">
            <Sparkles className="h-3.5 w-3.5" /> Gerar insights
          </Button>
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
                  className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {(allInsights.length > 0 || dismissed.size > 0) && (
        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>{visible.length} de {allInsights.length} insights</span>
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
