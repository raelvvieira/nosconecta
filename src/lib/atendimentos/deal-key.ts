// Chave de uma negociação em `pipeline_deals`.
//
// O funil vive no CRM externo, então `pipeline_deals.item_id` é `text` sem FK
// — é só o id do card lá. Isso abre espaço para registrar um desfecho de quem
// ainda NÃO tem card: a conversa vira a chave, com prefixo para nunca colidir
// com um id de card do CRM.
//
// Módulo separado (sem import de servidor) porque a tela e o handler precisam
// montar a MESMA chave — duas cópias divergiriam e o badge de "Ganho" pararia
// de aparecer depois de salvar.

export const PREFIXO_CONVERSA = "conv:";

export function chaveDaConversa(conversationId: string): string {
  return `${PREFIXO_CONVERSA}${conversationId}`;
}

/**
 * A chave a usar ao gravar. Card no funil manda: se existe, o desfecho fica
 * pendurado nele (é o que o board lê). Sem card, cai na conversa.
 */
export function chaveDaNegociacao(args: {
  pipelineItemId?: string | null;
  conversationId?: string | null;
}): string | null {
  if (args.pipelineItemId) return args.pipelineItemId;
  if (args.conversationId) return chaveDaConversa(args.conversationId);
  return null;
}

/**
 * As chaves que podem carregar o desfecho desta conversa, na ordem de
 * prioridade da leitura. São duas porque a pessoa pode ter sido ganha sem card
 * e ganhado um card depois — a negociação antiga continua na chave da conversa.
 */
export function chavesDaNegociacao(args: {
  pipelineItemId?: string | null;
  conversationId?: string | null;
}): string[] {
  const chaves: string[] = [];
  if (args.pipelineItemId) chaves.push(args.pipelineItemId);
  if (args.conversationId) chaves.push(chaveDaConversa(args.conversationId));
  return chaves;
}
