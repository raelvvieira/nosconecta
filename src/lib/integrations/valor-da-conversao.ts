// Quanto vale a conversão que vai para a Meta.
//
// ── O defeito que trouxe este arquivo ──────────────────────────────────
//
// O valor saía de `actual_revenue ?? expected_revenue`. O `??` só cai para o
// segundo quando o primeiro é nulo — e **zero não é nulo**.
//
// Medido em 01/10: um atendimento de Bioestimulador com o realizado em 0,00 e
// o previsto em 1.500,00 mandou **R$ 0,00** para a Meta — uma compra sem
// faturamento nenhum.
//
// A minha primeira correção foi pior que o defeito: fazer zero cair para o
// previsto. Isso REPORTARIA R$ 1.500 que não entraram, porque zero ali é valor
// de verdade — a tela de confirmar atendimento aceita cortesia de propósito, e
// aquele atendimento não gerou lançamento financeiro nenhum.
//
// O defeito real era mandar a compra de R$ 0. Não o valor: o envio.
//
// Isso não é detalhe de contabilidade: é o ROAS. Uma compra de R$ 0 conta no
// numerador (uma compra a mais) e some do faturamento, então o custo por
// compra fica artificialmente barato e o retorno despenca. A clínica olharia
// o painel e tiraria a conclusão errada sobre qual campanha funciona.
//
// ── Por que módulo próprio e não uma linha no lugar ────────────────────
//
// Porque a regra tem três casos e o `??` escondia dois deles. Escrita como
// função, ela é exercível sem banco e sem Meta — e o teste guarda o caso real
// dos R$ 1.500 para ninguém reintroduzir o `??` achando que simplifica.

/**
 * O valor que representa a conversão, ou `null` quando não há valor.
 *
 * **Zero é valor, e passa.** Esta função já nasceu errada uma vez, em 01/10:
 * eu tratei zero como "não preenchido" e fiz cair para o previsto. A tela de
 * confirmar atendimento diz o contrário, em letra escrita desde agosto:
 *
 *   "O valor não é opcional de propósito. Zero é aceito (atendimento de
 *    cortesia existe); o que não passa é deixar em branco."
 *
 * Com o meu erro, confirmar uma cortesia de R$ 0 reportaria à Meta o valor
 * PREVISTO — R$ 1.500 de faturamento que não existiu. Inventar receita é pior
 * que o defeito que eu estava consertando.
 *
 * O defeito de verdade nunca foi o valor: era MANDAR uma compra de R$ 0,00.
 * Quem resolve isso é `valeComoCompra`, que não envia. A cortesia deixa de
 * virar uma compra sem faturamento no painel, e nenhum número é inventado.
 *
 * O previsto entra só quando o realizado está AUSENTE — nulo ou vazio, que é
 * o caso do agendamento cujo status mudou por outro caminho que não a tela de
 * confirmação.
 *
 * Negativo e texto não-numérico contam como ausentes: estorno não é compra, e
 * `Number("abc")` é `NaN`, que atravessaria a soma inteira e viraria "R$ NaN"
 * na tela.
 */
export function valorDaConversao(
  realizado: number | string | null | undefined,
  previsto: number | string | null | undefined,
): number | null {
  const confirmado = numeroOuNulo(realizado);
  // `!== null` e não um teste de verdade: zero é falso em JavaScript, e um
  // `if (confirmado)` aqui recriaria exatamente o defeito que este comentário
  // existe para impedir.
  if (confirmado !== null) return confirmado;
  return numeroOuNulo(previsto);
}

function numeroOuNulo(valor: number | string | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Esta conversão vale a pena mandar como COMPRA?
 *
 * Compra de R$ 0,00 não é compra: é uma consulta de cortesia, um retorno, ou
 * um valor que ninguém preencheu. Mandar assim mesmo polui exatamente a coluna
 * que a clínica quer usar para comparar campanhas — sobe a contagem de compras
 * sem subir um centavo de faturamento.
 *
 * Vale só para evento que carrega valor. `Lead`, `Contact` e companhia não têm
 * valor nenhum e continuam saindo normalmente.
 */
export function valeComoCompra(nomeDoEvento: string, valor: number | null): boolean {
  const comValor = /^(purchase|subscribe|starttrial)$/i.test(String(nomeDoEvento ?? "").trim());
  if (!comValor) return true;
  return valor !== null && valor > 0;
}
