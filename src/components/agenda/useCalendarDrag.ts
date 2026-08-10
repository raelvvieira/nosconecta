import { useCallback, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";
import { durationBetween, endTimeFrom, minutesToTime, timeToMinutes } from "@/lib/date";
import { HOUR_HEIGHT, HOURS, START_HOUR } from "./appointment-utils";

/** Antes disto o dedo ainda está clicando, não arrastando. Mesmo valor do
 *  arraste do pipeline — é o limiar em que o toque deixa de ser um toque. */
const LIMIAR = 10;
/** Granularidade do encaixe. 15 min = 16px nesta grade. */
const PASSO_MIN = 15;
const PX_POR_MIN = HOUR_HEIGHT / 60;
const FIM_DA_GRADE = (HOURS[HOURS.length - 1] + 1) * 60;

export interface AlvoArraste {
  /** "YYYY-MM-DD" da coluna sob o ponteiro. */
  date: string;
  startTime: string;
  endTime: string;
}

export interface ItemArrastavel {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
}

/**
 * Arrastar um bloco da agenda para outro horário ou outro dia.
 *
 * Sem projeção de inércia, ao contrário do arraste do pipeline: lá o alvo é
 * uma coluna inteira e jogar o card adiante ajuda; aqui o eixo vertical é
 * tempo, e a projeção do pipeline (~499px) equivaleria a mandar o atendimento
 * quase oito horas adiante depois que o dedo já parou. O bloco acompanha o
 * dedo 1:1 e encaixa de 15 em 15 minutos.
 *
 * O encaixe é aplicado à própria posição desenhada, não só ao resultado: o
 * bloco anda em degraus de 16px e para exatamente onde vai ficar, então o que
 * se vê durante o arraste é o resultado, não uma aproximação dele.
 */
export function useCalendarDrag({
  onDrop,
  ativo = true,
}: {
  onDrop: (item: ItemArrastavel, alvo: AlvoArraste) => void;
  /** Desligado nas visões sem eixo de tempo (mês, profissionais, salas). */
  ativo?: boolean;
}) {
  const [arrastando, setArrastando] = useState<ItemArrastavel | null>(null);
  const [alvo, setAlvo] = useState<AlvoArraste | null>(null);

  const ref = useRef<{
    item: ItemArrastavel;
    no: HTMLElement;
    x0: number;
    y0: number;
    /** Rolagem da grade no início: rolar durante o arraste não pode deslocar. */
    scroll0: number;
    scroller: HTMLElement | null;
    duracao: number;
    passou: boolean;
    alvo: AlvoArraste;
    quadro: number | null;
  } | null>(null);

  // Um clique que virou arraste não pode abrir a gaveta ao soltar. O clique
  // dispara depois do pointerup, então a marca precisa sobreviver a ele.
  const arrastou = useRef(false);

  const desenhar = useCallback(() => {
    const d = ref.current;
    if (!d) return;
    d.quadro = null;
    const dy = (timeToMinutes(d.alvo.startTime) - timeToMinutes(d.item.startTime)) * PX_POR_MIN;
    const dx = deslocamentoDaColuna(d.item.date, d.alvo.date);
    d.no.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
  }, []);

  const start = useCallback(
    (item: ItemArrastavel) => (e: React.PointerEvent<HTMLElement>) => {
      // Só botão principal / toque; e nada de arrastar com o botão do meio.
      if (!ativo || e.button !== 0) return;
      const no = e.currentTarget as HTMLElement;
      const scroller = no.closest<HTMLElement>("[data-agenda-scroll]");
      // Capturar já aqui, e não ao passar do limiar: num movimento rápido o
      // primeiro pointermove já acontece fora do card, e sem a captura ele é
      // entregue à div de baixo — o arraste morria antes de começar. Capturar
      // no toque não atrapalha o clique, que continua saindo normalmente.
      no.setPointerCapture(e.pointerId);
      ref.current = {
        item,
        no,
        x0: e.clientX,
        y0: e.clientY,
        scroll0: scroller?.scrollTop ?? 0,
        scroller,
        duracao: durationBetween(item.startTime, item.endTime),
        passou: false,
        alvo: { date: item.date, startTime: item.startTime, endTime: item.endTime },
        quadro: null,
      };
      arrastou.current = false;
    },
    [ativo],
  );

  const move = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const d = ref.current;
      if (!d) return;

      const dx = e.clientX - d.x0;
      const dy = e.clientY - d.y0 + ((d.scroller?.scrollTop ?? 0) - d.scroll0);

      if (!d.passou) {
        if (Math.hypot(dx, dy) < LIMIAR) return;
        d.passou = true;
        arrastou.current = true;
        d.no.style.transition = "none";
        d.no.style.zIndex = "30";
        d.no.style.boxShadow = "var(--shadow-4)";
        d.no.style.cursor = "grabbing";
        setArrastando(d.item);
        haptic("select");
      }
      // Só depois de virar arraste: até aqui a página ainda pode rolar.
      e.preventDefault();

      // O topo do bloco já é relativo à coluna (é o `top` absoluto do card),
      // então a conta do horário sai direta, sem medir retângulo nenhum.
      const topo = (timeToMinutes(d.item.startTime) - START_HOUR * 60) * PX_POR_MIN + dy;
      const bruto = topo / PX_POR_MIN + START_HOUR * 60;
      const encaixado = Math.round(bruto / PASSO_MIN) * PASSO_MIN;
      const inicio = Math.max(
        START_HOUR * 60,
        Math.min(encaixado, FIM_DA_GRADE - d.duracao),
      );

      const novo: AlvoArraste = {
        date: colunaEm(e.clientX, e.clientY) ?? d.alvo.date,
        startTime: minutesToTime(inicio),
        endTime: endTimeFrom(minutesToTime(inicio), d.duracao),
      };

      if (novo.date !== d.alvo.date || novo.startTime !== d.alvo.startTime) {
        d.alvo = novo;
        setAlvo(novo);
        haptic("select");
      }
      if (d.quadro === null) d.quadro = requestAnimationFrame(desenhar);
    },
    [desenhar],
  );

  const end = useCallback(() => {
    const d = ref.current;
    ref.current = null;
    if (!d) return;
    if (d.quadro !== null) cancelAnimationFrame(d.quadro);

    d.no.style.transform = "";
    d.no.style.transition = "";
    d.no.style.zIndex = "";
    d.no.style.boxShadow = "";
    d.no.style.cursor = "";
    setArrastando(null);
    setAlvo(null);
    if (!d.passou) return;

    const mudou = d.alvo.date !== d.item.date || d.alvo.startTime !== d.item.startTime;
    if (!mudou) return;
    haptic("commit");
    onDrop(d.item, d.alvo);
  }, [onDrop]);

  /** Chamar no onClick do bloco: devolve `true` quando o clique foi arraste. */
  const consumiuClique = useCallback(() => {
    if (!arrastou.current) return false;
    arrastou.current = false;
    return true;
  }, []);

  return {
    /** O item sendo arrastado agora, ou null. */
    arrastando,
    /** Horário/dia sob o dedo — para o bloco mostrar onde vai cair. */
    alvo,
    consumiuClique,
    handlers: { onPointerDown: start, onPointerMove: move, onPointerUp: end, onPointerCancel: end },
  };
}

/** Qual coluna de dia está sob o ponteiro. `null` fora de todas. */
function colunaEm(x: number, y: number): string | null {
  for (const el of document.querySelectorAll<HTMLElement>("[data-day]")) {
    const r = el.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el.dataset.day ?? null;
  }
  // Fora da faixa vertical das colunas (rolou demais), decide só pelo x — o
  // dia continua sendo o da coluna, mesmo com o dedo acima ou abaixo dela.
  for (const el of document.querySelectorAll<HTMLElement>("[data-day]")) {
    const r = el.getBoundingClientRect();
    if (x >= r.left && x <= r.right) return el.dataset.day ?? null;
  }
  return null;
}

/** Quanto o bloco precisa andar na horizontal para pousar na coluna alvo. */
function deslocamentoDaColuna(de: string, para: string): number {
  if (de === para) return 0;
  const a = document.querySelector<HTMLElement>(`[data-day="${de}"]`);
  const b = document.querySelector<HTMLElement>(`[data-day="${para}"]`);
  if (!a || !b) return 0;
  return b.getBoundingClientRect().left - a.getBoundingClientRect().left;
}
