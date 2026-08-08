import { useCallback, useRef, useState } from "react";

// Arrastar cards entre etapas sem dependência externa.
//
// Usa Pointer Events em vez do drag-and-drop nativo do HTML5 porque o nativo
// simplesmente não existe em toque — e o board precisa funcionar no celular.
// O arraste começa por uma alça própria (não pelo corpo do card), o que
// resolve de vez a ambiguidade entre "arrastar", "rolar a coluna" e "clicar
// para abrir o detalhe": cada gesto tem seu alvo.

export interface DragState {
  itemId: string;
  fromStageId: string;
  title: string;
  x: number;
  y: number;
}

export function useCardDrag(onDrop: (itemId: string, toStageId: string) => void) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [overStageId, setOverStageId] = useState<string | null>(null);

  // Retângulos das colunas, medidos uma vez no início do arraste: durante o
  // movimento não dá para chamar getBoundingClientRect a cada pixel, e
  // elementFromPoint pegaria o próprio fantasma que segue o cursor.
  const rects = useRef<{ stageId: string; rect: DOMRect }[]>([]);
  const columns = useRef(new Map<string, HTMLElement>());

  const registerColumn = useCallback((stageId: string, el: HTMLElement | null) => {
    if (el) columns.current.set(stageId, el);
    else columns.current.delete(stageId);
  }, []);

  const stageAt = (x: number, y: number) =>
    rects.current.find((c) => x >= c.rect.left && x <= c.rect.right && y >= c.rect.top && y <= c.rect.bottom)
      ?.stageId ?? null;

  const start = useCallback(
    (event: React.PointerEvent, item: { id: string; stageId: string; title: string }) => {
      event.preventDefault();
      event.stopPropagation();

      rects.current = [...columns.current.entries()].map(([stageId, el]) => ({
        stageId,
        rect: el.getBoundingClientRect(),
      }));

      const handle = event.currentTarget as HTMLElement;
      handle.setPointerCapture(event.pointerId);

      setDrag({
        itemId: item.id,
        fromStageId: item.stageId,
        title: item.title,
        x: event.clientX,
        y: event.clientY,
      });
      setOverStageId(item.stageId);
    },
    [],
  );

  const move = useCallback((event: React.PointerEvent) => {
    setDrag((current) => (current ? { ...current, x: event.clientX, y: event.clientY } : null));
    setOverStageId(stageAt(event.clientX, event.clientY));
  }, []);

  const end = useCallback(
    (event: React.PointerEvent) => {
      const handle = event.currentTarget as HTMLElement;
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);

      const target = stageAt(event.clientX, event.clientY);
      setDrag((current) => {
        if (current && target && target !== current.fromStageId) {
          onDrop(current.itemId, target);
        }
        return null;
      });
      setOverStageId(null);
    },
    [onDrop],
  );

  return { drag, overStageId, registerColumn, handlers: { start, move, end } };
}
