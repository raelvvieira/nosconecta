/**
 * Ponte para a janela em que o código já subiu e a migration ainda não rodou.
 *
 * `actual_revenue` é criada por uma migration aplicada à parte, pelo Lovable.
 * Entre o deploy e esse comando, **nenhum** agendamento salvava: o insert
 * mandava a coluna, o PostgREST não a conhecia e derrubava a gravação inteira
 * com "Could not find the 'actual_revenue' column ... in the schema cache".
 * Agendar não pode depender de um campo que só interessa ao concluir.
 *
 * Quando a migration rodar, nada aqui muda de comportamento: a primeira
 * tentativa passa e a segunda nunca acontece.
 */

/** O erro é "essa coluna não existe", e não outra falha qualquer? */
export function faltaColunaValorCobrado(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  // PGRST204 é o código do PostgREST para coluna desconhecida; o nome é
  // conferido junto porque o mesmo código serve para qualquer coluna.
  return error.code === "PGRST204" && String(error.message ?? "").includes("actual_revenue");
}

/** O mesmo registro sem a coluna que o banco ainda não conhece. */
export function semValorCobrado<T extends Record<string, unknown>>(row: T): Omit<T, "actual_revenue"> {
  const { actual_revenue: _fora, ...resto } = row as T & { actual_revenue?: unknown };
  return resto as Omit<T, "actual_revenue">;
}

/**
 * Grava e, faltando a coluna, grava de novo sem ela — mas só quando ela não
 * carrega nada.
 *
 * Concluir um atendimento sem poder gravar o valor criaria um recebimento de
 * R$ 0 e apagaria em silêncio o número que a pessoa digitou. Nesse caso é
 * melhor recusar dizendo o que falta do que gravar errado.
 */
export async function gravarTolerandoColunaAusente<T = any>(
  tentar: (semValorCobrado: boolean) => PromiseLike<{ data: any; error: any }>,
  concluindo: boolean,
): Promise<{ data: T; error: any }> {
  const primeira = await tentar(false);
  if (!faltaColunaValorCobrado(primeira.error)) return primeira;
  if (concluindo) {
    throw new Error(
      "O valor cobrado ainda não pode ser gravado: falta aplicar a migration pendente do banco " +
        "(coluna actual_revenue). Peça isso no Lovable e confirme o atendimento depois.",
    );
  }
  console.warn("[agenda] actual_revenue ausente no banco; gravando sem ela até a migration rodar.");
  return tentar(true);
}
