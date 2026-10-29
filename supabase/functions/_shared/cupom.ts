// deno-lint-ignore-file no-explicit-any
// O cupom de desconto: puro, sem banco e sem `Deno`, porque o site (prévia na
// tela de Plano) e a Edge Function (`asaas-checkout`, que decide de verdade)
// usam a mesma regra.
// ── Cupom ────────────────────────────────────────────────────────────────
//
// O Checkout do Asaas não tem cupom: o desconto é aplicado aqui, antes de
// abrir o checkout, e o Asaas recebe o valor já com desconto.

/** O Asaas não aceita cobrança abaixo de R$ 5,00. */
export const VALOR_MINIMO_CENTAVOS = 500;

export interface Cupom {
  codigo: string;
  tipo: "percentual" | "valor";
  /** Percentual: 1 a 99. Valor: centavos. */
  valor: number;
  aplicaEm: "assinatura" | "pacote" | "tudo";
  soPrimeira: boolean;
  validoAte: string | null;
  maxUsos: number | null;
  usos: number;
  ativo: boolean;
}

/** "  promo10 " → "PROMO10". */
export function codigoDoCupom(texto: unknown): string {
  return String(texto ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export type AvaliacaoDoCupom =
  | { ok: true; valorFinalCentavos: number; descontoCentavos: number; soPrimeira: boolean }
  | { ok: false; motivo: string };

/**
 * O cupom vale para esta compra? E quanto fica?
 *
 * As recusas são frases para a tela: quem digitou precisa saber por que não
 * entrou. Desconto que levaria abaixo do mínimo do Asaas trava no mínimo em
 * vez de recusar: o cupom vale, só não zera.
 */
export function avaliarCupom(
  c: Cupom | null,
  uso: "assinatura" | "pacote",
  valorCentavos: number,
  agora: Date,
): AvaliacaoDoCupom {
  if (!c || !c.ativo) return { ok: false, motivo: "Cupom não encontrado." };
  if (c.validoAte && new Date(c.validoAte).getTime() < agora.getTime()) {
    return { ok: false, motivo: "Este cupom venceu." };
  }
  if (c.maxUsos !== null && c.usos >= c.maxUsos) {
    return { ok: false, motivo: "Este cupom já foi usado o máximo de vezes." };
  }
  if (c.aplicaEm !== "tudo" && c.aplicaEm !== uso) {
    return {
      ok: false,
      motivo:
        c.aplicaEm === "assinatura"
          ? "Este cupom vale só para a assinatura."
          : "Este cupom vale só para o pacote de conversas.",
    };
  }
  const desconto =
    c.tipo === "percentual"
      ? Math.round((valorCentavos * Math.min(99, Math.max(0, c.valor))) / 100)
      : Math.max(0, c.valor);
  const final = Math.max(VALOR_MINIMO_CENTAVOS, valorCentavos - desconto);
  return {
    ok: true,
    valorFinalCentavos: final,
    descontoCentavos: valorCentavos - final,
    soPrimeira: uso === "assinatura" && c.soPrimeira,
  };
}

/** Linha de `plataforma_cupons` para a forma que a regra usa. */
export function cupomDaLinha(l: any): Cupom | null {
  if (!l) return null;
  return {
    codigo: String(l.codigo),
    tipo: l.tipo === "valor" ? "valor" : "percentual",
    valor: Number(l.valor),
    aplicaEm: l.aplica_em === "assinatura" || l.aplica_em === "pacote" ? l.aplica_em : "tudo",
    soPrimeira: !!l.so_primeira,
    validoAte: l.valido_ate ?? null,
    maxUsos: l.max_usos === null || l.max_usos === undefined ? null : Number(l.max_usos),
    usos: Number(l.usos ?? 0),
    ativo: l.ativo !== false,
  };
}
