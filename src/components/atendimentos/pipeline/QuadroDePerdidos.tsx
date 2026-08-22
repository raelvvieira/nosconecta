import { useMemo } from "react";
import type { PipelineItem } from "@/lib/atendimentos/pipeline.functions";
import type { Deal } from "@/lib/atendimentos/deals.functions";

// O quadro de Perdidos.
//
// Antes eles apareciam nas colunas do funil de captação — "Relacionamento",
// "Agendado" — que não dizem nada sobre alguém que já não virá. Aqui a leitura
// é outra: agrupado pelo MOTIVO, que é a única informação que ainda vale
// alguma coisa depois da perda.
//
// Nesta onda o motivo ainda é texto livre (é o que `pipeline_deals.loss_reason`
// guarda hoje), então o agrupamento é pelo que foi escrito. A onda seguinte
// fecha a lista de motivos — é ela que faz este quadro virar colunas estáveis
// em vez de uma coluna por jeito diferente de escrever a mesma coisa.

const SEM_MOTIVO = "Sem motivo registrado";

export function QuadroDePerdidos({
  itens,
  deals,
  busca,
}: {
  itens: PipelineItem[];
  deals: Map<string, Deal>;
  busca: string;
}) {
  const grupos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const porMotivo = new Map<string, { item: PipelineItem; deal: Deal }[]>();

    for (const item of itens) {
      const deal = deals.get(item.id);
      if (!deal || deal.status !== "lost") continue;
      const nome = item.title ?? "";
      if (termo && !nome.toLowerCase().includes(termo)) continue;
      const motivo = deal.lossReason?.trim() || SEM_MOTIVO;
      porMotivo.set(motivo, [...(porMotivo.get(motivo) ?? []), { item, deal }]);
    }

    // Maior grupo primeiro: o motivo que mais faz a clínica perder é a
    // informação que ela precisa ver antes de qualquer outra.
    return [...porMotivo.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [itens, deals, busca]);

  if (!grupos.length) {
    return (
      <section className="surface-card mt-4 p-8 text-center">
        <p className="text-sm font-medium text-foreground">Nenhuma negociação perdida</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {busca
            ? "Ninguém com esse nome por aqui."
            : "Quando uma negociação for marcada como perdida, ela aparece aqui agrupada pelo motivo."}
        </p>
      </section>
    );
  }

  return (
    <div className="custom-scroll mt-4 flex flex-1 gap-3 overflow-x-auto pb-2">
      {grupos.map(([motivo, lista]) => (
        <div key={motivo} className="flex w-[280px] shrink-0 flex-col">
          <div className="flex items-center gap-2 px-1 pb-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-danger" />
            <h3 className="truncate text-sm font-semibold" title={motivo}>
              {motivo}
            </h3>
            <span className="ml-auto text-xs font-semibold text-muted-foreground">
              {lista.length}
            </span>
          </div>
          <div className="custom-scroll flex-1 space-y-2 overflow-y-auto overflow-x-hidden rounded-2xl bg-surface-subtle p-2">
            {lista.map(({ item, deal }) => (
              <div key={item.id} className="surface-card px-3 py-2.5">
                <p className="truncate text-sm font-semibold text-foreground">
                  {item.title || "Sem nome"}
                </p>
                {deal.value ? (
                  <p className="mt-0.5 text-2xs text-muted-foreground">
                    {deal.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
