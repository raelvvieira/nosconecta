import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { X } from "lucide-react";

/** Ligação com botão de excluir no meio.
 *
 *  Existe porque apagar aresta no React Flow é por tecla (Backspace/Delete),
 *  e o app é usado no celular — onde não há tecla nenhuma. O botão também
 *  torna a ação descobrível no desktop, que era outra queixa: não dava pra
 *  ver que as linhas eram editáveis. */
export function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const onDelete = (data as { onDelete?: (id: string) => void } | undefined)?.onDelete;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{ stroke: "var(--pink)", strokeWidth: 1.5, strokeDasharray: "4 4" }}
      />
      <EdgeLabelRenderer>
        <button
          type="button"
          aria-label="Excluir ligação"
          onClick={() => onDelete?.(id)}
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
          }}
          className="nodrag nopan grid h-5 w-5 place-items-center rounded-full border border-border bg-white text-muted-foreground shadow-soft transition-colors hover:border-danger hover:text-danger"
        >
          <X className="h-3 w-3" />
        </button>
      </EdgeLabelRenderer>
    </>
  );
}
