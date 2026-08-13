import type { ConversationRow, CrmInbox } from "./atendimentos.functions";

export interface LinhaDoRetrato {
  inboxId: string | null;
  /** Nome da caixa, ou o rótulo de "não deu para identificar". */
  rotulo: string;
  phoneNumber: string | null;
  conversas: number;
  /** É a caixa do número conectado agora? */
  conectada: boolean;
  /** Conversas cujo CRM não informou caixa nenhuma. */
  indeterminada: boolean;
}

/**
 * Quantas conversas há em cada caixa da conta do CRM.
 *
 * A pergunta que isto responde: as conversas que vemos são todas do número
 * conectado hoje, ou tem gente de um número anterior no meio? O modelo do Wavy
 * é um número = uma caixa, e trocar de número **não apaga** a caixa antiga —
 * ela fica na conta com todas as conversas dela. Como nem `/conversations` nem
 * `/contacts` aceitam filtro de caixa, a única forma de separar é agrupar aqui.
 *
 * A linha "indeterminada" não é enfeite: se o CRM não devolver a caixa em cada
 * conversa, **tudo** cai nela — e aí a conclusão honesta é que o Wavy não nos
 * dá como separar, em vez de fingir uma separação que não existe.
 */
export function montarRetrato(
  conversas: ConversationRow[],
  inboxes: CrmInbox[],
  conectadaId: string | null,
): LinhaDoRetrato[] {
  const contagem = new Map<string, number>();
  let semCaixa = 0;
  for (const c of conversas) {
    if (!c.inboxId) semCaixa++;
    else contagem.set(c.inboxId, (contagem.get(c.inboxId) ?? 0) + 1);
  }

  const linhas: LinhaDoRetrato[] = inboxes.map((i) => ({
    inboxId: i.id,
    rotulo: i.name?.trim() || `Caixa ${i.id}`,
    phoneNumber: i.phoneNumber,
    conversas: contagem.get(i.id) ?? 0,
    conectada: Boolean(conectadaId) && i.id === conectadaId,
    indeterminada: false,
  }));

  // Caixa que aparece nas conversas mas não veio na lista de inboxes: existe,
  // e some se a gente só mostrar o que a listagem devolveu.
  for (const [id, n] of contagem) {
    if (linhas.some((l) => l.inboxId === id)) continue;
    linhas.push({
      inboxId: id,
      rotulo: `Caixa ${id} (fora da listagem)`,
      phoneNumber: null,
      conversas: n,
      conectada: id === conectadaId,
      indeterminada: false,
    });
  }

  if (semCaixa > 0) {
    linhas.push({
      inboxId: null,
      rotulo: "Sem caixa identificada",
      phoneNumber: null,
      conversas: semCaixa,
      conectada: false,
      indeterminada: true,
    });
  }

  // Conectada primeiro, depois as maiores: o que interessa fica no topo.
  return linhas.sort((a, b) => {
    if (a.conectada !== b.conectada) return a.conectada ? -1 : 1;
    if (a.indeterminada !== b.indeterminada) return a.indeterminada ? 1 : -1;
    return b.conversas - a.conversas;
  });
}

/**
 * Dá para separar contatos por número nesta conta?
 *
 * Falso quando nenhuma conversa trouxe caixa — nesse caso qualquer recorte por
 * número seria invenção, e a tela precisa dizer isso em vez de mostrar filtro
 * que não filtra.
 */
export function daParaSepararPorNumero(conversas: ConversationRow[]): boolean {
  return conversas.some((c) => Boolean(c.inboxId));
}

/** Ids de contato que têm conversa na caixa informada. */
export function contatosDaCaixa(conversas: ConversationRow[], inboxId: string): Set<string> {
  const ids = new Set<string>();
  for (const c of conversas) {
    if (c.inboxId === inboxId && c.contactId) ids.add(c.contactId);
  }
  return ids;
}
