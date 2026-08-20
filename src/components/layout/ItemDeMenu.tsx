import { Link } from "@tanstack/react-router";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ItemDoMenu } from "@/components/layout/destinos";

// O item da ilha do desktop, uma vez só.
//
// Este bloco era escrito à mão em cada uma das quatro vistas do menu
// (módulos, financeiro, atendimentos e o submenu de um item da agenda). Quatro
// cópias do mesmo `cn(...)`, do mesmo tooltip, do mesmo `aria-current` — e é
// desse tipo de repetição que nasce a divergência que dá para ver na tela.

export function ItemDeMenu({
  destino,
  ativo,
  collapsed,
}: {
  destino: ItemDoMenu;
  ativo: boolean;
  collapsed: boolean;
}) {
  const Icone = destino.icon;

  const classe = cn(
    "press flex items-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
    collapsed ? "h-12 w-12 justify-center" : "h-12 w-full px-3 gap-3",
    ativo
      ? "bg-foreground text-white"
      : "text-muted-foreground hover:bg-surface-subtle hover:text-foreground",
  );

  const conteudo = (
    <>
      <Icone className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
      {!collapsed && <span className="text-sm font-medium truncate">{destino.label}</span>}
    </>
  );

  // Rota que ainda não existe: continua visível como sinal de "vem aí", mas
  // apagada e sem foco. Um <button disabled> e não um <Link> — link que não
  // leva a lugar nenhum é promessa quebrada em cima do teclado também.
  const elemento = destino.placeholder === true ? (
    <button
      type="button"
      disabled
      aria-label={`${destino.label} (em breve)`}
      className={cn(classe, "opacity-40 cursor-default")}
    >
      {conteudo}
    </button>
  ) : (
    <Link
      to={destino.to}
      className={classe}
      aria-label={destino.label}
      aria-current={ativo ? "page" : undefined}
    >
      {conteudo}
    </Link>
  );

  // Recolhida, a ilha esconde os rótulos: sem o tooltip, o menu vira seis
  // ícones sem nome.
  if (!collapsed) return elemento;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{elemento}</TooltipTrigger>
      <TooltipContent side="right" className="font-medium">
        {destino.placeholder ? `${destino.label} (em breve)` : destino.label}
      </TooltipContent>
    </Tooltip>
  );
}
