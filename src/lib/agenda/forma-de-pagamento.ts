// Como o atendimento foi pago.
//
// ── Por que isto importa mais do que parece ────────────────────────────────
//
// Em setembro a clínica recebeu R$ 30.609 na Stone e o sistema registrou
// R$ 12.663. A maior fatia da diferença, R$ 11.013, era cartão: a agenda
// gravava o valor cobrado e não gravava COMO foi cobrado, então não havia como
// cruzar o atendimento com o crédito que caiu na conta dias depois.
//
// Registrar a forma na hora de concluir é o que torna esse cruzamento
// possível. E é também o que permite, mais adiante, calcular quanto a
// maquininha ficou: a taxa muda com a forma e com o número de parcelas, e sem
// esses dois campos nenhuma taxa pode ser calculada depois.
//
// ── Bruto e líquido são coisas diferentes ──────────────────────────────────
//
// Uma venda de R$ 399 em 4x com antecipação pode cair como R$ 380. A receita
// continua sendo R$ 399 — é o que a paciente pagou, e é sobre isso que incide
// imposto — e os R$ 19 são uma DESPESA financeira. Guardar R$ 380 como receita
// misturaria as duas coisas e faria o faturamento parecer menor do que foi.
//
// Por isso aqui só se registra a forma. O cálculo da taxa depende de um
// cadastro que ainda não existe, e quando existir vai gerar a despesa separada
// sem precisar mexer no que foi gravado.
//
// ── Por que módulo puro ────────────────────────────────────────────────────
//
// Mesma razão de `valor-ao-concluir.ts`, ao lado: a regra precisa valer na
// tela (para o botão acender) e no servidor (que é quem garante). Escrita duas
// vezes, as duas pontas divergem — a tela aceita, o servidor recusa, e a
// pessoa vê um erro depois de um botão que estava aceso.

export type FormaDePagamento = "pix" | "dinheiro" | "cartao" | "cartao_parcelado";

/**
 * O que vai para `financial_transactions.payment_method`.
 *
 * São os MESMOS valores que o formulário de recebimento já usa (`pix`,
 * `credit`, `cash`). Inventar um vocabulário próprio aqui quebraria o filtro
 * por forma de pagamento da tela de Recebimentos, que compara com esses.
 */
const NO_BANCO: Record<FormaDePagamento, string> = {
  pix: "pix",
  dinheiro: "cash",
  cartao: "credit",
  cartao_parcelado: "credit",
};

export const FORMAS: { valor: FormaDePagamento; rotulo: string; pedeParcelas: boolean }[] = [
  { valor: "pix", rotulo: "Pix", pedeParcelas: false },
  { valor: "dinheiro", rotulo: "Dinheiro", pedeParcelas: false },
  { valor: "cartao", rotulo: "Cartão à vista", pedeParcelas: false },
  { valor: "cartao_parcelado", rotulo: "Cartão parcelado", pedeParcelas: true },
];

/** O teto da maquininha, não o da clínica. Quantas parcelas a clínica OFERECE
 *  é outra decisão, que mora no cadastro do agente. */
export const MAX_PARCELAS = 12;
export const MIN_PARCELAS = 2;

export function ehForma(v: unknown): v is FormaDePagamento {
  return typeof v === "string" && v in NO_BANCO;
}

export function pedeParcelas(forma: unknown): boolean {
  return forma === "cartao_parcelado";
}

export interface RecusaDoPagamento {
  campo: "forma" | "parcelas";
  mensagem: string;
}

/**
 * O que impede de concluir, ou `null` quando está tudo certo.
 *
 * A forma é OPCIONAL: um atendimento de cortesia não teve pagamento, e um
 * atendimento antigo sendo regularizado pode não ter mais essa informação.
 * Obrigá-la faria quem não sabe escolher qualquer uma, e um dado inventado é
 * pior que um dado ausente — ele não se distingue do verdadeiro depois.
 *
 * O que não se aceita é "parcelado" sem dizer em quantas vezes: aí a forma
 * afirma algo que o número de parcelas contradiz.
 */
export function recusaDoPagamento(forma: unknown, parcelas: unknown): RecusaDoPagamento | null {
  if (forma === null || forma === undefined || forma === "") return null;
  if (!ehForma(forma)) {
    return { campo: "forma", mensagem: "Forma de pagamento desconhecida." };
  }
  if (!pedeParcelas(forma)) return null;

  const n = typeof parcelas === "string" ? Number(parcelas) : parcelas;
  if (typeof n !== "number" || !Number.isFinite(n) || !Number.isInteger(n)) {
    return { campo: "parcelas", mensagem: "Informe em quantas vezes foi parcelado." };
  }
  // Uma parcela não é parcelamento: é à vista, e tem outra taxa. Mandar de
  // volta para a forma certa evita uma taxa errada calculada depois.
  if (n < MIN_PARCELAS) {
    return {
      campo: "parcelas",
      mensagem: `Parcelado começa em ${MIN_PARCELAS}x. Para uma vez só, escolha "Cartão à vista".`,
    };
  }
  if (n > MAX_PARCELAS) {
    return { campo: "parcelas", mensagem: `O máximo é ${MAX_PARCELAS}x.` };
  }
  return null;
}

export interface PagamentoGravavel {
  /** `financial_transactions.payment_method`. */
  payment_method: string | null;
  /** `installment_total`. Nulo quando não é cartão. */
  installment_total: number | null;
}

/**
 * A forma, traduzida para as colunas do financeiro.
 *
 * "Parcelado" não é uma forma de pagamento diferente de "cartão": é cartão com
 * `installment_total` maior que 1. Guardar assim mantém uma pergunta só no
 * banco ("foi cartão?") e deixa o parcelamento ser um número, que é o que a
 * conta da taxa vai precisar.
 *
 * À vista grava `1`, e não nulo: é a diferença entre "foi uma vez" e "não foi
 * cartão", e a taxa de uma venda à vista existe e é diferente de zero.
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

/** "Cartão em 4x", "Pix". Para a linha de confirmação e para o histórico. */
export function rotuloDoPagamento(forma: unknown, parcelas: unknown): string {
  if (!ehForma(forma)) return "";
  if (forma === "cartao_parcelado") {
    const n = typeof parcelas === "string" ? Number(parcelas) : parcelas;
    return typeof n === "number" && Number.isFinite(n) && n >= MIN_PARCELAS
      ? `Cartão em ${n}x`
      : "Cartão parcelado";
  }
  return FORMAS.find((f) => f.valor === forma)?.rotulo ?? "";
}
