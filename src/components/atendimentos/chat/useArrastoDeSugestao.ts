import { useCallback, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";

// Arrastar uma sugestão do painel para a conversa.
//
// ── Por que não é o `useCardDrag` do funil ─────────────────────────────
//
// Ele tem 411 linhas e é construído para VÁRIOS alvos enfileirados: um Map de
// colunas medidas no início do gesto, projeção de momentum entre elas,
// rubber-banding contra as bordas do quadro e uma mola em forma fechada para o
// voo até a coluna de destino.
//
// A sugestão tem UM alvo. Não há coluna vizinha para onde projetar, não há
// borda contra o que emborrachar, e ninguém dá flick numa frase. Reaproveitá-lo
// significaria chamar `registerColumn("conversa", el)` com uma coluna falsa e
// um `stageId` falso — o tipo de coisa que seis meses depois se lê como bug.
//
// O que se reaproveita é o MÉTODO, que já provou ser o certo neste projeto:
// Pointer Events (toque não tem arraste nativo), limiar antes de armar, o
// fantasma fora do estado do React, e respeitar quem pediu menos movimento.
//
// ── O que soltar faz, e o que NÃO faz ──────────────────────────────────
//
// Soltar na conversa COLOCA o texto no composer. Não envia.
//
// Isso não é timidez: mandar uma frase escrita por modelo no WhatsApp de um
// paciente, por gesto, sem ninguém ler, é um erro que não se desfaz. O ganho
// do arraste é espacial — a frase viaja visivelmente do painel para a conversa
// — e o envio continua atrás do botão Enviar, onde sempre esteve.

/** Distância antes de o gesto virar arraste. Abaixo disso é clique — é o que
 *  impede que tocar em "Usar esta" arraste o card junto. */
const LIMIAR = 10;

function prefereMenosMovimento(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

export function useArrastoDeSugestao(aoSoltar: (texto: string) => void) {
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobreAConversa, setSobreAConversa] = useState(false);

  /** O nó do fantasma. A posição é escrita DIRETO nele, sem passar por estado:
   *  a 120 Hz, re-renderizar o painel inteiro por quadro travaria a rolagem. */
  const fantasmaRef = useRef<HTMLDivElement | null>(null);
  const alvoRef = useRef<HTMLElement | null>(null);
  const quadroRef = useRef<number | null>(null);
  const posRef = useRef({ x: 0, y: 0 });
  const dentroRef = useRef(false);

  const registrarAlvo = useCallback((el: HTMLElement | null) => {
    alvoRef.current = el;
  }, []);

  const desenhar = useCallback(() => {
    quadroRef.current = null;
    const el = fantasmaRef.current;
    if (!el) return;
    const { x, y } = posRef.current;
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }, []);

  const start = useCallback(
    (e: React.PointerEvent, texto: string) => {
      // Só o botão principal. Botão do meio e direito têm outro significado, e
      // arrastar com eles surpreende.
      if (e.button !== 0) return;

      const origemX = e.clientX;
      const origemY = e.clientY;
      let armado = false;

      const alvoDoPonteiro = e.currentTarget as HTMLElement;
      // Sem captura, arrastar para fora do painel rolável perde os eventos no
      // meio do gesto e o fantasma fica preso na tela.
      alvoDoPonteiro.setPointerCapture?.(e.pointerId);

      const mover = (ev: PointerEvent) => {
        const dx = ev.clientX - origemX;
        const dy = ev.clientY - origemY;

        if (!armado) {
          if (Math.hypot(dx, dy) < LIMIAR) return;
          armado = true;
          setArrastando(texto);
          haptic("select");
        }

        posRef.current = { x: ev.clientX - 140, y: ev.clientY - 24 };
        if (quadroRef.current === null) {
          quadroRef.current = requestAnimationFrame(desenhar);
        }

        const alvo = alvoRef.current;
        const dentro = !!alvo && pontoDentro(alvo, ev.clientX, ev.clientY);
        if (dentro !== dentroRef.current) {
          dentroRef.current = dentro;
          setSobreAConversa(dentro);
          if (dentro) haptic("select");
        }
      };

      const soltar = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", mover);
        window.removeEventListener("pointerup", soltar);
        window.removeEventListener("pointercancel", soltar);
        alvoDoPonteiro.releasePointerCapture?.(ev.pointerId);

        if (quadroRef.current !== null) {
          cancelAnimationFrame(quadroRef.current);
          quadroRef.current = null;
        }

        const acertou = armado && dentroRef.current;
        setArrastando(null);
        setSobreAConversa(false);
        dentroRef.current = false;

        if (acertou) {
          haptic("commit");
          aoSoltar(texto);
        }
      };

      window.addEventListener("pointermove", mover);
      window.addEventListener("pointerup", soltar);
      window.addEventListener("pointercancel", soltar);
    },
    [aoSoltar, desenhar],
  );

  return {
    arrastando,
    sobreAConversa,
    fantasmaRef,
    registrarAlvo,
    start,
    // Quem pediu menos movimento vê o card entrar no composer sem o fantasma
    // voando pela tela.
    semAnimacao: prefereMenosMovimento(),
  };
}

function pontoDentro(el: HTMLElement, x: number, y: number): boolean {
  const r = el.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}
