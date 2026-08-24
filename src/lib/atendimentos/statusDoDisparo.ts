import type { BroadcastResumo } from "./broadcast.functions";

/**
 * Em que pé está um disparo.
 *
 * Sai das contagens que `listarDisparos` já devolve — nenhuma coluna nova. A
 * tabela guarda só `running | done | cancelled`, que é o suficiente para o
 * motor mas não para quem olha a tela: "em andamento" com 0 de 200 enviados e
 * "em andamento" com 199 de 200 são situações diferentes, e a diferença é o
 * que decide se você espera ou se vai fazer outra coisa.
 */
export type EstadoDoDisparo =
  | "na_fila"
  | "enviando"
  | "concluido"
  | "concluido_com_falhas"
  | "cancelado";

export interface ProgressoDoDisparo {
  estado: EstadoDoDisparo;
  rotulo: string;
  /** 0 a 1 — o que já saiu, contando falhas: elas não vão sair de novo. */
  progresso: number;
  /** Quantos já tiveram desfecho. */
  tratados: number;
  /** `true` enquanto vale a pena consultar de novo. */
  emAndamento: boolean;
}

export function progressoDoDisparo(d: BroadcastResumo): ProgressoDoDisparo {
  // Falha conta como tratada: aquela pessoa não recebe mais, e deixá-la fora da
  // conta faria a barra travar em 99% para sempre num disparo que já acabou.
  const tratados = d.enviados + d.falhas;
  const progresso = d.total > 0 ? Math.min(1, tratados / d.total) : 0;

  if (d.status === "cancelled") {
    return { estado: "cancelado", rotulo: "Cancelado", progresso, tratados, emAndamento: false };
  }
  if (d.status === "done") {
    return d.falhas > 0
      ? {
          estado: "concluido_com_falhas",
          rotulo: `Concluído · ${d.falhas} ${d.falhas === 1 ? "falha" : "falhas"}`,
          progresso,
          tratados,
          emAndamento: false,
        }
      : { estado: "concluido", rotulo: "Concluído", progresso, tratados, emAndamento: false };
  }
  // `running` com nada tratado ainda: a fila existe, mas a primeira mensagem
  // não saiu. Dizer "Enviando" aqui seria promessa adiantada.
  if (tratados === 0) {
    return { estado: "na_fila", rotulo: "Na fila", progresso, tratados, emAndamento: true };
  }
  return { estado: "enviando", rotulo: "Enviando", progresso, tratados, emAndamento: true };
}

/** Vale continuar consultando? Polling eterno queima requisição com ninguém
 *  olhando; parar cedo demais congela o número na tela. */
export function algumEmAndamento(lista: BroadcastResumo[]): boolean {
  return lista.some((d) => progressoDoDisparo(d).emAndamento);
}

/** Quando a fila deve terminar, pelo ritmo gravado. `null` quando não dá para
 *  dizer — melhor não mostrar hora nenhuma do que mostrar uma inventada. */
export function terminaPorVoltaDe(d: BroadcastResumo): Date | null {
  if (!d.terminaEm) return null;
  const t = new Date(d.terminaEm);
  return Number.isFinite(t.getTime()) ? t : null;
}
