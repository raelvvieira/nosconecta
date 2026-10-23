import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { VoltarAoInicio } from "./VoltarAoInicio";

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
  acaoMobile,
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
  /**
   * A ação principal da tela, como ÍCONE ao lado do título — só no celular.
   *
   * Varredura de 23/10: no celular cada tela tinha um botão da largura da
   * tela ("Novo paciente", "Convidar pessoa") tomando o lugar do conteúdo.
   * No iPhone a ação principal é um "+" no cabeçalho; aqui também.
   */
  acaoMobile?: React.ReactNode;
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
        <VoltarAoInicio />
        {/* Rótulo e explicação só no computador. No celular eram cinco
            linhas antes do conteúdo, para dizer o que a tela já diz no
            título — quem usa o sistema todo dia não precisa ler o que é
            "Pacientes". */}
        {kicker && (
          <p className="mb-2 hidden items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-pink lg:flex">
            {kicker}
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <h1 className="flex min-w-0 items-center gap-2.5 text-[26px] font-semibold tracking-tight text-foreground md:text-3xl">
            <Icon
              className="hidden h-[1.1em] w-[1.1em] shrink-0 text-pink lg:block"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <span className="truncate">{title}</span>
          </h1>
          {acaoMobile && <div className="shrink-0 lg:hidden">{acaoMobile}</div>}
        </div>
        {subtitle && (
          <p className="mt-1 hidden text-sm text-muted-foreground lg:block">{subtitle}</p>
        )}
      </div>
      {/* `shrink-0` sem `min-w-0` deixava uma ação larga demais estourar a
          linha mesmo com o `flex-wrap` — o item não quebra por dentro, então
          ou cabe ou vaza. No celular a caixa pode encolher; a partir de `xl`,
          quando ela divide a linha com o título, volta a não encolher. */}
      {actions && (
        <div className="flex min-w-0 flex-wrap items-center gap-2 xl:shrink-0">{actions}</div>
      )}
    </header>
  );
}
