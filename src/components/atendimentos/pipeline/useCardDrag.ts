import { useCallback, useEffect, useRef, useState } from "react";

import { haptic } from "@/lib/haptics";

// Arrastar cards entre etapas sem dependência externa.
//
// Usa Pointer Events em vez do drag-and-drop nativo do HTML5 porque o nativo
// simplesmente não existe em toque — e o board precisa funcionar no celular.
// O arraste começa por uma alça própria (não pelo corpo do card), o que
// resolve de vez a ambiguidade entre "arrastar", "rolar a coluna" e "clicar
// para abrir o detalhe": cada gesto tem seu alvo.
//
// A posição do fantasma NÃO passa por estado do React. Cada pointermove
// guardaria a coordenada num setState, e a 120Hz isso é uma re-renderização da
// árvore inteira por quadro. Em vez disso a coordenada vive num ref, um único
// requestAnimationFrame por quadro escreve o `transform` direto no nó, e o
// React só re-renderiza quando muda a coluna sob o dedo — que acontece poucas
// vezes por arraste.

export interface DragState {
  itemId: string;
  fromStageId: string;
  title: string;
  /** Ponto onde o arraste começou; o fantasma se posiciona a partir daí. */
  x: number;
  y: number;
}

// Desaceleração do momentum. 0.998 por milissegundo é o valor que o iOS usa
// para rolagem — o mesmo que faz um flick rápido continuar depois que o dedo
// sai. O fator (d / (1 - d)) converte velocidade em distância percorrida até
// parar: com d = 0.998 dá 499, então 1000 px/s projetam ~499px adiante.
const DECELERATION = 0.998;
const PROJECTION = DECELERATION / (1 - DECELERATION);

// Resistência nas bordas do board. 0.55 é a constante do rubber-banding do
// UIScrollView: puxar além do limite anda, mas cada vez menos.
const RUBBER = 0.55;

// Quanto o dedo precisa andar antes de o arraste valer. Sem isso o card levanta
// no primeiro pixel, e um dedo trêmulo — ou um toque que só queria pegar na
// alça — já começa a arrastar. 10px é o mesmo valor que o iOS usa.
const THRESHOLD = 10;

/**
 * Amortece o quanto se pode passar de um limite. Quanto mais longe, mais duro
 * fica — nunca trava de vez, e nunca deixa ir embora reto.
 */
function rubberBand(overflow: number, dimension: number): number {
  if (overflow === 0 || dimension <= 0) return 0;
  const sign = Math.sign(overflow);
  const distance = Math.abs(overflow);
  return (sign * (1 - 1 / ((distance * RUBBER) / dimension + 1)) * dimension) / 2;
}

export function useCardDrag(onDrop: (itemId: string, toStageId: string) => void) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [overStageId, setOverStageId] = useState<string | null>(null);

  // Retângulos das colunas, medidos uma vez no início do arraste: durante o
  // movimento não dá para chamar getBoundingClientRect a cada pixel, e
  // elementFromPoint pegaria o próprio fantasma que segue o cursor.
  const rects = useRef<{ stageId: string; rect: DOMRect }[]>([]);
  const columns = useRef(new Map<string, HTMLElement>());
  const bounds = useRef<{ left: number; right: number; top: number; bottom: number } | null>(null);

  // O nó do fantasma. O hook escreve `transform` nele diretamente.
  const ghostRef = useRef<HTMLDivElement | null>(null);

  // Ponto cru do ponteiro, o ponto já amortecido, e a amostragem de velocidade.
  const point = useRef({ x: 0, y: 0 });
  const eased = useRef({ x: 0, y: 0 });
  const velocity = useRef({ x: 0, y: 0 });
  const lastSample = useRef({ x: 0, y: 0, t: 0 });
  const frame = useRef<number | null>(null);
  const overRef = useRef<string | null>(null);

  // O gesto entre o pointerdown e o 10º pixel: já estamos ouvindo, mas ainda
  // não é um arraste. `armed` é o que separa "encostou na alça" de "arrastou".
  const origin = useRef({ x: 0, y: 0 });
  const armed = useRef(false);
  const pending = useRef<{ id: string; stageId: string; title: string } | null>(null);

  const registerColumn = useCallback((stageId: string, el: HTMLElement | null) => {
    if (el) columns.current.set(stageId, el);
    else columns.current.delete(stageId);
  }, []);

  const stageAt = (x: number, y: number) =>
    rects.current.find((c) => x >= c.rect.left && x <= c.rect.right && y >= c.rect.top && y <= c.rect.bottom)
      ?.stageId ?? null;

  /** Aplica o rubber-banding horizontal contra as bordas do board. */
  const easeIntoBounds = (x: number) => {
    const b = bounds.current;
    if (!b) return x;
    const width = b.right - b.left;
    if (x < b.left) return b.left + rubberBand(x - b.left, width);
    if (x > b.right) return b.right + rubberBand(x - b.right, width);
    return x;
  };

  // Um quadro: escreve a posição no nó e, só se a coluna mudou, avisa o React.
  const paint = useCallback(() => {
    frame.current = null;
    const node = ghostRef.current;
    if (!node) return;

    eased.current = { x: easeIntoBounds(point.current.x), y: point.current.y };
    node.style.transform = `translate3d(${eased.current.x + 12}px, ${eased.current.y + 12}px, 0)`;

    const stage = stageAt(eased.current.x, eased.current.y);
    if (stage !== overRef.current) {
      overRef.current = stage;
      setOverStageId(stage);
      // Passar por um alvo válido é exatamente o momento de um toque curto:
      // confirma o alvo sem precisar olhar para a cor da coluna.
      if (stage) haptic("select");
    }
  }, []);

  const schedule = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(paint);
  }, [paint]);

  const start = useCallback(
    (event: React.PointerEvent, item: { id: string; stageId: string; title: string }) => {
      event.preventDefault();
      event.stopPropagation();

      rects.current = [...columns.current.entries()].map(([stageId, el]) => ({
        stageId,
        rect: el.getBoundingClientRect(),
      }));

      // Limites do board = união das colunas. É contra isso que o arraste
      // resiste quando passa da primeira ou da última.
      bounds.current = rects.current.length
        ? {
            left: Math.min(...rects.current.map((c) => c.rect.left)),
            right: Math.max(...rects.current.map((c) => c.rect.right)),
            top: Math.min(...rects.current.map((c) => c.rect.top)),
            bottom: Math.max(...rects.current.map((c) => c.rect.bottom)),
          }
        : null;

      const handle = event.currentTarget as HTMLElement;
      handle.setPointerCapture(event.pointerId);

      point.current = { x: event.clientX, y: event.clientY };
      eased.current = { ...point.current };
      velocity.current = { x: 0, y: 0 };
      lastSample.current = { x: event.clientX, y: event.clientY, t: event.timeStamp };

      // Ainda não é arraste: nada de estado, nada de fantasma. Só quando o dedo
      // passar do limiar é que o card levanta.
      origin.current = { x: event.clientX, y: event.clientY };
      armed.current = false;
      pending.current = { id: item.id, stageId: item.stageId, title: item.title };
    },
    [],
  );

  const move = useCallback(
    (event: React.PointerEvent) => {
      const item = pending.current;
      if (!item) return;

      point.current = { x: event.clientX, y: event.clientY };

      // Velocidade em px/s, suavizada: uma média exponencial evita que um único
      // evento errático (o dedo tremendo no fim do gesto) defina a projeção.
      // Amostrada desde o pointerdown, mesmo antes de armar: quem já vem
      // rápido do primeiro pixel não deve perder essa velocidade no caminho.
      const dt = event.timeStamp - lastSample.current.t;
      if (dt > 0) {
        const vx = ((event.clientX - lastSample.current.x) / dt) * 1000;
        const vy = ((event.clientY - lastSample.current.y) / dt) * 1000;
        velocity.current = {
          x: velocity.current.x * 0.7 + vx * 0.3,
          y: velocity.current.y * 0.7 + vy * 0.3,
        };
        lastSample.current = { x: event.clientX, y: event.clientY, t: event.timeStamp };
      }

      if (!armed.current) {
        const dx = event.clientX - origin.current.x;
        const dy = event.clientY - origin.current.y;
        if (Math.hypot(dx, dy) < THRESHOLD) return;

        // Passou do limiar: agora é arraste. O fantasma nasce sob o dedo, na
        // posição atual — não na de origem, senão ele apareceria 10px atrás.
        armed.current = true;
        eased.current = { x: event.clientX, y: event.clientY };
        overRef.current = item.stageId;
        setDrag({
          itemId: item.id,
          fromStageId: item.stageId,
          title: item.title,
          x: event.clientX,
          y: event.clientY,
        });
        setOverStageId(item.stageId);
      }

      schedule();
    },
    [schedule],
  );

  const end = useCallback(
    (event: React.PointerEvent) => {
      const handle = event.currentTarget as HTMLElement;
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);

      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }

      // Nunca passou do limiar: foi um toque na alça, não um arraste. Sai sem
      // mover nada e sem vibrar — mover um card por causa de um toque é
      // exatamente o erro que o limiar existe para evitar.
      if (!armed.current) {
        pending.current = null;
        bounds.current = null;
        return;
      }

      // Onde o dedo *ia* parar, não onde soltou. É isto que faz um flick rápido
      // atravessar para a coluna seguinte em vez de cair na de baixo do dedo.
      const projectedX = eased.current.x + (velocity.current.x / 1000) * PROJECTION;
      const projectedY = eased.current.y + (velocity.current.y / 1000) * PROJECTION;

      // Preso dentro do board: uma projeção longa demais cairia fora de todas as
      // colunas e o card não iria a lugar nenhum — que é pior do que ir para a
      // última coluna, o resultado que a pessoa esperava.
      const b = bounds.current;
      const x = b ? Math.min(Math.max(projectedX, b.left + 1), b.right - 1) : projectedX;
      const y = b ? Math.min(Math.max(projectedY, b.top + 1), b.bottom - 1) : projectedY;

      const target = stageAt(x, y) ?? stageAt(eased.current.x, eased.current.y);

      setDrag((current) => {
        if (current && target && target !== current.fromStageId) {
          haptic("commit");
          onDrop(current.itemId, target);
        }
        return null;
      });
      setOverStageId(null);
      overRef.current = null;
      bounds.current = null;
      armed.current = false;
      pending.current = null;
    },
    [onDrop],
  );

  // Um arraste interrompido por desmontagem não pode deixar rAF pendurado.
  useEffect(() => {
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  return { drag, overStageId, registerColumn, ghostRef, handlers: { start, move, end } };
}
