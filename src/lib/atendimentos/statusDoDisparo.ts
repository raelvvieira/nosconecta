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
  | "agendado"
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

export function progressoDoDisparo(
  d: BroadcastResumo,
  /** Injetável para o teste não depender do relógio da máquina. */
  agora: number = Date.now(),
): ProgressoDoDisparo {
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
  // ── Programada ─────────────────────────────────────────────────────────
  //
  // Uma campanha agendada é uma campanha NORMAL com os horários no futuro: o
  // status no banco continua `running`, porque o tick descarta qualquer alvo
  // cujo lote não esteja assim. Então quem separa as duas é esta conta, e não
  // uma coluna.
  //
  // Sem ela, uma campanha marcada para dia 20 apareceria como "Na fila" por
  // oito dias, idêntica a uma que começa no próximo minuto.
  const comeca = d.proximoEnvioEm ? new Date(d.proximoEnvioEm) : null;
  const noFuturo = comeca && Number.isFinite(comeca.getTime()) && comeca.getTime() > agora;
  if (tratados === 0 && noFuturo) {
    return {
      estado: "agendado",
      rotulo: `Agendada para ${quandoPorExtenso(comeca!, new Date(agora))}`,
      progresso,
      tratados,
      emAndamento: false,
    };
  }
  // `running` com nada tratado ainda: a fila existe, mas a primeira mensagem
  // não saiu. Dizer "Enviando" aqui seria promessa adiantada.
  if (tratados === 0) {
    return { estado: "na_fila", rotulo: "Na fila", progresso, tratados, emAndamento: true };
  }
  // Dividida em dias: o número sozinho faria parecer que travou em 200 de 500.
  if (d.diasRestantes > 1) {
    return {
      estado: "enviando",
      rotulo: `Enviando · continua ${quandoPorExtenso(comeca!, new Date(agora))}`,
      progresso,
      tratados,
      emAndamento: true,
    };
  }
  return { estado: "enviando", rotulo: "Enviando", progresso, tratados, emAndamento: true };
}

/** "hoje às 14:30", "amanhã às 09:00", "20/10 às 09:00". */
/**
 * "hoje às 14:00", "amanhã às 09:00", "20/10 às 12:00".
 *
 * `agora` é parâmetro e precisa ser PASSADO por quem já tem um. Quem chamar
 * sem ele cai no relógio de verdade, e aí a função deixa de ser pura: o mesmo
 * disparo passa a ler "hoje" antes da meia-noite e "12/10" depois, sem nada
 * ter mudado no banco. Foi assim que o teste desta função, escrito no dia 12,
 * passou naquele dia e falhou no 13.
 */
export function quandoPorExtenso(quando: Date, agora: Date = new Date()): string {
  const dia = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  const hora = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(quando);

  const hoje = dia(agora);
  const amanha = dia(new Date(agora.getTime() + 86_400_000));
  const alvo = dia(quando);
  if (alvo === hoje) return `hoje às ${hora}`;
  if (alvo === amanha) return `amanhã às ${hora}`;
  const [, mm, dd] = alvo.split("-");
  return `${dd}/${mm} às ${hora}`;
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
