import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/finance/format";
import { GRUPOS_DRE, variacao, type GrupoDre } from "@/lib/finance/dre";
import { getGastosDoPeriodo } from "@/lib/finance/dre.functions";
import { Delta } from "@/components/finance/Delta";

// Para onde foi o dinheiro no período da tela: por grupo do DRE (a barra de
// cima) e por categoria (a lista), cada um comparado com o período anterior
// do mesmo tamanho. Sem biblioteca de gráfico: é barra e número, e o que
// importa aqui é ler, não contemplar.

const COR_DO_GRUPO: Record<GrupoDre, string> = {
  receita: "var(--chart-1)",
  custo_variavel: "var(--chart-4)",
  despesa_fixa: "var(--chart-2)",
  financeiro: "var(--chart-5)",
  investimento: "var(--chart-3)",
};

const QUANTAS_DE_INICIO = 7;

export function GastosPorCategoria({ de, ate }: { de: string; ate: string }) {
  const buscar = useServerFn(getGastosDoPeriodo);
  const gastos = useQuery({
    queryKey: ["gastos-do-periodo", de, ate],
    queryFn: () => buscar({ data: { de, ate } }),
    staleTime: 60_000,
  });
  const [todas, setTodas] = useState(false);
  const d = gastos.data;
  const grupos = GRUPOS_DRE.filter((g) => g.id !== "receita" && (d?.atual.porGrupo[g.id] ?? 0) > 0);
  const anteriorDa = (id: string | null, grupo: GrupoDre) =>
    d?.anterior.categorias.find((c) => c.id === id && c.grupo === grupo)?.valor ?? 0;
  const maior = d?.atual.categorias[0]?.valor ?? 0;
  const lista = todas
    ? (d?.atual.categorias ?? [])
    : (d?.atual.categorias ?? []).slice(0, QUANTAS_DE_INICIO);

  return (
    <section className="surface-card flex h-full flex-col p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Para onde foi o dinheiro</h2>
          <p className="text-xs text-muted-foreground">No período, pelo dia do pagamento.</p>
        </div>
        {d && (
          <div className="text-right">
            <p className="text-lg font-semibold tabular-nums tracking-tight">
              {formatBRL(d.atual.total)}
            </p>
            <Delta pct={variacao(d.atual.total, d.anterior.total)} className="text-2xs" />
            {variacao(d.atual.total, d.anterior.total) === null && d.atual.total > 0 && (
              <span className="text-2xs text-muted-foreground">sem período anterior</span>
            )}
          </div>
        )}
      </div>

      {gastos.isLoading ? (
        <div className="flex-1 animate-pulse rounded-2xl bg-muted/40" aria-hidden />
      ) : gastos.error ? (
        <p className="text-sm text-danger">{(gastos.error as Error).message}</p>
      ) : !d || d.atual.total === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nenhum pagamento no período.
        </p>
      ) : (
        <>
          {/* A barra: quanto de cada grupo. */}
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted/50">
            {grupos.map((g) => (
              <div
                key={g.id}
                style={{
                  width: `${(d.atual.porGrupo[g.id] / d.atual.total) * 100}%`,
                  background: COR_DO_GRUPO[g.id],
                }}
                title={`${g.rotulo}: ${formatBRL(d.atual.porGrupo[g.id])}`}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {grupos.map((g) => (
              <span key={g.id} className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                <span className="h-2 w-2 rounded-full" style={{ background: COR_DO_GRUPO[g.id] }} />
                {g.rotulo}
                <span className="font-medium text-foreground tabular-nums">
                  {Math.round((d.atual.porGrupo[g.id] / d.atual.total) * 100)}%
                </span>
                <Delta
                  pct={variacao(d.atual.porGrupo[g.id], d.anterior.porGrupo[g.id])}
                  neutro={g.id === "investimento"}
                />
              </span>
            ))}
          </div>

          {/* A lista: as categorias, maior primeiro. */}
          <ul className="mt-4 flex-1 space-y-2.5">
            {lista.map((c) => (
              <li key={`${c.grupo}:${c.id ?? "sem"}`} className="text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: COR_DO_GRUPO[c.grupo] }}
                    />
                    <span className={cn("truncate", !c.id && "text-warning")}>{c.nome}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 tabular-nums">
                    <Delta
                      pct={variacao(c.valor, anteriorDa(c.id, c.grupo))}
                      neutro={c.grupo === "investimento"}
                    />
                    <span className="w-10 text-right text-muted-foreground">
                      {Math.round((c.valor / d.atual.total) * 100)}%
                    </span>
                    <span className="w-24 text-right font-medium">{formatBRL(c.valor)}</span>
                  </span>
                </div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted/40">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${maior ? (c.valor / maior) * 100 : 0}%`,
                      background: COR_DO_GRUPO[c.grupo],
                      opacity: 0.8,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex items-center justify-between">
            {d.atual.categorias.length > QUANTAS_DE_INICIO ? (
              <button
                type="button"
                onClick={() => setTodas((v) => !v)}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {todas
                  ? "Mostrar menos"
                  : `Mais ${d.atual.categorias.length - QUANTAS_DE_INICIO} categorias`}
              </button>
            ) : (
              <span />
            )}
            <Link
              to="/dre"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Ver o DRE
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
