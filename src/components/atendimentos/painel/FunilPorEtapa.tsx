import { PUBLICOS, type Publico } from "@/lib/atendimentos/publico";
import { inteiro } from "@/lib/gestao/formato";
import { cn } from "@/lib/utils";
import type { FunilDeLeads } from "@/lib/atendimentos/funis.functions";

// Quantas pessoas há em cada etapa, funil a funil. Barra cheia = ativos;
// barra esmaecida = parados (sem movimento). A cor é a da própria etapa.

export function FunilPorEtapa({
  publico,
  onPublico,
  funil,
}: {
  publico: Publico;
  onPublico: (p: Publico) => void;
  funil: FunilDeLeads | null;
}) {
  const colunas = funil?.colunas ?? [];
  const linhas = colunas.map((c) => {
    const r = funil?.resumo[c.id];
    return { c, ativos: r?.ativos ?? 0, parados: r?.parados ?? 0 };
  });
  const maximo = Math.max(1, ...linhas.map((l) => l.ativos + l.parados));
  const total = linhas.reduce((s, l) => s + l.ativos + l.parados, 0);
  return (
    <div>
      <div className="flex flex-wrap gap-1.5" role="tablist">
        {PUBLICOS.map((p) => (
          <button
            key={p.value}
            type="button"
            role="tab"
            aria-selected={p.value === publico}
            onClick={() => onPublico(p.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              p.value === publico
                ? "border-foreground bg-foreground font-medium text-background"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className={cn("mt-4 grid gap-2.5", !funil && "animate-pulse opacity-60")}>
        {linhas.map(({ c, ativos, parados }) => (
          <div
            key={c.id}
            className="grid grid-cols-[7.5rem_1fr_2rem] items-center gap-3 sm:grid-cols-[10rem_1fr_2.5rem]"
          >
            <span className="flex min-w-0 items-center gap-2 text-sm">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.cor }} />
              <span className="truncate">{c.nome}</span>
            </span>
            <span className="flex h-2.5 overflow-hidden rounded-full bg-muted/60">
              <span
                className="h-full"
                style={{ width: `${(ativos / maximo) * 100}%`, background: c.cor }}
              />
              <span
                className="h-full"
                style={{ width: `${(parados / maximo) * 100}%`, background: c.cor, opacity: 0.3 }}
              />
            </span>
            <span className="text-right text-sm font-medium tabular-nums">
              {inteiro(ativos + parados)}
            </span>
          </div>
        ))}
        {funil && !linhas.length && (
          <p className="text-sm text-muted-foreground">Nenhuma etapa neste funil.</p>
        )}
      </div>

      {funil && total > 0 && (
        <p className="mt-4 flex items-center gap-4 text-2xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-full bg-foreground/70" /> ativos
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-full bg-foreground/25" /> parados
          </span>
        </p>
      )}
    </div>
  );
}
