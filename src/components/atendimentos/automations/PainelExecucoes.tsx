import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, CheckCircle2, Clock, CornerDownRight, SkipForward } from "lucide-react";
import { getAutomationRuns, type AutomationRunLogRow } from "@/lib/atendimentos/automations.functions";
import {
  ACTION_LABEL,
  ehCaminho,
  rotuloDaExecucao,
  type TomDaExecucao,
} from "@/components/atendimentos/automations/automationLabels";
import type { AutomationActionType } from "@/lib/atendimentos/automations.functions";
import { cn } from "@/lib/utils";

// Por que a automação não mandou nada?
//
// O executor já registrava a resposta a cada tentativa — enviada, sem contato,
// cota estourada, variável sem valor, fora da janela — e `getAutomationRuns` já
// lia isso. O que faltava era uma tela: sem ela, a única forma de saber era
// consultar o banco, então na prática ninguém sabia.

const TOM: Record<TomDaExecucao, { icone: typeof CheckCircle2; classe: string }> = {
  ok: { icone: CheckCircle2, classe: "bg-success-soft text-success" },
  erro: { icone: AlertCircle, classe: "bg-danger-soft text-danger" },
  pulado: { icone: SkipForward, classe: "bg-warning-soft text-warning" },
  espera: { icone: Clock, classe: "bg-violet-soft text-violet" },
  caminho: { icone: CornerDownRight, classe: "bg-surface-muted text-muted-foreground" },
};

function quando(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Linha({ run }: { run: AutomationRunLogRow }) {
  const { tom, titulo, explica } = rotuloDaExecucao(run.status);
  const { icone: Icone, classe } = TOM[tom];
  const caminho = ehCaminho(run.status);

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3",
        // Rastro de caminho fica recuado e apagado: é contexto de como o fluxo
        // andou, não um resultado. Alinhado com os outros, pareceria falha.
        caminho && "pl-10 opacity-70",
      )}
    >
      <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md", classe)}>
        <Icone className="h-4 w-4" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="text-sm font-medium text-foreground">{titulo}</p>
          {!caminho && (
            <p className="text-xs text-muted-foreground">
              {ACTION_LABEL[run.actionType as AutomationActionType] ?? run.actionType}
            </p>
          )}
        </div>
        {explica && <p className="mt-0.5 text-xs text-muted-foreground">{explica}</p>}
        {run.error && (
          <p className="mt-1 break-words rounded-md bg-surface-muted px-2 py-1 text-2xs text-foreground-secondary">
            {run.error}
          </p>
        )}
      </div>
      <span className="shrink-0 text-2xs tabular-nums text-foreground-subtle">{quando(run.ranAt)}</span>
    </div>
  );
}

export function PainelExecucoes({ ruleId }: { ruleId?: string }) {
  const buscar = useServerFn(getAutomationRuns);
  const runs = useQuery({
    queryKey: ["automation-runs", ruleId ?? "todas"],
    queryFn: () => buscar({ data: ruleId ? { ruleId } : {} }),
    staleTime: 15_000,
  });

  return (
    <section className="surface-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Execuções</h2>
          <p className="text-xs text-muted-foreground">Últimas 20 tentativas desta automação.</p>
        </div>
        <button
          type="button"
          onClick={() => runs.refetch()}
          disabled={runs.isFetching}
          className="press rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
        >
          {runs.isFetching ? "Atualizando…" : "Atualizar"}
        </button>
      </div>

      {runs.isError ? (
        <p className="px-4 py-5 text-sm text-danger">
          Não foi possível carregar as execuções: {(runs.error as Error).message}
        </p>
      ) : runs.isLoading ? (
        <p className="px-4 py-5 text-sm text-muted-foreground">Carregando…</p>
      ) : !runs.data?.length ? (
        // Vazio É uma resposta, e das mais úteis: distingue "rodou e foi
        // barrada" de "o gatilho nunca chegou até aqui".
        <div className="px-4 py-5">
          <p className="text-sm text-foreground">Nenhuma execução registrada.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            A automação ainda não foi acionada — ou o evento não chegou a ser avaliado. Se você já
            provocou o gatilho e nada aparece aqui, o mais provável é que a função de automações
            ainda não tenha sido publicada.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {runs.data.map((run) => (
            <Linha key={run.id} run={run} />
          ))}
        </div>
      )}
    </section>
  );
}
