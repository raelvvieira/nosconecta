import { useState } from "react";
import { ChevronRight, Users, Sparkles, Stethoscope, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/finance/format";
import type { ScenarioRow } from "@/lib/finance/planning.functions";

const ICONS = { user: Users, device: Sparkles, tooth: Stethoscope };

export function ScenarioSimulator({
  scenarios,
  onDelete,
  isDeleting,
}: {
  scenarios: ScenarioRow[];
  onDelete: (id: string) => void;
  isDeleting?: boolean;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const target = scenarios.find(s => s.id === confirmId) ?? null;

  return (
    <div className="surface-card p-5 flex flex-col">
      <h3 className="font-medium mb-4">Simulador de Cenários</h3>

      {scenarios.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-8 gap-3">
          <div className="h-10 w-10 rounded-xl bg-muted/60 grid place-items-center">
            <Sparkles className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">Nenhum cenário simulado ainda.</p>
          <Button size="sm" variant="outline" className="gap-2">
            <Plus className="h-3.5 w-3.5" /> Criar cenário
          </Button>
        </div>
      ) : (
        <ul className="space-y-3 flex-1">
          {scenarios.map((s) => {
            const Icon = ICONS[s.icon];
            const positive = s.impact90d >= 0;
            return (
              <li key={s.id} className="group relative">
                <button
                  type="button"
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-card/50 hover:bg-muted/40 hover:border-border transition-all text-left"
                >
                  <div className="h-10 w-10 shrink-0 rounded-xl bg-violet-soft text-violet grid place-items-center">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{s.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{s.subtitle}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{s.baseValue}</p>
                  </div>
                  <div className="text-right shrink-0 pr-7">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Impacto em 90 dias</p>
                    <p className={cn(
                      "text-sm font-semibold tabular-nums whitespace-nowrap",
                      positive ? "text-success" : "text-danger",
                    )}>
                      {positive ? "+ " : "- "}{formatBRL(Math.abs(s.impact90d))}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2" />
                </button>
                <button
                  type="button"
                  aria-label="Excluir cenário"
                  onClick={(e) => { e.stopPropagation(); setConfirmId(s.id); }}
                  className="absolute right-2 top-2 h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-danger hover:bg-danger-soft opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {scenarios.length > 0 && (
        <Button variant="ghost" size="sm" className="mt-4 w-full bg-muted/40 hover:bg-muted/60">
          Ver todos os cenários
        </Button>
      )}

      <AlertDialog open={!!confirmId} onOpenChange={(o) => !o && setConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cenário?</AlertDialogTitle>
            <AlertDialogDescription>
              {target ? `O cenário "${target.name}" será removido permanentemente.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={() => {
                if (confirmId) { onDelete(confirmId); setConfirmId(null); }
              }}
              className="bg-danger text-danger-foreground hover:bg-danger/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
