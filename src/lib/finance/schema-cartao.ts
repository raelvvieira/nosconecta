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
