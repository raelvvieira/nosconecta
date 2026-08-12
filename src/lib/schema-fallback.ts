/**
 * Ponte para a janela em que o código já subiu e a migration ainda não rodou.
 *
 * As migrations deste projeto são aplicadas à parte, por um comando no Lovable.
 * Entre o deploy do código e esse comando existe uma janela em que o insert
 * manda uma coluna que o PostgREST ainda não conhece — e ele derruba a gravação
 * inteira com "Could not find the 'X' column ... in the schema cache".
 *
 * Já aconteceu de valer o sistema todo: `actual_revenue` interessa só ao
 * concluir um atendimento, e mesmo assim impedia **qualquer** agendamento de
 * ser salvo. A regra que saiu daí: uma coluna nova não pode derrubar o que
 * funcionava sem ela.
 *
 * Quando a migration roda, nada aqui muda de comportamento — a primeira
 * tentativa passa e a segunda nunca acontece.
 */

/** O erro é "essa coluna não existe", e não outra falha qualquer? */
export function faltaColuna(
  error: { code?: string; message?: string } | null | undefined,
  coluna: string,
): boolean {
  if (!error) return false;
  // PGRST204 é o código do PostgREST para coluna desconhecida; o nome é
  // conferido junto porque o mesmo código serve para qualquer coluna.
  return error.code === "PGRST204" && String(error.message ?? "").includes(coluna);
}

/** O mesmo registro sem a coluna que o banco ainda não conhece. */
export function semColuna<T extends Record<string, unknown>>(row: T, coluna: string): T {
  const resto = { ...row };
  delete resto[coluna];
  return resto;
}

/**
 * Grava e, faltando a coluna, grava de novo sem ela — mas só quando ela não
 * carrega nada nesta gravação.
 *
 * `exigida` inverte a decisão: quando o dado é o motivo da gravação, seguir sem
 * ele apagaria em silêncio o que a pessoa digitou (um valor cobrado virando
 * recebimento de R$ 0, por exemplo). Aí é melhor recusar dizendo o que falta.
 */
export async function gravarTolerandoColunaAusente<T = any>({
  coluna,
  tentar,
  exigida,
  motivo,
}: {
  coluna: string;
  /** `semColuna` avisa a chamada para montar o payload reduzido. */
  tentar: (semColuna: boolean) => PromiseLike<{ data: any; error: any }>;
  /** A gravação perde o sentido sem esta coluna? */
  exigida: boolean;
  /** O que se perderia, em português, para a mensagem de erro. */
  motivo: string;
}): Promise<{ data: T; error: any }> {
  const primeira = await tentar(false);
  if (!faltaColuna(primeira.error, coluna)) return primeira;
  if (exigida) {
    throw new Error(
      `${motivo} Falta aplicar a migration pendente do banco (coluna ${coluna}) — ` +
        "peça isso no Lovable e tente de novo depois.",
    );
  }
  console.warn(`[schema] ${coluna} ausente no banco; gravando sem ela até a migration rodar.`);
  return tentar(true);
}
