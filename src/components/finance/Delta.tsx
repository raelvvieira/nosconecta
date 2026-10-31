import { cn } from "@/lib/utils";

/**
 * Quanto mudou em relação ao período anterior, em %.
 *
 * Nos gastos, subir é ruim (vermelho); na receita e nos resultados, subir é
 * bom (verde). `neutro` é para o que não é bom nem ruim, como investimento.
 */
export function Delta({
  pct,
  subirEBom,
  neutro,
  className,
}: {
  pct: number | null;
  subirEBom?: boolean;
  neutro?: boolean;
  className?: string;
}) {
  if (pct === null || pct === 0) return null;
  const subiu = pct > 0;
  const bom = neutro ? null : subirEBom ? subiu : !subiu;
  return (
    <span
      className={cn(
        "inline-block text-3xs font-medium tabular-nums",
        bom === null ? "text-muted-foreground" : bom ? "text-success" : "text-danger",
        className,
      )}
      title="Em relação ao período anterior"
    >
      {subiu ? "▲" : "▼"} {Math.abs(pct) >= 1000 ? "999+" : Math.abs(pct)}%
    </span>
  );
}
