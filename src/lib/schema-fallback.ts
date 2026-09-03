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

/**
 * O erro é "essa coluna não existe", e não outra falha qualquer?
 *
 * Aceita uma lista quando a mesma migration cria mais de uma coluna: o
 * PostgREST reclama de UMA delas, e não há como saber de qual — bater só na
 * primeira deixaria metade dos casos passando direto.
 */
export function faltaColuna(
  error: { code?: string; message?: string } | null | undefined,
  coluna: string | string[],
): boolean {
  if (!error) return false;
  // PGRST204 é o código do PostgREST para coluna desconhecida; o nome é
  // conferido junto porque o mesmo código serve para qualquer coluna.
  if (error.code !== "PGRST204") return false;
  const mensagem = String(error.message ?? "");
  return (Array.isArray(coluna) ? coluna : [coluna]).some((c) => mensagem.includes(c));
}

/** O mesmo registro sem a coluna (ou colunas) que o banco ainda não conhece. */
export function semColuna<T extends Record<string, unknown>>(row: T, coluna: string | string[]): T {
  const resto = { ...row };
  for (const c of Array.isArray(coluna) ? coluna : [coluna]) delete resto[c];
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
  coluna: string | string[];
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
      `${motivo} Falta aplicar a migration pendente do banco ` +
        `(coluna ${[coluna].flat().join(", ")}) — ` +
        "peça isso no Lovable e tente de novo depois.",
    );
  }
  console.warn(
    `[schema] ${[coluna].flat().join(", ")} ausente no banco; gravando sem ela até a migration rodar.`,
  );
  return tentar(true);
}
