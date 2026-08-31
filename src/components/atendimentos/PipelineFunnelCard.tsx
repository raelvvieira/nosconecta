import { Link } from "@tanstack/react-router";
import { Workflow } from "lucide-react";
import type { PipelineItem, PipelineStage } from "@/lib/atendimentos/pipeline.functions";

const COR_PADRAO = "var(--foreground-subtle)";

/**
 * O funil por etapa — um tile por etapa, na ordem do funil.
 *
 * Era um donut com legenda. Duas coisas estavam erradas nele:
 *
 * 1. **A ordem.** A legenda vinha ordenada por tamanho, então "Agendado" (a
 *    última etapa) aparecia em cima e "Primeiro Contato" embaixo. Um funil se
 *    lê na ordem em que as pessoas o percorrem — é assim que se enxerga onde
 *    elas empacam. Ordenado por tamanho, essa leitura some.
 * 2. **A forma.** Meia dúzia de números com nome é uma fileira de tiles, não um
 *    gráfico: o donut gastava 150px de largura para dizer o que a coluna de
 *    porcentagens ao lado já dizia, e etapas zeradas viravam fatias invisíveis
 *    com legenda — presentes na lista, ausentes no desenho.
 *
 * A barra embaixo de cada tile carrega a proporção; a cor é a da etapa, a mesma
 * do quadro do pipeline. O texto fica em tinta normal, nunca na cor da etapa:
 * cor de etapa é escolhida por quem configura o funil e não tem contraste
 * garantido para leitura.
 */
export function PipelineFunnelCard({
  configured,
  stages,
  items,
}: {
  configured: boolean;
  stages: PipelineStage[];
  items: PipelineItem[];
}) {
  const data = [...stages]
    .sort((a, b) => a.position - b.position)
    .map((s) => ({
      id: s.id,
      name: s.name,
      value: items.filter((i) => i.stageId === s.id).length,
      color: s.color,
    }));
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <section className="surface-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Workflow className="h-4 w-4 text-pink" />
          Funil por etapa
        </h2>
        <Link
          to="/atendimentos/pipeline"
          className="text-xs font-medium text-primary hover:underline"
        >
          Ver pipeline
        </Link>
      </div>

      {!configured ? (
        <p className="text-sm text-muted-foreground">
          Configure um pipeline em Atendimentos → Pipeline pra ver o funil aqui.
        </p>
      ) : total === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum contato no funil ainda.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {data.map((d) => {
            const pct = Math.round((d.value / total) * 100);
            const cor = d.color ?? COR_PADRAO;
            return (
              <li key={d.id} className="rounded-2xl bg-muted/50 px-4 py-3.5">
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: cor }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 truncate">{d.name}</span>
                </p>
                <p className="mt-1.5 flex items-baseline gap-1.5">
                  {/* Figuras proporcionais no número grande: `tabular-nums` dá a
                      todo dígito a largura do zero, e nesse corpo isso deixa
                      "121" visivelmente frouxo. */}
                  <span className="text-2xl font-semibold leading-none">{d.value}</span>
                  <span className="text-xs text-muted-foreground">{pct}%</span>
                </p>
                {/* A trilha é a própria cor da etapa clareada, não um cinza:
                    assim a barra inteira pertence à etapa mesmo quando a
                    proporção é pequena. */}
                <div
                  className="mt-2.5 h-1.5 overflow-hidden rounded-full"
                  style={{ background: `color-mix(in oklab, ${cor} 18%, transparent)` }}
                  role="img"
                  aria-label={`${pct}% dos contatos`}
                >
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: cor }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
