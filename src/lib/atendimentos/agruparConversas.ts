import type { ConversationRow } from "./atendimentos.functions";
import { normalizeBrazilianPhone } from "./phone";

/** Uma pessoa e todas as conversas que ela tem. */
export interface GrupoDeConversa {
  /** Chave estável do grupo — o telefone normalizado quando existe. */
  chave: string;
  /** A que a linha abre: aberta e mais recente, pela ordem que já vem pronta. */
  principal: ConversationRow;
  /** As demais conversas do mesmo número, da mais recente para a mais
   *  antiga. Não aparecem como linha própria: a thread mostra as mensagens de
   *  todas juntas. Ficam aqui porque a soma de não-lidas e o realce da linha
   *  aberta dependem delas. */
  outras: ConversationRow[];
  /** Soma de todas as conversas do grupo — esconder uma esconderia o aviso. */
  naoLidas: number;
}

/**
 * Uma linha por NÚMERO na caixa de entrada.
 *
 * ── A regra, e por que ela mudou ─────────────────────────────────────────
 *
 * No WhatsApp o número É a conversa. Não existe "duas conversas com o mesmo
 * número" — existe um chat, e é assim que ele aparece no celular de quem
 * escreveu. Se mãe e filha usam o mesmo aparelho, elas dividem esse chat: é
 * a realidade, não um defeito para o sistema corrigir.
 *
 * A separação vinha do CRM, que é um Chatwoot: lá uma conversa encerrada e
 * reaberta vira duas linhas, e um contato salvo duas vezes (com e sem o "55")
 * vira dois contatos. Eram artefatos da ferramenta, e a tela os herdava.
 *
 * Antes a chave era o `contactId`, com uma segunda passada juntando grupos de
 * mesmo telefone E mesmo nome. Exigir o nome deixava de fora justamente os
 * casos que importam — a mesma pessoa gravada como "Carol" num contato e
 * "Carol Kroeff" no outro continuava em duas linhas.
 *
 * ── As chaves, nesta ordem ───────────────────────────────────────────────
 *
 * 1. telefone normalizado — a identidade real.
 *    `normalizeBrazilianPhone` decide por comprimento, então "51993351821" e
 *    "5551993351821" casam.
 * 2. `contactId`, quando não há telefone. É o caso dos GRUPOS: "#NÓS Floripa
 *    - Gestão" não tem número, e o id do grupo é a identidade dele.
 * 3. o id da própria conversa — sem contato nem telefone, cada conversa é o
 *    seu próprio grupo. Colapsar tudo que não tem nenhum dos dois num grupo
 *    só juntaria gente diferente, e a conversa de alguém sumiria da lista.
 *
 * A ordem de entrada é preservada: `getConversations` já entrega abertas
 * primeiro e, dentro de cada grupo, a mais recente no topo. Então a primeira
 * de cada grupo é a principal, sem reordenar nada aqui.
 */
export function agruparPorContato(conversas: ConversationRow[]): GrupoDeConversa[] {
  const grupos = new Map<string, GrupoDeConversa>();

  for (const c of conversas) {
    const chave = chaveDaConversa(c);
    const existente = grupos.get(chave);
    if (existente) {
      existente.outras.push(c);
      existente.naoLidas += c.unreadCount;
      // O nome pode faltar numa das conversas e existir na outra — a da
      // Evolution nasce com o `pushName`, a do CRM com o nome cadastrado.
      // Uma linha sem nome ao lado de uma com nome vira "Contato" à toa.
      if (!existente.principal.contactName && c.contactName) {
        existente.principal = { ...existente.principal, contactName: c.contactName };
      }
      if (!existente.principal.avatarUrl && c.avatarUrl) {
        existente.principal = { ...existente.principal, avatarUrl: c.avatarUrl };
      }
      continue;
    }
    grupos.set(chave, { chave, principal: c, outras: [], naoLidas: c.unreadCount });
  }

  return [...grupos.values()];
}

function chaveDaConversa(c: ConversationRow): string {
  const fone = c.phone ? normalizeBrazilianPhone(c.phone) : "";
  if (fone) return `fone:${fone}`;
  if (c.contactId) return `contato:${c.contactId}`;
  return `conversa:${c.id}`;
}

/**
 * Contato do CRM → a conversa por onde falar com ele.
 *
 * Fonte única para o disparo e para o funil, que discordavam entre si: o
 * `ContactsTab` montava o mapa com `m.set(contactId, c.id)` num laço, e como a
 * lista vem ordenada *abertas primeiro, resolvidas depois*, o último `set`
 * vencia — o disparo saía pela conversa RESOLVIDA de quem também tinha uma
 * aberta. O funil usava `find` e acertava.
 *
 * Aqui a primeira vence, que é a regra certa: a lista já chega ordenada com a
 * aberta e mais recente na frente.
 */
export function conversaPorContato(conversas: ConversationRow[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of conversas) {
    if (c.contactId && !m.has(c.contactId)) m.set(c.contactId, c.id);
  }
  return m;
}
