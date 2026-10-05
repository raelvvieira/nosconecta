import { recusaDoValor, podeConcluir, ehCortesia } from "../src/lib/agenda/valor-ao-concluir";

let feitas = 0;
function conferir(oQue: string, real: unknown, esperado: unknown) {
  feitas++;
  if (real !== esperado) {
    console.error(`FALHOU ${oQue}: esperava ${String(esperado)}, veio ${String(real)}`);
    process.exit(1);
  }
}

// ── BRANCO recusa. É o estado que a regra existe para pegar. ────────────────

conferir("nulo recusa", podeConcluir(null), false);
conferir("indefinido recusa", podeConcluir(undefined), false);
conferir("NaN recusa", podeConcluir(Number.NaN), false);
conferir("nulo: motivo", recusaDoValor(null)?.motivo, "em-branco");
conferir("indefinido: motivo", recusaDoValor(undefined)?.motivo, "em-branco");
conferir("NaN: motivo", recusaDoValor(Number.NaN)?.motivo, "em-branco");
// A mensagem precisa ENSINAR a saída, senão a pessoa digita R$ 1,00.
conferir(
  "a mensagem do branco ensina o zero",
  recusaDoValor(null)!.mensagem.includes("Digite 0"),
  true,
);

// Infinity passa pelo teste de NaN e quebraria a soma do financeiro.
conferir("Infinity recusa", podeConcluir(Number.POSITIVE_INFINITY), false);
conferir("-Infinity recusa", podeConcluir(Number.NEGATIVE_INFINITY), false);

// ── NEGATIVO recusa, com motivo próprio ────────────────────────────────────

conferir("negativo recusa", podeConcluir(-1), false);
conferir("negativo: motivo", recusaDoValor(-1)?.motivo, "negativo");
conferir("negativo quebrado recusa", podeConcluir(-0.01), false);

// ── ZERO ACEITA. É a correção de 05/10. ────────────────────────────────────

conferir("zero aceita", podeConcluir(0), true);
conferir("zero não tem recusa", recusaDoValor(0), null);
// `-0 === 0` em JavaScript, e `-0 < 0` é falso: zero negativo não é negativo.
conferir("zero negativo aceita", podeConcluir(-0), true);

// ── POSITIVO aceita ───────────────────────────────────────────────────────

conferir("um real aceita", podeConcluir(1), true);
conferir("centavo aceita", podeConcluir(0.01), true);
conferir("valor real aceita", podeConcluir(767), true);
conferir("valor grande aceita", podeConcluir(32562), true);

// ── Cortesia é SÓ o zero ──────────────────────────────────────────────────
//
// O R$ 1,00 que as pessoas digitaram para o botão acender não pode contar como
// cortesia: ele é receita inventada, e precisa continuar visível como tal.

conferir("zero é cortesia", ehCortesia(0), true);
conferir("um real NÃO é cortesia", ehCortesia(1), false);
conferir("centavo NÃO é cortesia", ehCortesia(0.01), false);
conferir("branco não é cortesia", ehCortesia(null), false);
conferir("indefinido não é cortesia", ehCortesia(undefined), false);

console.log(`ok — ${feitas} checagens do valor ao concluir`);
