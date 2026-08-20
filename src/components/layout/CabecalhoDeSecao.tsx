import { ChevronLeft } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// O cabeçalho de uma seção do menu: o "voltar" e o rótulo.
//
// O bloco do botão voltar estava escrito TRÊS vezes, palavra por palavra, nas
// vistas de financeiro, atendimentos e agenda. Aqui ele existe uma vez, o que
// também garante que o primeiro item da lista comece sempre na mesma altura —
// que é a queixa de "MÓDULOS muda de lugar".

export function CabecalhoDeSecao({
  titulo,
  collapsed,
  onVoltar,
}: {
  titulo: string;
  collapsed: boolean;
  /** Ausente na lista de módulos, que é a raiz e não tem para onde voltar. */
  onVoltar?: () => void;
}) {
  const voltar = onVoltar && (
    <button
      type="button"
      onClick={onVoltar}
      className={cn(
        "press flex items-center rounded-xl text-muted-foreground hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        collapsed ? "h-10 w-10 justify-center" : "h-9 w-full px-3 gap-2 mb-1",
      )}
      aria-label="Voltar aos módulos"
    >
      <ChevronLeft className="h-[16px] w-[16px] shrink-0" strokeWidth={2} />
      {!collapsed && <span className="text-xs font-medium">Módulos</span>}
    </button>
  );

  return (
    <>
      {voltar &&
        (collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>{voltar}</TooltipTrigger>
            <TooltipContent side="right" className="font-medium">
              Voltar aos módulos
            </TooltipContent>
          </Tooltip>
        ) : (
          voltar
        ))}

      {!collapsed && (
        <span className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground px-3 mb-1">
          {titulo}
        </span>
      )}
    </>
  );
}
