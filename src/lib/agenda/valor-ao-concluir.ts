/**
 * O valor cobrado é obrigatório para concluir um atendimento. Zero é um valor.
 *
 * ── Os três estados, e por que o do meio é o que importa ────────────────────
 *
 *   BRANCO  — ninguém disse quanto foi. Recusa.
 *   ZERO    — não entrou receita. Aceita.
 *   POSITIVO— entrou isto. Aceita.
 *
 * A primeira versão desta regra tinha dois estados: "em branco" e "maior que
 * zero". O argumento era bom — o valor alimenta o ROAS e o custo por compra da
 * campanha, e um zero esquecido é indistinguível de uma cortesia de verdade.
 *
 * Só que recusar o zero não cria o cuidado que se queria; ela tira a saída de
 * quem precisa dela. Quem atendeu de cortesia precisava do botão aceso e
 * digitou **R$ 1,00**. Foram quatro atendimentos de setembro de 2026 — Erick
 * Pereira Domingues, Sérgio Menezes, Patricia Raimundo e Nicolle Garcia
 * Borges — e o estrago é maior que o do zero: R$ 4,00 de receita que não
 * existiu, em quatro linhas, com cara de valor intencional. Zero ao menos se
 * reconhece de longe.
 *
 * ── Por que aceitar zero não contamina nada ────────────────────────────────
 *
 * `createAppointmentReceivable` sai em `amount > 0`: zero não cria recebimento.
 * `valeComoCompra` (`src/lib/integrations/valor-da-conversao.ts`) recusa
 * Purchase de valor zero: zero não vira compra na Meta. Os dois lugares onde o
 * zero poderia fazer estrago já o tratam.
 *
 * ── Módulo puro ────────────────────────────────────────────────────────────
 *
 * Esta regra mudou duas vezes em cinco dias, as duas por motivo legítimo. Fora
 * da server function ela se confere sem banco, e o teste fixa os três estados —
 * é isso que impede a terceira mudança de ser por acidente.
 */

export type MotivoDaRecusa = "em-branco" | "negativo";

export interface Recusa {
  motivo: MotivoDaRecusa;
  mensagem: string;
}

/**
 * Por que este valor não serve para concluir, ou `null` quando serve.
 *
 * Devolve o motivo em vez de lançar: a tela precisa saber se o botão acende
 * (todo valor exceto branco e negativo) e o servidor precisa da mensagem. Uma
 * função para os dois, e nenhum dos dois reimplementa a regra.
 */
export function recusaDoValor(valor: number | null | undefined): Recusa | null {
  if (valor === null || valor === undefined || Number.isNaN(valor)) {
    return {
      motivo: "em-branco",
      mensagem:
        "Informe o valor cobrado para confirmar o atendimento. Digite 0 se não entrou receita.",
    };
  }
  // `!Number.isFinite` cobre Infinity, que passa pelo teste de NaN e quebraria
  // a soma do financeiro sem nunca aparecer como erro.
  if (!Number.isFinite(valor)) {
    return { motivo: "em-branco", mensagem: "Informe um valor cobrado válido." };
  }
  if (valor < 0) {
    return { motivo: "negativo", mensagem: "O valor cobrado não pode ser negativo." };
  }
  return null;
}

/** Se este valor permite concluir o atendimento. Zero permite. */
export function podeConcluir(valor: number | null | undefined): boolean {
  return recusaDoValor(valor) === null;
}

/** Se o atendimento foi de cortesia — zero digitado de propósito. */
export function ehCortesia(valor: number | null | undefined): boolean {
  return valor === 0;
}
