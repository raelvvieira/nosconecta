// Como foi pago, traduzido para as colunas do financeiro.
//
// ── Gêmeo deliberado ───────────────────────────────────────────────────────
//
// Este arquivo é o par de `src/lib/agenda/forma-de-pagamento.ts`. Existem os
// dois porque as Edge Functions rodam em Deno e não conseguem importar de
// `src/`; é o mesmo arranjo de `cota.ts` ↔ `daily-quota.ts` e das duas cópias
// de `plano-de-dias.ts`.
//
// **Mexeu aqui, mexa lá.** O que não pode divergir é `NO_BANCO`: são os
// valores que a tela de Recebimentos usa para filtrar por forma de pagamento.
// Se as duas pontas discordarem, a despesa lançada pelo grupo some do filtro —
// e some em silêncio, que é o pior jeito de sumir.
//
// Só o necessário para o robô do financeiro está aqui. O gêmeo de `src/` tem
// mais coisa (a lista para a tela, a recusa com mensagem por campo), que não
// faz sentido num lugar sem tela.

export type FormaDePagamento = "pix" | "dinheiro" | "cartao" | "cartao_parcelado";

/** Espelho exato do `NO_BANCO` do gêmeo. Ver o cabeçalho. */
const NO_BANCO: Record<FormaDePagamento, string> = {
  pix: "pix",
  dinheiro: "cash",
  cartao: "credit",
  cartao_parcelado: "credit",
};

export const MAX_PARCELAS = 12;
export const MIN_PARCELAS = 2;

export function ehForma(v: unknown): v is FormaDePagamento {
  return typeof v === "string" && v in NO_BANCO;
}

export function pedeParcelas(forma: unknown): boolean {
  return forma === "cartao_parcelado";
}

export interface PagamentoGravavel {
  payment_method: string | null;
  installment_total: number | null;
}

/**
 * A forma, nas colunas do banco.
 *
 * "Parcelado" não é forma diferente de "cartão": é cartão com
 * `installment_total` maior que 1. À vista grava `1`, e não nulo — é a
 * diferença entre "foi uma vez" e "não foi cartão", e a taxa de uma venda à
 * vista existe e é diferente de zero.
 */
export function comoGravar(forma: unknown, parcelas: unknown): PagamentoGravavel {
  if (!ehForma(forma)) return { payment_method: null, installment_total: null };
  const metodo = NO_BANCO[forma];
  if (forma === "cartao") return { payment_method: metodo, installment_total: 1 };
  if (forma === "cartao_parcelado") {
    const n = typeof parcelas === "string" ? Number(parcelas) : parcelas;
    const valido =
      typeof n === "number" && Number.isInteger(n) && n >= MIN_PARCELAS && n <= MAX_PARCELAS;
    return { payment_method: metodo, installment_total: valido ? n : null };
  }
  return { payment_method: metodo, installment_total: null };
}

/** "Cartão em 4x", "Pix". Para o recado no grupo. */
export function rotuloDoPagamento(forma: unknown, parcelas: unknown): string {
  if (!ehForma(forma)) return "";
  if (forma === "cartao_parcelado") {
    const n = typeof parcelas === "string" ? Number(parcelas) : parcelas;
    return typeof n === "number" && Number.isFinite(n) ? `Cartão em ${n}x` : "Cartão parcelado";
  }
  return { pix: "Pix", dinheiro: "Dinheiro", cartao: "Cartão à vista" }[forma];
}
