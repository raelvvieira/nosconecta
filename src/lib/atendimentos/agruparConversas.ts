import type { ConversationRow } from "./atendimentos.functions";
import { normalizeBrazilianPhone } from "./phone";

/** Uma pessoa e todas as conversas que ela tem. */
export interface GrupoDeConversa {
  /** Chave estável do grupo — o `contactId` quando existe. */
  chave: string;
  /** A que a linha abre: aberta e mais recente, pela ordem que já vem pronta. */
  principal: ConversationRow;
  /** As demais, da mais recente para a mais antiga. Vazio no caso comum. */
  outras: ConversationRow[];
  /** Soma de todas as conversas do grupo — esconder uma esconderia o aviso. */
  naoLidas: number;
}

/**
 * Uma linha por PESSOA na caixa de entrada.
 *
 * ── Por que existe ────────────────────────────────────────────────────────
 *
 * A mesma pessoa aparecia duas e três vezes na lista, com a mesma foto e o
 * mesmo minuto. Não eram linhas repetidas na tela: eram conversas DISTINTAS no
 * CRM, do mesmo contato. Duas coisas se somaram para isso:
 *
 *  - o disparo de 31/08 criou uma conversa a mais para várias pessoas (bug já
 *    corrigido em quatro camadas, de `useContatosIncremental` ao índice único);
 *  - a leitura passou a trazer também as RESOLVIDAS (`status=all`), o que está
 *    certo — sem isso o disparo achava que quem tinha conversa encerrada não
 *    tinha conversa nenhuma — mas trouxe o histórico todo para a tela.
 *
 * As conversas duplicadas que já existem continuam no CRM: não dá para apagá-las
 * daqui. O agrupamento é o que faz a caixa de entrada voltar a ser legível.
 *
 * ── As chaves, nesta ordem ───────────────────────────────────────────────
 *
 * 1. `contactId` — o caso normal.
 * 2. telefone normalizado, quando não há `contactId`.
 *    `normalizeBrazilianPhone` decide por comprimento, então "51993351821" e
 *    "5551993351821" casam.
 * 3. o id da própria conversa — sem contato nem telefone, cada conversa é o seu
 *    próprio grupo. Colapsar tudo que não tem contato num grupo só juntaria
 *    gente diferente, e a conversa de alguém sumiria da lista.
 *
 * Depois disso, uma segunda passada junta grupos de `contactId` DIFERENTES que
 * tenham o mesmo telefone **e o mesmo nome** — o contato duplicado dentro do
 * próprio CRM, que nenhuma correção de código nossa desfaz (um telefone salvo
 * sem o "55" vira um contato separado lá; é o que a ação "Corrigir telefones"
 * do painel existe para evitar).
 *
 * Exigir os DOIS é de propósito. Só o telefone juntaria mãe e filha que usam o
 * mesmo número — gente diferente, com conversas diferentes —, e a conversa de
 * uma sumiria debaixo do nome da outra. Mesmo número e mesmo nome é a mesma
 * pessoa cadastrada duas vezes.
 *
 * A ordem de entrada é preservada: `getConversations` já entrega abertas
 * primeiro e, dentro de cada grupo, a mais recente no topo. Então a primeira de
 * cada grupo é a principal, sem reordenar nada aqui.
 */
export function agruparPorContato(conversas: ConversationRow[]): GrupoDeConversa[] {
  const grupos = new Map<string, GrupoDeConversa>();

  for (const c of conversas) {
    const chave = chaveDaConversa(c);
    const existente = grupos.get(chave);
    if (existente) {
      existente.outras.push(c);
      existente.naoLidas += c.unreadCount;
      continue;
    }
    grupos.set(chave, { chave, principal: c, outras: [], naoLidas: c.unreadCount });
  }

  return juntarContatosDuplicados([...grupos.values()]);
}

/** Junta grupos de contatos diferentes que são a mesma pessoa: mesmo telefone
 *  E mesmo nome. Ver a explicação das chaves acima. */
function juntarContatosDuplicados(grupos: GrupoDeConversa[]): GrupoDeConversa[] {
  const porPessoa = new Map<string, GrupoDeConversa>();
  const resultado: GrupoDeConversa[] = [];

  for (const g of grupos) {
    const fone = g.principal.phone ? normalizeBrazilianPhone(g.principal.phone) : "";
    const nome = (g.principal.contactName ?? "").trim().toLocaleLowerCase("pt-BR");
    // Sem os dois não há como afirmar que é a mesma pessoa — fica como está.
    if (!fone || !nome) {
      resultado.push(g);
      continue;
    }
    const chave = `${fone}|${nome}`;
    const anterior = porPessoa.get(chave);
    if (!anterior) {
      porPessoa.set(chave, g);
      resultado.push(g);
      continue;
    }
    anterior.outras.push(g.principal, ...g.outras);
    anterior.naoLidas += g.naoLidas;
  }

  return resultado;
}

function chaveDaConversa(c: ConversationRow): string {
  if (c.contactId) return `contato:${c.contactId}`;
  const fone = c.phone ? normalizeBrazilianPhone(c.phone) : "";
  if (fone) return `fone:${fone}`;
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
