/**
 * Reconhecer o erro de CHAVE DUPLICADA do Postgres.
 *
 * ── Por que isto existe ─────────────────────────────────────────────────────
 *
 * Com o índice único em `(owner_id, source_type, source_id)`, gravar a mesma
 * origem duas vezes deixa de criar uma segunda linha e passa a devolver erro.
 * Isso é o que se queria — mas quem concluiu o atendimento duas vezes não fez
 * nada de errado, e não pode ver uma mensagem de falha.
 *
 * Então o erro de duplicata é tratado como "já está lá", e qualquer OUTRO erro
 * continua subindo. A diferença entre os dois é o código `23505`, e é por ele
 * que se testa — não pela mensagem, que muda de idioma e de versão.
 *
 * Módulo puro de propósito: é a única parte disto que se consegue conferir sem
 * banco, e é a parte em que errar é silencioso.
 */

/** O código do Postgres para violação de restrição de unicidade. */
export const CHAVE_DUPLICADA = "23505";

/**
 * Se o erro é de chave duplicada.
 *
 * Aceita o que o PostgREST devolve (`{ code }`), o que o driver devolve
 * (`{ code }` com a mesma forma) e `Error` com o código no texto — este último
 * porque o caminho do `supabase-js` às vezes embala o erro antes de chegar
 * aqui, e perder a detecção faria o duplicado virar falha visível.
 */
export function ehChaveDuplicada(erro: unknown): boolean {
  if (!erro || typeof erro !== "object") return false;

  const code = (erro as { code?: unknown }).code;
  if (typeof code === "string" && code === CHAVE_DUPLICADA) return true;
  // Alguns drivers devolvem o código como número.
  if (typeof code === "number" && String(code) === CHAVE_DUPLICADA) return true;

  const mensagem = (erro as { message?: unknown }).message;
  if (typeof mensagem !== "string") return false;
  // `duplicate key value violates unique constraint "…"` é o texto do Postgres;
  // o código aparece junto quando o erro foi embalado como `Error`.
  return (
    mensagem.includes(CHAVE_DUPLICADA) ||
    /duplicate key value violates unique constraint/i.test(mensagem)
  );
}
