// Pagamento em duas formas: uma parte no Pix, outra no cartão, por exemplo.
//
// Regras puras. O que não pode acontecer: as duas partes somarem diferente do
// que há a receber, uma parte de valor zero virar um recebimento vazio, ou
// centavo se perder na divisão.

export interface SegundoPagamento {
  valor: number;
  forma: string | null;
  parcelas: number | null;
}

const centavos = (v: number) => Math.round(v * 100);

/**
 * A segunda parte vale? Devolve a mensagem de recusa, ou null.
 * Precisa ser maior que zero e MENOR que o que há a receber — igual ou maior
 * não é "dividir", é pagar tudo de um jeito só.
 */
export function recusaDoSegundoPagamento(
  aReceber: number,
  segundo: Pick<SegundoPagamento, "valor"> | null | undefined,
): string | null {
  if (!segundo) return null;
  if (!Number.isFinite(segundo.valor) || !(segundo.valor > 0))
    return "Informe o valor da segunda forma de pagamento.";
  if (centavos(segundo.valor) >= centavos(aReceber))
    return "A segunda forma precisa ser menor que o valor a receber.";
  return null;
}

/**
 * Quanto cabe a cada forma. Sem segunda parte válida, tudo fica na primeira.
 * A soma das duas é sempre exatamente `aReceber`.
 */
export function dividirPagamento(
  aReceber: number,
  segundo: Pick<SegundoPagamento, "valor"> | null | undefined,
): { primeira: number; segunda: number } {
  if (!segundo || recusaDoSegundoPagamento(aReceber, segundo))
    return { primeira: Math.max(0, centavos(aReceber)) / 100, segunda: 0 };
  const s = centavos(segundo.valor);
  return { primeira: (centavos(aReceber) - s) / 100, segunda: s / 100 };
}

/** A chave do segundo recebimento no financeiro (`source_type`). */
export const ORIGEM_DA_SEGUNDA_PARTE = "agendamento_parte2";
