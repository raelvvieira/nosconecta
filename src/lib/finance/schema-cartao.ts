/**
 * A janela entre o deploy do código e a migration do cartão de crédito.
 *
 * As migrations deste projeto são aplicadas à parte, por um comando no
 * Lovable. Entre um e outro, `credit_cards` e `card_invoices` ainda não
 * existem, e uma consulta a elas derruba a tela inteira. Cartão é
 * funcionalidade nova: o financeiro que já funcionava não pode parar por
 * causa dela.
 *
 * ── Por que módulo próprio, e não dentro de `cards.functions.ts` ────────
 *
 * O splitter de server functions apaga os irmãos do módulo: o que não é uma
 * `createServerFn` some do pacote do cliente. Helper de runtime importado de
 * fora precisa morar num arquivo que não tenha server function nenhuma.
 */

/** `42P01` — o código do Postgres para "relação não existe". */
const TABELA_AUSENTE = "42P01";

export function tabelaDeCartaoAusente(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null | undefined;
  return !!e && (e.code === TABELA_AUSENTE || /does not exist/i.test(String(e.message ?? "")));
}

/**
 * As colunas de cartão já existem em `financial_transactions`?
 *
 * ── Por que isto é necessário ────────────────────────────────────────────
 *
 * Praticamente toda consulta de dinheiro do sistema vai ganhar um filtro por
 * `card_invoice_id`. Filtrar por uma coluna que o PostgREST ainda não conhece
 * não devolve zero linhas: devolve erro, e o financeiro INTEIRO para — KPIs,
 * gráfico, lista, projeção. Trocar um recurso novo por isso seria péssimo
 * negócio.
 *
 * ── Por que ignorar o filtro é CORRETO enquanto elas não existem ────────
 *
 * Sem as colunas não existe compra de cartão. Sem compra de cartão não há o
 * que contar em dobro. O filtro é literalmente um no-op nessa janela — e é
 * por isso que ele pode ser aplicado antes do resto do recurso existir.
 *
 * ── A memória é assimétrica, de propósito ────────────────────────────────
 *
 * `true` fica guardado para sempre: coluna não desaparece. `false` vale por
 * pouco tempo — senão, depois de aplicar a migration, o processo continuaria
 * achando que ela não rodou e os filtros nunca ligariam.
 */
let colunasPresentes = false;
let ultimaSondagem = 0;
const VALIDADE_DO_NAO = 60_000;

export async function temColunasDeCartao(supabase: { from: (t: string) => any }): Promise<boolean> {
  if (colunasPresentes) return true;
  if (Date.now() - ultimaSondagem < VALIDADE_DO_NAO) return false;

  ultimaSondagem = Date.now();
  const { error } = await supabase
    .from("financial_transactions")
    .select("card_invoice_id")
    .limit(1);
  colunasPresentes = !error;
  return colunasPresentes;
}

/**
 * Só o que é CAIXA: tira as compras de cartão, mantém a linha da fatura.
 *
 * É o predicado das perguntas "quanto saiu", "quanto vai sair", "o que está
 * em atraso" e da lista de Pagamentos. A compra individual não é saída de
 * caixa: quem sai do caixa é a fatura, uma vez por mês, somando todas.
 */
export function soCaixa<Q extends { is: (coluna: string, valor: null) => Q }>(
  query: Q,
  ativo: boolean,
): Q {
  return ativo ? query.is("card_invoice_id", null) : query;
}

/**
 * Só o que tem NATUREZA: tira a linha da fatura, mantém as compras.
 *
 * O predicado inverso, e é inverso por um motivo concreto: a categoria
 * ("Material", "Marketing") mora na compra. A fatura não tem categoria — ela é
 * a soma de compras de categorias diferentes. Usar o mesmo filtro dos dois
 * lados transformaria todo gasto no cartão numa fatia cinza e mataria a
 * categorização, que é justamente para o que ela serve.
 */
export function soNatureza<Q extends { is: (coluna: string, valor: null) => Q }>(
  query: Q,
  ativo: boolean,
): Q {
  return ativo ? query.is("settles_card_invoice_id", null) : query;
}
