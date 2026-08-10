import { AlertTriangle, GripVertical, MessageCircle, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/finance/format";
import type { PipelineItem, PipelineStage } from "@/lib/atendimentos/pipeline.functions";
import type { Deal } from "@/lib/atendimentos/deals.functions";

export interface CardExtras {
  phone: string | null;
  unreadCount: number;
  /** Dias parado, vindo do assistente de vendas do CRM. */
  stuckDays: number | null;
}

interface Props {
  item: PipelineItem;
  stage: PipelineStage;
  stages: PipelineStage[];
  deal: Deal | null;
  extras: CardExtras;
  dragging: boolean;
  onOpen: () => void;
  onMove: (toStageId: string) => void;
  onDragStart: (event: React.PointerEvent) => void;
  onDragMove: (event: React.PointerEvent) => void;
  onDragEnd: (event: React.PointerEvent) => void;
}

export function PipelineCard({
  item,
  stage,
  stages,
  deal,
  extras,
  dragging,
  onOpen,
  onMove,
  onDragStart,
  onDragMove,
  onDragEnd,
}: Props) {
  const status = deal?.status ?? "negotiating";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "press cursor-pointer rounded-2xl border bg-white p-3 text-left hover:shadow-soft",
        status === "won" && "border-success/40 bg-success-soft/40",
        status === "lost" && "border-border opacity-60",
        status === "negotiating" && "border-border",
        dragging && "opacity-40",
      )}
    >
      <div className="flex items-start gap-1.5">
        {/* Alça própria: arrastar sai daqui, o resto do card continua
            clicável e a coluna continua rolando com o dedo. */}
        <button
          type="button"
          aria-label={`Arrastar ${item.title ?? "card"}`}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          // Área real em vez de `tap-44`: um alvo de 44px aqui invadiria o
          // título e o menu, e o dedo abriria a coisa errada. Quem não usa
          // ponteiro tem o caminho "Mover para" no menu.
          className="-ml-1 -my-1 grid h-8 w-7 shrink-0 place-items-center cursor-grab touch-none rounded-lg text-muted-foreground/50 hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <p className="min-w-0 flex-1 truncate text-sm font-medium">{item.title ?? "Sem nome"}</p>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="-my-1 -mr-1 h-9 w-9 shrink-0"
              onClick={(event) => event.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          {/* Caminho de teclado e de acessibilidade para mover — o arraste
              sozinho deixaria a ação inalcançável sem ponteiro. */}
          <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
            {stages
              .filter((s) => s.id !== stage.id)
              .map((s) => (
                <DropdownMenuItem key={s.id} onClick={() => onMove(s.id)}>
                  Mover para {s.name}
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {extras.phone && (
        <p className="mt-1 pl-5 text-2xs text-muted-foreground">{extras.phone}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-5">
        {deal?.value ? (
          <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-3xs font-semibold">
            {formatBRL(deal.value)}
          </span>
        ) : null}
        {status === "won" && (
          <span className="rounded-full bg-success-soft px-2 py-0.5 text-3xs font-semibold text-success">
            Ganho
          </span>
        )}
        {status === "lost" && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-3xs font-semibold text-muted-foreground">
            Perdido
          </span>
        )}
        {extras.unreadCount > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-coral-soft px-2 py-0.5 text-3xs font-semibold text-coral">
            <MessageCircle className="h-3 w-3" />
            {extras.unreadCount}
          </span>
        )}
        {/* Já vinha do assistente de vendas do CRM, mas só aparecia no
            dashboard — é no card que essa informação muda uma decisão. */}
        {extras.stuckDays !== null && status === "negotiating" && (
          <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-3xs font-semibold text-amber-700">
            <AlertTriangle className="h-3 w-3" />
            {extras.stuckDays}d parado
          </span>
        )}
      </div>
    </div>
  );
}
