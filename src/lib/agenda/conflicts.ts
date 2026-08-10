import { overlaps } from "@/lib/date";
import type { Appointment, BlockedTime } from "@/components/agenda/types";

export interface Sobreposicao {
  /** "Rael Vieira" ou o motivo do compromisso ("Almoço"). */
  rotulo: string;
  startTime: string;
  endTime: string;
  tipo: "consulta" | "compromisso";
}

interface Alvo {
  date: string;
  startTime: string;
  endTime: string;
  /** Não colidir consigo mesmo ao ser arrastado. */
  ignorarId?: string;
}

/**
 * O que já ocupa aquele horário.
 *
 * Roda no cliente, sobre a lista que a Agenda já carregou, e não no servidor:
 * o aviso aparece entre soltar o card e confirmar, e uma ida ao servidor no
 * meio disso deixaria o card parado esperando resposta. Toda faixa para onde
 * dá para arrastar está visível na tela, logo já está na memória.
 *
 * Consultas canceladas não contam — o horário está livre de fato.
 */
export function acharSobreposicoes(
  alvo: Alvo,
  appointments: Appointment[],
  blockedTimes: BlockedTime[] = [],
): Sobreposicao[] {
  const bate = (startTime: string, endTime: string) =>
    overlaps(alvo.startTime, alvo.endTime, startTime, endTime);

  const consultas: Sobreposicao[] = appointments
    .filter(
      (a) =>
        a.id !== alvo.ignorarId &&
        a.date === alvo.date &&
        a.status !== "cancelled" &&
        bate(a.startTime, a.endTime),
    )
    .map((a) => ({
      rotulo: a.patientName,
      startTime: a.startTime,
      endTime: a.endTime,
      tipo: "consulta" as const,
    }));

  // Compromissos entram na conta porque são justamente o que se bloqueia para
  // não ser agendado por cima — almoço, reunião, cirurgia externa.
  const compromissos: Sobreposicao[] = blockedTimes
    .filter((b) => b.id !== alvo.ignorarId && b.date === alvo.date && bate(b.startTime, b.endTime))
    .map((b) => ({
      rotulo: b.reason,
      startTime: b.startTime,
      endTime: b.endTime,
      tipo: "compromisso" as const,
    }));

  return [...consultas, ...compromissos].sort((a, b) => a.startTime.localeCompare(b.startTime));
}
