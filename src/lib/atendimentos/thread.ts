import type { MessageRow } from "./atendimentos.functions";

/**
 * Junta as mensagens de todas as conversas de um mesmo número numa thread só.
 *
 * Mora fora de `atendimentos.functions.ts` pelo mesmo motivo que `anexos.ts`:
 * aquele arquivo importa `@tanstack/react-start` e não carrega isolado num
 * teste. Aqui não há import de runtime nenhum.
 *
 * Duas regras, e as duas têm um modo de falhar silencioso:
 *
 * - **Sem repetir.** A mesma mensagem pode chegar por dois caminhos — o CRM
 *   devolve a thread e o espelho guarda uma cópia dela. Repetida na tela, ela
 *   parece uma mensagem enviada duas vezes.
 * - **Em ordem de tempo.** As partes chegam agrupadas por conversa; emendadas
 *   sem ordenar, a conversa de agosto apareceria depois da de setembro e a
 *   leitura viraria um vaivém.
 */
export function juntarMensagens(partes: MessageRow[][]): MessageRow[] {
  const porId = new Map<string, MessageRow>();
  for (const parte of partes) {
    for (const m of parte) porId.set(m.id, m);
  }
  // `localeCompare` em ISO 8601 ordena certo porque o formato é ordenável como
  // texto. Sem data vai para o começo, e não para um lugar aleatório.
  return [...porId.values()].sort((a, b) => (a.timestamp ?? "").localeCompare(b.timestamp ?? ""));
}
