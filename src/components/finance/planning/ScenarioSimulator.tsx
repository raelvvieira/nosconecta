import { ChevronRight, Users, Sparkles, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/finance/format";
import { SCENARIOS } from "./planning-mock";

const ICONS = {
  user: Users,
  device: Sparkles,
  tooth: Stethoscope,
};

export function ScenarioSimulator() {
  return (
    <div className="surface-card p-5 flex flex-col">
      <h3 className="font-medium mb-4">Simulador de Cenários</h3>

      <ul className="space-y-3 flex-1">
        {SCENARIOS.map((s) => {
          const Icon = ICONS[s.icon];
          const positive = s.impact90d >= 0;
          return (
            <li key={s.id}>
              <button
                type="button"
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-card/50 hover:bg-muted/40 hover:border-border transition-all text-left group"
              >
                <div className="h-10 w-10 shrink-0 rounded-xl bg-violet-soft text-violet grid place-items-center">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{s.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.subtitle}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{s.baseValue}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Impacto em 90 dias</p>
                  <p className={cn(
                    "text-sm font-semibold tabular-nums whitespace-nowrap",
                    positive ? "text-success" : "text-danger",
                  )}>
                    {positive ? "+ " : "- "}{formatBRL(Math.abs(s.impact90d))}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0" />
              </button>
            </li>
          );
        })}
      </ul>

      <Button variant="ghost" size="sm" className="mt-4 w-full bg-muted/40 hover:bg-muted/60">
        Ver todos os cenários
      </Button>
    </div>
  );
}
