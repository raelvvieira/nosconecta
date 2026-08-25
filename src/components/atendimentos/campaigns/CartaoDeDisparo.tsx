import { Check, Clock, ListTree, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BroadcastResumo } from "@/lib/atendimentos/broadcast.functions";
import { progressoDoDisparo, terminaPorVoltaDe } from "@/lib/atendimentos/statusDoDisparo";

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** O selo de estado. Cor só onde ela significa alguma coisa: em andamento é
 *  neutro com um giro, concluído é verde, falha e cancelamento pedem atenção. */
function Selo({ estado, rotulo }: { estado: string; rotulo: string }) {
  const emAndamento = estado === "na_fila" || estado === "enviando";
  return (
    <span
      data-estado={estado}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs font-semibold",
        estado === "concluido" && "bg-success-soft text-success",
        estado === "concluido_com_falhas" && "bg-warning-soft text-warning",
        estado === "cancelado" && "bg-muted text-muted-foreground",
        emAndamento && "bg-surface text-foreground-secondary",
      )}
    >
      {emAndamento && (
        <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" strokeWidth={2.5} />
      )}
      {estado === "concluido" && <Check className="h-3 w-3" strokeWidth={3} />}
      {rotulo}
    </span>
  );
}

/**
 * Um disparo na lista, com o andamento à vista.
 *
 * A lista antes mostrava o começo da mensagem e "47/200 enviados" em texto
 * corrido, e **não se atualizava sozinha** — o número só mudava recarregando a
 * página. Para um envio que leva 40 minutos, isso é o mesmo que não ter
 * acompanhamento.
 *
 * O estado não vem de uma coluna: é derivado das contagens em
 * `statusDoDisparo.ts`. A tabela guarda `running | done | cancelled`, que basta
 * para o motor mas não para quem olha — "em andamento" com 0 de 200 e com 199
 * de 200 são situações diferentes, e a diferença decide se você espera ou vai
 * fazer outra coisa.
 */
export function CartaoDeDisparo({
  disparo,
  destacado,
  onCancelar,
  onDetalhes,
}: {
  disparo: BroadcastResumo;
  /** Recém-criado: chama atenção por alguns segundos. */
  destacado?: boolean;
  onCancelar: () => void;
  onDetalhes: () => void;
}) {
  const p = progressoDoDisparo(disparo);
  const fim = terminaPorVoltaDe(disparo);
  const pct = Math.round(p.progresso * 100);
  // Nome quando existe; senão o começo da mensagem, que é o que os disparos
  // criados antes do campo têm — inventar um nome para eles seria escrever
  // histórico que ninguém digitou.
  const titulo = disparo.name?.trim() || disparo.message;

  return (
    <div
      data-disparo={disparo.id}
      className={cn(
        "px-4 py-4 transition-colors sm:px-5",
        destacado && "bg-coral-soft/40",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{titulo}</p>
        <Selo estado={p.estado} rotulo={p.rotulo} />
      </div>

      <div className="mt-2.5 flex items-center gap-3">
        <div
          className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Progresso do disparo ${titulo}`}
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none",
              p.estado === "cancelado" ? "bg-muted-foreground/40" : "bg-gradient-primary",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="shrink-0 text-2xs font-semibold tabular-nums" data-progresso="">
          {disparo.enviados} de {disparo.total}
        </span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-muted-foreground">
        <span>começou às {hora(disparo.createdAt)}</span>
        {p.emAndamento && fim && (
          <>
            <span aria-hidden>·</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> termina ~{hora(fim.toISOString())}
            </span>
          </>
        )}
        {disparo.falhas > 0 && (
          <>
            <span aria-hidden>·</span>
            <span className="text-warning">
              {disparo.falhas} {disparo.falhas === 1 ? "falhou" : "falharam"}
            </span>
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={onDetalhes}>
            <ListTree className="h-3.5 w-3.5" /> Ver detalhes
          </Button>
          {p.emAndamento && (
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-danger" onClick={onCancelar}>
              <X className="h-3.5 w-3.5" /> Cancelar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
