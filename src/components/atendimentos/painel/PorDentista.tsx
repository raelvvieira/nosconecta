import type { LinhaPorDentista } from "@/lib/atendimentos/painel/metricas";
import { formatBRL } from "@/lib/finance/format";
import { inteiro } from "@/lib/gestao/formato";

// Quantos atendimentos cada dentista concluiu no período e quanto isso rendeu.
// A barra é a QUANTIDADE (a maior ocupa a largura toda); a receita fica ao lado,
// em número. Sem acesso ao financeiro, a coluna de receita não existe.

export function PorDentista({
  linhas,
  receitaVisivel,
}: {
  linhas: LinhaPorDentista[] | null;
  receitaVisivel: boolean;
}) {
  if (!linhas) return <div className="h-40 animate-pulse rounded-2xl bg-muted/40" />;
  if (!linhas.length) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Nenhum atendimento concluído neste período.
      </p>
    );
  }
  const maximo = Math.max(1, ...linhas.map((l) => l.atendimentos));
  const total = linhas.reduce((s, l) => s + l.atendimentos, 0);
  const receitaTotal = linhas.reduce((s, l) => s + (l.receita ?? 0), 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p>
          <span className="text-3xl font-semibold leading-none tracking-tight tabular-nums">
            {inteiro(total)}
          </span>{" "}
          <span className="text-xs text-muted-foreground">
            {total === 1 ? "atendimento concluído" : "atendimentos concluídos"}
          </span>
        </p>
        {receitaVisivel && (
          <p>
            <span className="text-3xl font-semibold leading-none tracking-tight tabular-nums">
              {formatBRL(receitaTotal)}
            </span>{" "}
            <span className="text-xs text-muted-foreground">de receita</span>
          </p>
        )}
      </div>

      <ul className="grid gap-3">
        {linhas.map((l) => (
          <li
            key={l.nome}
            className={
              receitaVisivel
                ? "grid grid-cols-[minmax(0,9rem)_1fr_2rem_6.5rem] items-center gap-3"
                : "grid grid-cols-[minmax(0,9rem)_1fr_2rem] items-center gap-3"
            }
          >
            <span className="truncate text-sm" title={l.nome}>
              {l.nome}
            </span>
            <span className="h-2.5 overflow-hidden rounded-full bg-muted/60">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${(l.atendimentos / maximo) * 100}%`,
                  minWidth: "6px",
                  background: "var(--chart-1)",
                }}
              />
            </span>
            <span className="text-right text-sm font-medium tabular-nums">
              {inteiro(l.atendimentos)}
            </span>
            {receitaVisivel && (
              <span className="text-right text-sm tabular-nums text-muted-foreground">
                {formatBRL(l.receita ?? 0)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
