import { AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Sobreposicao } from "@/lib/agenda/conflicts";

/**
 * Avisa que o horário já está ocupado — e deixa seguir mesmo assim.
 *
 * Impedir seria errado: sobrepor acontece de propósito (dois profissionais, duas
 * salas, encaixe). O problema nunca foi a sobreposição, foi ela ser invisível —
 * o calendário empilha cards no mesmo lugar sem sinal nenhum, e quem move
 * descobria depois, quando os dois pacientes chegavam juntos.
 */
export function OverlapDialog({
  conflitos,
  destino,
  isPending,
  onCancel,
  onConfirm,
}: {
  /** Lista vazia ou null = fechado. */
  conflitos: Sobreposicao[] | null;
  destino: { date: string; startTime: string; endTime: string } | null;
  isPending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const aberto = Boolean(conflitos?.length && destino);

  return (
    <AlertDialog open={aberto} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent data-sobreposicao="">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" strokeWidth={2} />
            Esse horário já está ocupado
          </AlertDialogTitle>
          <AlertDialogDescription>
            {destino && (
              <>
                Mover para {destino.date.split("-").reverse().join("/")} às{" "}
                <span className="font-semibold text-foreground">{destino.startTime}</span> esbarra
                em:
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ul className="divide-y divide-border rounded-xl border border-border px-3">
          {(conflitos ?? []).map((c, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="min-w-0 truncate text-foreground">{c.rotulo}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {c.startTime} – {c.endTime}
              </span>
            </li>
          ))}
        </ul>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending} onClick={onCancel}>
            Deixar onde estava
          </AlertDialogCancel>
          <AlertDialogAction
            data-mover-assim-mesmo=""
            className="bg-gradient-primary text-white hover:opacity-90"
            disabled={isPending}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            {isPending ? "Movendo..." : "Mover assim mesmo"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
