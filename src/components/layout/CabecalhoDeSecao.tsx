import { ChevronLeft } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// O cabeçalho de uma seção do menu: uma faixa de altura fixa, sempre.
//
// Antes eram duas linhas no submenu (botão "‹ Módulos" numa, rótulo da seção
// noutra) e uma só na lista de módulos. Isso empurrava o rótulo 46px para
// baixo ao entrar num módulo — 36px do botão, 4px da margem dele e 6px do gap
// do nav. Era o "MÓDULOS muda de lugar".
//
// Agora a seta divide a linha com o título. Some junto o único texto em caixa
// mista da região: o "Módulos" escrito no botão, que ficava logo acima de um
// "ATENDIMENTOS" em caixa alta. O que resta visível aqui é sempre maiúsculo.

/** Altura da faixa, igual nas duas vistas e nos dois estados da ilha.
 *  É o número que faz o primeiro item da lista começar sempre no mesmo y. */
const ALTURA = "h-9";

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
  const seta = onVoltar && (
    <button
      type="button"
      onClick={onVoltar}
      className="press grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      aria-label="Voltar aos módulos"
    >
      <ChevronLeft className="h-[16px] w-[16px]" strokeWidth={2} />
    </button>
  );

  const setaComDica = seta && (
    <Tooltip>
      <TooltipTrigger asChild>{seta}</TooltipTrigger>
      <TooltipContent side="right" className="font-medium">
        Voltar aos módulos
      </TooltipContent>
    </Tooltip>
  );

  // Recolhida não há texto — mas a faixa continua ocupando a mesma altura, ou
  // os ícones da lista desalinhariam entre uma vista e outra pelo mesmo motivo
  // que o rótulo desalinhava quando expandida.
  if (collapsed) {
    return (
      <div className={cn(ALTURA, "mb-1 flex w-full shrink-0 items-center justify-center")}>
        {setaComDica}
      </div>
    );
  }

  return (
    <div className={cn(ALTURA, "mb-1 flex w-full shrink-0 items-center gap-1.5 px-1.5")}>
      {setaComDica}
      <span
        className={cn(
          "truncate text-3xs font-semibold uppercase tracking-wider text-muted-foreground",
          // Sem a seta, o rótulo assume o recuo que ela ocuparia, para o texto
          // nascer alinhado com o ícone dos itens abaixo nas duas vistas.
          !onVoltar && "pl-1.5",
        )}
      >
        {titulo}
      </span>
    </div>
  );
}
