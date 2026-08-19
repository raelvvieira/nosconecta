import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Cabeçalho de página.
 *
 * Existia um por rota, escrito à mão, e eles divergiram: três tamanhos de
 * título (`text-2xl md:text-3xl`, `text-3xl lg:text-4xl`, `text-2xl`), ícone
 * em algumas telas e em outras não, e alinhamentos diferentes do bloco de
 * ações. Lado a lado, o mesmo produto parecia dois.
 *
 * Um componente só resolve os três de uma vez, e passa a ser o lugar onde
 * qualquer ajuste de cabeçalho acontece — em vez de dezoito.
 */
export function PageHeading({
  icon: Icon,
  title,
  subtitle,
  actions,
  kicker,
  className,
}: {
  /** Sempre presente: é o que identifica a seção de relance, e a ausência dele
   *  em algumas telas era a incoerência mais visível do conjunto. */
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  /** Botões e filtros da tela. Descem para baixo do título no celular. */
  actions?: React.ReactNode;
  /** Etiqueta curta acima do título, em maiúsculas. Usada onde a tela precisa
   *  se situar dentro de um módulo maior. */
  kicker?: string;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between xl:gap-6",
        className,
      )}
    >
      <div className="min-w-0">
        {kicker && (
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-pink">
            {kicker}
          </p>
        )}
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-foreground md:text-3xl">
          <Icon
            className="h-[1.1em] w-[1.1em] shrink-0 text-pink"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span className="truncate">{title}</span>
        </h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
