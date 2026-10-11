// Como o atendimento foi pago.
//
// O que se testa aqui é a fronteira entre o que a tela oferece e o que vai
// para o banco. Errar aqui não dá erro em lugar nenhum: grava um método que o
// filtro de Recebimentos não conhece, ou um parcelamento que a conta da taxa
// vai interpretar errado meses depois.
import {
  comoGravar,
  ehForma,
  FORMAS,
  MAX_PARCELAS,
  pedeParcelas,
  recusaDoPagamento,
  rotuloDoPagamento,
} from "../src/lib/agenda/forma-de-pagamento";

let feitas = 0;
function conferir(oQue: string, real: unknown, esperado: unknown) {
  feitas++;
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a !== b) {
    console.error(`FALHOU ${oQue}: esperava ${b}, veio ${a}`);
    process.exit(1);
  }
}

// ── O que a tela oferece ────────────────────────────────────────────────────

conferir("quatro formas", FORMAS.length, 4);
conferir("só a parcelada pede parcelas", FORMAS.filter((f) => f.pedeParcelas).length, 1);
conferir("e é a do cartão parcelado", pedeParcelas("cartao_parcelado"), true);
conferir("à vista não pede", pedeParcelas("cartao"), false);
conferir("pix não pede", pedeParcelas("pix"), false);
conferir("lixo não pede", pedeParcelas("qualquer"), false);

conferir("pix é forma", ehForma("pix"), true);
conferir("boleto não é", ehForma("boleto"), false);
conferir("nulo não é", ehForma(null), false);
conferir("número não é", ehForma(3), false);

// ── O que impede de concluir ────────────────────────────────────────────────
//
// A forma é OPCIONAL. Cortesia não teve pagamento, e atendimento antigo sendo
// regularizado pode não ter mais essa informação. Obrigá-la faria quem não sabe
// escolher qualquer uma — e dado inventado não se distingue do verdadeiro
// depois.

conferir("sem forma, tudo bem", recusaDoPagamento(null, null), null);
conferir("vazio, tudo bem", recusaDoPagamento("", null), null);
conferir("indefinido, tudo bem", recusaDoPagamento(undefined, undefined), null);
conferir("pix sem parcelas", recusaDoPagamento("pix", null), null);
conferir("dinheiro sem parcelas", recusaDoPagamento("dinheiro", null), null);
conferir("cartão à vista sem parcelas", recusaDoPagamento("cartao", null), null);
// Parcelas sobrando numa forma que não parcela são ignoradas, não recusadas:
// é resto de um clique anterior na tela, não um erro de quem está usando.
conferir("pix com parcelas é ignorado", recusaDoPagamento("pix", 4), null);

conferir("forma desconhecida", recusaDoPagamento("boleto", null)?.campo, "forma");
conferir("parcelado sem número", recusaDoPagamento("cartao_parcelado", null)?.campo, "parcelas");
conferir("parcelado com texto", recusaDoPagamento("cartao_parcelado", "abc")?.campo, "parcelas");
conferir("parcelado com decimal", recusaDoPagamento("cartao_parcelado", 2.5)?.campo, "parcelas");
// 1x não é parcelamento: é à vista, e tem outra taxa. Mandar de volta para a
// forma certa evita uma taxa errada calculada depois.
conferir("parcelado em 1x", recusaDoPagamento("cartao_parcelado", 1)?.campo, "parcelas");
conferir("parcelado em 0x", recusaDoPagamento("cartao_parcelado", 0)?.campo, "parcelas");
conferir("parcelado negativo", recusaDoPagamento("cartao_parcelado", -3)?.campo, "parcelas");
conferir(
  "acima do teto",
  recusaDoPagamento("cartao_parcelado", MAX_PARCELAS + 1)?.campo,
  "parcelas",
);
conferir("no teto, aceita", recusaDoPagamento("cartao_parcelado", MAX_PARCELAS), null);
conferir("duas vezes, aceita", recusaDoPagamento("cartao_parcelado", 2), null);
conferir("número como texto, aceita", recusaDoPagamento("cartao_parcelado", "4"), null);

// ── O que vai para o banco ──────────────────────────────────────────────────
//
// Os valores têm de ser os MESMOS que o formulário de recebimento já usa, ou o
// filtro por forma de pagamento de /recebimentos deixa de achar estas linhas.

conferir("pix", comoGravar("pix", null), { payment_method: "pix", installment_total: null });
conferir("dinheiro vira cash", comoGravar("dinheiro", null), {
  payment_method: "cash",
  installment_total: null,
});
// À vista grava 1, e não nulo: é a diferença entre "foi uma vez" e "não foi
// cartão", e a taxa de uma venda à vista existe e não é zero.
conferir("cartão à vista", comoGravar("cartao", null), {
  payment_method: "credit",
  installment_total: 1,
});
conferir("cartão em 4x", comoGravar("cartao_parcelado", 4), {
  payment_method: "credit",
  installment_total: 4,
});
conferir("cartão em 12x", comoGravar("cartao_parcelado", 12), {
  payment_method: "credit",
  installment_total: 12,
});
conferir("parcelas como texto", comoGravar("cartao_parcelado", "6"), {
  payment_method: "credit",
  installment_total: 6,
});
// Parcelado sem número válido grava o método e deixa o parcelamento nulo. Não
// inventa 1: "cartão, não sei em quantas" é verdade; "cartão à vista" não é.
conferir("parcelado sem número", comoGravar("cartao_parcelado", null), {
  payment_method: "credit",
  installment_total: null,
});
conferir("parcelado fora do teto", comoGravar("cartao_parcelado", 99), {
  payment_method: "credit",
  installment_total: null,
});
// Sem forma, as duas colunas ficam nulas — e nulo aqui quer dizer "ninguém
// informou", que é diferente de qualquer forma escolhida.
conferir("sem forma", comoGravar(null, null), {
  payment_method: null,
  installment_total: null,
});
conferir("forma inválida", comoGravar("boleto", 3), {
  payment_method: null,
  installment_total: null,
});

// ── O rótulo ────────────────────────────────────────────────────────────────

conferir("pix", rotuloDoPagamento("pix", null), "Pix");
conferir("dinheiro", rotuloDoPagamento("dinheiro", null), "Dinheiro");
conferir("à vista", rotuloDoPagamento("cartao", null), "Cartão à vista");
conferir("em 4x", rotuloDoPagamento("cartao_parcelado", 4), "Cartão em 4x");
conferir("parcelado sem número", rotuloDoPagamento("cartao_parcelado", null), "Cartão parcelado");
conferir("sem forma", rotuloDoPagamento(null, null), "");

console.log(`ok — ${feitas} checagens da forma de pagamento`);
