import type { GrupoDeConversa } from "./agruparConversas";
import type { ConversationRow } from "./atendimentos.functions";
import type { PipelineItem } from "./pipeline.functions";
import type { Deal, DealStatus } from "./deals.functions";
import { chavesDaNegociacao } from "./deal-key";

/**
 * Os recortes e a ordem da caixa de entrada.
 *
 * ── Por que módulo puro ──────────────────────────────────────────────────
 *
 * Filtro de lista é a classe de código que erra em silêncio: ninguém percebe
 * que um recorte escondeu alguém, porque o que sumiu não deixa rastro na tela.
 * Aqui o cálculo é exercitável sem navegador, e cada regra tem uma checagem.
 *
 * ── "Sem resposta" é `não lidas > 0` ─────────────────────────────────────
 *
 * E isso não é preguiça: a listagem de conversas do CRM devolve `id`, contato,
 * caixa, status, `unread_count` e `created_at`, e mais nada — confirmado com
 * dado real (ver `mapConversation`). Sem a última mensagem, não há como saber
 * quem falou por último.
 *
 * Consequência a saber antes de confiar nisso como fila de trabalho: quem LÊ a
 * mensagem no aplicativo do CRM sem responder zera o contador, e a conversa sai
 * do recorte. Um campo a mais na listagem do CRM (a última mensagem) resolveria
 * isso e, de quebra, a prévia de cada linha, que hoje é sempre "—".
 */

export const SEM_ETAPA = "sem-etapa";

export const ORDENACOES = ["sem-resposta", "recentes", "antigas", "nome"] as const;
export type Ordenacao = (typeof ORDENACOES)[number];

export const ROTULO_DA_ORDENACAO: Record<Ordenacao, string> = {
  "sem-resposta": "Sem resposta primeiro",
  recentes: "Mais recentes",
  antigas: "Mais antigas",
  nome: "Nome (A–Z)",
};

export interface Filtros {
  busca: string;
  /** Só quem tem mensagem não lida. */
  semResposta: boolean;
  status: "todas" | "abertas" | "encerradas";
  /** Vazio = não filtra. Mais de uma = qualquer uma serve (OU). */
  tagIds: string[];
  etapaIds: string[];
  desfechos: DealStatus[];
  vinculo: "todos" | "paciente" | "lead";
}

export const FILTROS_VAZIOS: Filtros = {
  busca: "",
  semResposta: false,
  status: "todas",
  tagIds: [],
  etapaIds: [],
  desfechos: [],
  vinculo: "todos",
};

export interface ContextoDaLista {
  /** `mapaDeTags` de `tags.functions` — chaveado por id de contato ou paciente. */
  tagsPorChave: Map<string, Set<string>>;
  /** Cards do funil, como vêm de `getPipelineItems`. */
  itens: PipelineItem[];
  deals: Deal[];
  /** `crm_contact_id` que já viraram ficha de paciente. */
  pacientes: Set<string>;
}

export const CONTEXTO_VAZIO: ContextoDaLista = {
  tagsPorChave: new Map(),
  itens: [],
  deals: [],
  pacientes: new Set(),
};

/**
 * O card do funil de uma conversa.
 *
 * Casa pelos DOIS lados — pelo id da conversa e pelo id do contato — porque o
 * card pode ter nascido de um ou do outro. Casar só por conversa fazia um card
 * criado a partir do contato ficar invisível, mostrando "Sem etapa" no
 * cabeçalho; escolher uma etapa ali criaria um SEGUNDO card para a mesma
 * pessoa.
 *
 * Esta função existe para o cabeçalho e o filtro usarem a MESMA regra: com duas
 * cópias, a lista diria que alguém está numa etapa e o cabeçalho diria outra.
 */
export function itemDoFunil(itens: PipelineItem[], conversa: ConversationRow): PipelineItem | null {
  return (
    itens.find(
      (i) =>
        (i.type === "conversation" && i.itemId === conversa.id) ||
        (i.type === "contact" && conversa.contactId && i.itemId === conversa.contactId),
    ) ?? null
  );
}

/** A negociação de uma conversa: o card manda, a conversa é a reserva. */
export function negociacaoDa(
  deals: Deal[],
  itens: PipelineItem[],
  conversa: ConversationRow,
): Deal | null {
  const chaves = chavesDaNegociacao({
    pipelineItemId: itemDoFunil(itens, conversa)?.id,
    conversationId: conversa.id,
  });
  return chaves.map((c) => deals.find((d) => d.itemId === c)).find(Boolean) ?? null;
}

/** Todas as conversas de um grupo — a principal e as recolhidas. */
function conversasDo(g: GrupoDeConversa): ConversationRow[] {
  return [g.principal, ...g.outras];
}

export function filtrarGrupos(
  grupos: GrupoDeConversa[],
  f: Filtros,
  ctx: ContextoDaLista,
): GrupoDeConversa[] {
  const q = f.busca.trim().toLocaleLowerCase("pt-BR");
  const digitos = f.busca.replace(/\D/g, "");

  return grupos.filter((g) => {
    // ── Busca ──────────────────────────────────────────────────────────
    if (q) {
      const nome = (g.principal.contactName ?? "").toLocaleLowerCase("pt-BR");
      const fone = (g.principal.phone ?? "").replace(/\D/g, "");
      const acha = nome.includes(q) || (Boolean(digitos) && fone.includes(digitos));
      if (!acha) return false;
    }

    if (f.semResposta && g.naoLidas === 0) return false;

    // ── Status ─────────────────────────────────────────────────────────
    // Sobre o GRUPO, não sobre a principal: uma pessoa com uma conversa
    // encerrada e uma aberta está aberta. Exigir que todas fossem do status
    // pedido faria justamente quem mais conversou sumir dos dois recortes.
    if (f.status !== "todas") {
      const todas = conversasDo(g);
      const temAberta = todas.some((c) => c.status !== "resolved");
      if (f.status === "abertas" && !temAberta) return false;
      if (f.status === "encerradas" && temAberta) return false;
    }

    // ── Etiqueta ───────────────────────────────────────────────────────
    if (f.tagIds.length > 0) {
      const chave = g.principal.contactId;
      const tags = chave ? ctx.tagsPorChave.get(chave) : undefined;
      if (!tags || !f.tagIds.some((t) => tags.has(t))) return false;
    }

    // ── Etapa do funil ─────────────────────────────────────────────────
    if (f.etapaIds.length > 0) {
      const etapas = conversasDo(g).map((c) => itemDoFunil(ctx.itens, c)?.stageId ?? SEM_ETAPA);
      if (!f.etapaIds.some((e) => etapas.includes(e))) return false;
    }

    // ── Desfecho ───────────────────────────────────────────────────────
    // Sem negociação gravada, a pessoa está "em negociação" — é o mesmo padrão
    // que o cabeçalho da conversa mostra, e trocar isso aqui faria o filtro
    // discordar do rótulo que a tela exibe.
    if (f.desfechos.length > 0) {
      const status = conversasDo(g).map(
        (c) => negociacaoDa(ctx.deals, ctx.itens, c)?.status ?? "negotiating",
      );
      if (!f.desfechos.some((d) => status.includes(d))) return false;
    }

    // ── Paciente ou lead ───────────────────────────────────────────────
    if (f.vinculo !== "todos") {
      const ehPaciente = Boolean(g.principal.contactId && ctx.pacientes.has(g.principal.contactId));
      if (f.vinculo === "paciente" && !ehPaciente) return false;
      if (f.vinculo === "lead" && ehPaciente) return false;
    }

    return true;
  });
}

/**
 * A ordem da lista.
 *
 * `sem-resposta` é o padrão: uma caixa de entrada existe para mostrar o que
 * precisa de ação, e quem escreveu e não foi respondido é exatamente isso.
 * O efeito colateral é real e assumido — uma conversa de semanas atrás com uma
 * não lida sobe acima do atendimento de hoje. Ela sobe porque alguém está
 * esperando desde então.
 *
 * Dentro de cada bloco, e em todo empate, o desempate é sempre o mesmo: mais
 * recente primeiro. Sem desempate estável a lista embaralharia sozinha a cada
 * recarga de 15 segundos, e a linha que a pessoa ia clicar mudaria de lugar.
 */
export function ordenarGrupos(grupos: GrupoDeConversa[], ordem: Ordenacao): GrupoDeConversa[] {
  const copia = [...grupos];
  const quando = (g: GrupoDeConversa) => g.principal.lastMessageAt ?? "";
  const maisRecente = (a: GrupoDeConversa, b: GrupoDeConversa) =>
    quando(b).localeCompare(quando(a));

  switch (ordem) {
    case "sem-resposta":
      return copia.sort((a, b) => {
        const peso = (g: GrupoDeConversa) => (g.naoLidas > 0 ? 0 : 1);
        if (peso(a) !== peso(b)) return peso(a) - peso(b);
        return maisRecente(a, b);
      });
    case "antigas":
      return copia.sort((a, b) => quando(a).localeCompare(quando(b)));
    case "nome":
      return copia.sort((a, b) => {
        const nome = (g: GrupoDeConversa) => g.principal.contactName ?? g.principal.phone ?? "";
        // `localeCompare` com `pt-BR`: sem isso "Álvaro" cai depois de "Zulmira".
        const r = nome(a).localeCompare(nome(b), "pt-BR", { sensitivity: "base" });
        return r !== 0 ? r : maisRecente(a, b);
      });
    case "recentes":
    default:
      return copia.sort(maisRecente);
  }
}

/** Quantos recortes estão ligados — o número na bolinha do botão de filtro. */
export function contarFiltrosAtivos(f: Filtros): number {
  let n = 0;
  if (f.semResposta) n++;
  if (f.status !== "todas") n++;
  if (f.vinculo !== "todos") n++;
  n += f.tagIds.length + f.etapaIds.length + f.desfechos.length;
  return n;
}
