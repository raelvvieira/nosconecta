import { cn } from "@/lib/utils";

/**
 * O invólucro dos indicadores.
 *
 * No celular desenha UM cartão só, com os indicadores separados por linhas
 * finas. No desktop ele some — vira a grade de sempre, e cada `KpiCard`
 * volta a ter moldura própria. Toda a diferença está na utility
 * `bloco-de-indicadores` (ver `src/styles.css`).
 *
 * `colunas` é para telas que não usam as quatro colunas do padrão.
 */
export function GrupoDeKpis({
  children,
  colunas = "xl:grid-cols-4",
  className,
}: {
  children: React.ReactNode;
  colunas?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // Sem vão no celular: quem separa é a divisória, não o espaço.
        "bloco-de-indicadores grid grid-cols-2 gap-0 md:gap-5",
        colunas,
        className,
      )}
    >
      {children}
    </div>
  );
}
