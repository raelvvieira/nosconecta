import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Um bloco que, no celular, nasce fechado — só o título e uma seta.
 *
 * Varredura do financeiro em 23/10: a tela de Recebimentos no celular era
 * gráfico, cinco filtros empilhados, abas, lista, paginação e quatro cartões
 * de análise, tudo aberto, um atrás do outro. Nada disso some: dobra. Um
 * toque abre. No computador o bloco é sempre aberto e sem seta — o estado só
 * vale abaixo de `lg`.
 */
export function DobraNoCelular({
  titulo,
  resumo,
  aberto: abertoInicial = false,
  className,
  children,
}: {
  titulo: string;
  /** Uma palavra ao lado do título, para dizer o que há dentro sem abrir —
   *  "3 ativos", por exemplo. */
  resumo?: string;
  aberto?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(abertoInicial);
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full items-center justify-between gap-3 py-1 text-left lg:hidden"
      >
        <span className="text-sm font-semibold">{titulo}</span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {resumo}
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", aberto && "rotate-180")}
            strokeWidth={2}
          />
        </span>
      </button>
      <div className={cn(!aberto && "hidden lg:block", "lg:contents")}>{children}</div>
    </div>
  );
}
