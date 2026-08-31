import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A casca de um card do painel do contato.
 *
 * Existe porque o painel tem nove seções: escritas à mão, elas divergiriam em
 * padding, raio e tamanho de título — foi o que aconteceu com os cabeçalhos de
 * página antes do `PageHeading`. Aqui o ajuste acontece num lugar só.
 *
 * O ícone fica em cinza, e não em coral: nove ícones coloridos numa coluna
 * estreita viram uma listra, e nenhum deles chama atenção para nada. O coral do
 * painel é reservado para o que exige ação.
 */
export function CardDoPainel({
  icone: Icone,
  titulo,
  acao,
  children,
  className,
}: {
  icone: LucideIcon;
  titulo: string;
  /** Link ou botão à direita do título — "Ver ficha", "Abrir", etc. */
  acao?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("surface-card p-5", className)}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Icone className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
          {titulo}
        </h3>
        {acao}
      </div>
      <div className="mt-3.5">{children}</div>
    </section>
  );
}

/**
 * Uma linha rótulo → valor.
 *
 * `valor` nulo vira travessão, nunca some e nunca vira zero. Uma linha ausente
 * faria a lista mudar de tamanho conforme o cadastro, e quem lê não saberia se
 * o campo não existe ou se está vazio — que são coisas diferentes na hora de
 * decidir se pede o dado ao paciente.
 */
export function LinhaDoPainel({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <span className="shrink-0 text-xs text-muted-foreground">{rotulo}</span>
      <span
        className={cn(
          "min-w-0 truncate text-right",
          valor ? "text-foreground" : "text-muted-foreground",
        )}
        title={valor ?? undefined}
      >
        {valor ?? "—"}
      </span>
    </div>
  );
}

/** Um número grande com rótulo — para o card de financeiro. */
export function NumeroDoPainel({
  rotulo,
  valor,
  tom = "normal",
}: {
  rotulo: string;
  valor: string | null;
  tom?: "normal" | "atraso";
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-2xs text-muted-foreground">{rotulo}</p>
      <p
        className={cn(
          "mt-0.5 truncate text-base font-semibold",
          !valor && "text-muted-foreground",
          valor && tom === "atraso" && "text-danger",
        )}
      >
        {valor ?? "—"}
      </p>
    </div>
  );
}
