import { AlertTriangle, Loader2, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  descartarPreparacao,
  progressoDaPreparacao,
  retentarPreparacao,
  type DisparoEmPreparacao,
} from "@/lib/atendimentos/enfileiramento";

/**
 * O disparo antes de existir no banco.
 *
 * Mesma anatomia do cartão de um disparo real — título, selo, barra, rodapé —
 * de propósito: para quem olha, é o mesmo envio numa etapa anterior, não outra
 * coisa. Quando o enfileiramento falha, o cartão permanece com o erro do
 * servidor por extenso e a retentativa ao lado, em vez de o trabalho todo
 * evaporar junto com um toast.
 */
export function CartaoEmPreparacao({ item }: { item: DisparoEmPreparacao }) {
  const p = progressoDaPreparacao(item);
  const erro = item.etapa === "erro";
  const pct = Math.round(p.pct * 100);
  const titulo = item.nome?.trim() || item.message;

  return (
    <div className={cn("px-4 py-4 sm:px-5", erro ? "bg-danger/5" : "bg-coral-soft/30")}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{titulo}</p>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs font-semibold",
            erro ? "bg-danger/10 text-danger" : "bg-surface text-foreground-secondary",
          )}
        >
          {erro ? (
            <AlertTriangle className="h-3 w-3" strokeWidth={2.5} />
          ) : (
            <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" strokeWidth={2.5} />
          )}
          {p.rotulo}
        </span>
      </div>

      <div className="mt-2.5 flex items-center gap-3">
        <div
          className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Enfileiramento do disparo ${titulo}`}
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none",
              erro ? "bg-danger/60" : "bg-gradient-primary",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="shrink-0 text-2xs font-semibold tabular-nums">
          {p.total > 0 && !erro ? `${p.feitos} de ${p.total} vinculados` : `${p.totalContatos} contatos`}
        </span>
      </div>

      {erro && item.erro && (
        <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-2xs leading-relaxed text-danger">
          {item.erro}
        </p>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-muted-foreground">
        <span>
          {erro
            ? "Nada foi enviado — a fila não chegou a ser criada."
            : "Preparando o envio; ninguém recebeu ainda."}
        </span>
        {erro && (
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => retentarPreparacao(item.localId)}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Tentar novamente
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-muted-foreground"
              onClick={() => descartarPreparacao(item.localId)}
            >
              <X className="h-3.5 w-3.5" /> Descartar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
