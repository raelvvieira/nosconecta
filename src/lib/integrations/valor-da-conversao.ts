// Quanto vale a conversão que vai para a Meta.
//
// ── O defeito que trouxe este arquivo ──────────────────────────────────
//
// O valor saía de `actual_revenue ?? expected_revenue`. O `??` só cai para o
// segundo quando o primeiro é nulo — e **zero não é nulo**.
//
// Medido em 01/10, nos 20 últimos eventos de compra: dois agendamentos de
// Bioestimulador de colágeno, de R$ 1.500 cada, tinham o realizado em 0,00 e o
// previsto em 1.500,00. A Meta recebeu **R$ 0,00** nos dois. R$ 3.000 de
// faturamento reportados como nada.
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
 * **Zero conta como ausente**, e é esse o ponto: ninguém marca um atendimento
 * como concluído querendo dizer "este valeu zero reais". Zero no realizado
 * quer dizer "a recepção não preencheu", e o previsto é a melhor informação
 * que existe.
 *
 * Devolve `null` — e não zero — quando os dois estão vazios. `null` atravessa
 * como "sem valor" e deixa quem chama decidir; zero viraria uma compra de
 * R$ 0,00 no painel da Meta.
 *
 * Negativo também vira `null`: estorno não é compra, e mandar valor negativo
 * faria a Meta somar faturamento negativo ao ROAS da campanha.
 */
export function valorDaConversao(
  realizado: number | string | null | undefined,
  previsto: number | string | null | undefined,
): number | null {
  return positivo(realizado) ?? positivo(previsto);
}

function positivo(valor: number | string | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : null;
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
