// O sinal do atendimento: o valor pago antes, para reservar o horário.
//
// Regras puras. O que não pode acontecer: o sinal ser contado duas vezes no
// financeiro (uma ao entrar, outra dentro do total do atendimento), um sinal
// maior que o total, ou centavo se perder na conta do saldo.

export interface SinalRegistrado {
  valor: number;
  /** AAAA-MM-DD */
  pagoEm: string;
}

const centavos = (v: number) => Math.round(v * 100);

/** Soma dos sinais, em reais, sem erro de ponto flutuante. */
export function somaDosSinais(sinais: Pick<SinalRegistrado, "valor">[]): number {
  return sinais.reduce((acc, s) => acc + centavos(s.valor), 0) / 100;
}

/** O que falta receber no dia: total menos os sinais já pagos. Nunca negativo. */
export function saldoAReceber(total: number, sinais: Pick<SinalRegistrado, "valor">[]): number {
  return Math.max(0, centavos(total) - centavos(somaDosSinais(sinais))) / 100;
}

/**
 * Pode registrar este sinal? Devolve a mensagem de recusa, ou null.
 *
 * `total` é o valor do atendimento — o cobrado, quando já foi confirmado, ou o
 * previsto. Sem total conhecido (zero), não dá para comparar e o sinal passa.
 */
export function recusaDoSinal(args: {
  valor: number;
  total: number;
  jaRegistrado: Pick<SinalRegistrado, "valor">[];
}): string | null {
  if (!Number.isFinite(args.valor) || !(args.valor > 0))
    return "Informe o valor do sinal (maior que zero).";
  if (args.total > 0) {
    const depois = centavos(somaDosSinais(args.jaRegistrado)) + centavos(args.valor);
    if (depois > centavos(args.total))
      return "O sinal não pode ser maior que o valor total do atendimento.";
  }
  return null;
}
