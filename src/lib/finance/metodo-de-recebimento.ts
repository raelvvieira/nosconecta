// "Como foi pago", em texto, para as telas que listam recebimentos.
//
// O financeiro guarda o método em `payment_method` ("pix", "credit"…) e as
// parcelas em `installment_total`. Cada tela montava (ou esquecia de montar) o
// seu rótulo; este é o único.

const ROTULOS: Record<string, string> = {
  pix: "Pix",
  cash: "Dinheiro",
  debit: "Cartão de débito",
  boleto: "Boleto",
  transfer: "Transferência",
};

/** `null` quando o recebimento não tem forma gravada (lançamentos antigos). */
export function metodoDeRecebimento(metodo: unknown, parcelas?: unknown): string | null {
  const m = String(metodo ?? "")
    .trim()
    .toLowerCase();
  if (!m) return null;
  if (m === "credit") {
    const n = Number(parcelas);
    return Number.isFinite(n) && n > 1 ? `Cartão de crédito em ${n}x` : "Cartão de crédito";
  }
  return ROTULOS[m] ?? null;
}
