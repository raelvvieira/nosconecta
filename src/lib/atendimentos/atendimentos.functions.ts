import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { anexosDoEspelho, mapAttachments, type MessageAttachment } from "./anexos";
import { juntarMensagens } from "./thread";
import { erroDaEdgeFunction } from "@/lib/atendimentos/erro-de-edge-function";

export type { MessageAttachment };

export interface WhatsappInstance {
  status: "disconnected" | "connecting" | "open" | "error";
  qrCode: string | null;
  qrExpiresAt: string | null;
  phoneNumber: string | null;
  lastError: string | null;
}

export interface ConversationRow {
  id: string;
  // Id do contato no CRM — exigido por /scheduled_actions (agendamento) e
  // pelas consultas por contato. Vinha na resposta e era descartado.
  contactId: string | null;
  /**
   * Caixa a que a conversa pertence — ou seja, por qual NÚMERO ela entrou.
   *
   * `null` quando o CRM não informa. É o dado que decide se um contato é do
   * número conectado hoje ou de um número anterior, e ele vinha sendo
   * descartado no mapeamento junto com todo o resto da resposta.
   */
  inboxId: string | null;
  contactName: string | null;
  phone: string | null;
  /**
   * Foto de perfil do contato, quando o CRM informa.
   *
   * `thumbnail` é o campo do Chatwoot, que é a base deste CRM (mesmos
   * `inbox_id`, `contact_inbox`, `source_id`, `message_type` 0/1). Ainda não
   * confirmado com o time do CRM que ele vem preenchido a partir do WhatsApp —
   * até lá, `null` aqui significa "não veio", e a tela mostra as iniciais como
   * sempre mostrou.
   */
  avatarUrl: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  /**
   * Situação da conversa no CRM.
   *
   * Passou a existir quando a listagem deixou de pedir só as abertas: até
   * então o CRM filtrava `status=open` por padrão e nós nem sabíamos, então
   * toda conversa que chegava aqui era aberta e o campo não fazia falta. Agora
   * que as resolvidas também vêm, sem isto não haveria como distinguir uma da
   * outra na tela.
   */
  status: "open" | "resolved" | "pending";
}

export interface OutgoingAttachment {
  name: string;
  type: string;
  /** Base64 puro, sem o prefixo `data:...;base64,`. */
  data: string;
  /** Áudio gravado na hora — faz o WhatsApp exibir como mensagem de voz. */
  isRecordedAudio?: boolean;
}

export interface MessageRow {
  id: string;
  fromMe: boolean;
  body: string | null;
  /**
   * Arquivos da mensagem.
   *
   * Existia um buraco aqui: a leitura pegava só `content` e descartava o
   * resto, então NENHUMA imagem aparecia no chat — nem a que o paciente
   * mandava, nem a que a clínica enviava pelo compositor daqui. O disparo de
   * 25/08 saiu com a foto legendada para 199 pessoas (está gravado em
   * `whatsapp_broadcast_targets.sent_via`) e mesmo assim a conversa parecia
   * só texto, porque o problema nunca foi o envio.
   */
  attachments: MessageAttachment[];
  status: "sent" | "received";
  timestamp: string;
  // Nota interna: registrada na conversa dentro do CRM, nunca enviada ao
  // contato. Precisa aparecer diferente na thread, senão parece uma
  // mensagem que o paciente recebeu.
  isPrivate: boolean;
}

/** Um timeout do CRM não é um erro do sistema — é lentidão momentânea do
 *  outro lado. Damos uma segunda chance e, se ainda assim falhar, devolvemos
 *  uma mensagem legível em vez de deixar o `TimeoutError` cru estourar na
 *  tela. */
async function callEdgeFunction(name: string, body: unknown, tentativa = 0): Promise<any> {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");
  let res: Response;
  try {
    res = await fetch(`${url}/functions/v1/${name}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(55_000),
    });
  } catch (err) {
    if (tentativa === 0) return callEdgeFunction(name, body, 1);
    throw new Error("O CRM demorou demais para responder. Tente novamente em instantes.");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = String(json?.error ?? "");
    if ((res.status >= 500 || /timed out|timeout/i.test(msg)) && tentativa === 0) {
      return callEdgeFunction(name, body, 1);
    }
    throw erroDaEdgeFunction(name, res.status, json);
  }
  return json;
}

function mapInstance(row: any): WhatsappInstance {
  return {
    status: row?.whatsapp_status ?? "disconnected",
    qrCode: row?.qr_code ?? null,
    qrExpiresAt: row?.qr_expires_at ?? null,
    phoneNumber: row?.phone_number ?? null,
    lastError: row?.last_error ?? null,
  };
}

// Formato confirmado com dado real do CRM: o contato vem em `row.contact`
// (não `meta.sender`), e a lista de conversas não traz preview/timestamp da
// última mensagem — só `created_at` (criação da conversa, não da última
// mensagem) e `unread_count`. Sem endpoint de "última mensagem" na lista,
// não dá pra mostrar preview real por enquanto.
function mapConversation(row: any): ConversationRow {
  const contact = row?.contact ?? {};
  // O nome do campo não está confirmado com o Wavy: tentamos as três formas
  // plausíveis e ficamos com nulo em vez de inventar uma caixa.
  const inbox = row?.inbox_id ?? row?.inboxId ?? row?.inbox?.id ?? null;
  return {
    id: String(row?.id),
    contactId: contact?.id ? String(contact.id) : null,
    inboxId: inbox ? String(inbox) : null,
    contactName: contact?.name ?? null,
    phone: contact?.phone_number ?? null,
    // Ler um campo que talvez não exista é inofensivo — vira `null` e a tela
    // segue com as iniciais. (Diferente de MANDAR um campo inventado numa
    // requisição, que faz o CRM recusar a chamada inteira.) `thumbnail` é o
    // nome no Chatwoot; `avatar_url` fica como apelido comum, que não custa
    // nada tentar.
    avatarUrl: contact?.thumbnail || contact?.avatar_url || null,
    lastMessagePreview: null,
    lastMessageAt: toIso(row?.created_at),
    unreadCount: row?.unread_count ?? 0,
    status:
      row?.status === "resolved" ? "resolved" : row?.status === "pending" ? "pending" : "open",
  };
}

// message_type: 0 = incoming (do contato), 1 = outgoing (da clínica).
// Aceita número ou string porque o valor chegou como string em teste real —
// com a comparação estrita em número, TODA mensagem caía como recebida e as
// respostas da clínica apareciam do lado errado da conversa.
function mapMessage(row: any): MessageRow {
  const type = row?.message_type;
  const outgoing = type === 1 || type === "1" || type === "outgoing";
  return {
    id: String(row?.id),
    fromMe: outgoing,
    body: row?.content ?? null,
    attachments: mapAttachments(row?.attachments),
    status: outgoing ? "sent" : "received",
    timestamp: toIso(row?.created_at),
    isPrivate: row?.private === true || row?.private === "true",
  };
}

function toIso(value: unknown): string {
  if (!value) return new Date().toISOString();
  if (typeof value === "string") return value;
  const n = Number(value);
  if (!n) return new Date().toISOString();
  const ms = n < 10_000_000_000 ? n * 1000 : n; // epoch seconds vs ms
  return new Date(ms).toISOString();
}

/**
 * A conexão de WhatsApp do CRM: não existe mais.
 *
 * Aqui viviam `getWhatsappInstance`, `getWhatsappInboxes`, `connectWhatsapp`,
 * `disconnectWhatsapp` e `setWhatsappInboxId` — a conexão feita PELO CRM, com
 * o modelo de "um número = uma caixa" dele, e a lista de caixas que existia só
 * para separar quem era do número de hoje de quem veio de um número antigo.
 *
 * Desde 18/09 o número da clínica é pareado direto na nossa conexão
 * (`wa-conexao`, `getWhatsappInstanceEvolution`), e a caixa do CRM ficou vazia:
 * o filtro por caixa já não filtrava nada e a tela de conectar já não
 * conectava. Código que não tem como funcionar é o que faz a próxima auditoria
 * custar caro.
 */

/**
 * A lista de conversas, lida do espelho local.
 *
 * ── Por que daqui e não do CRM ──────────────────────────────────────────
 *
 * A leitura do CRM é paginada e atravessa a rede a cada abertura da tela: o
 * chat inteiro espera por ela. E ela traz dois defeitos de nascença que não
 * dá para consertar do lado de lá — a listagem não inclui a última mensagem
 * (por isso TODA linha mostra "—") e o `created_at` que ela devolve é o da
 * CONVERSA, não o da última mensagem, então a ordem da caixa de entrada
 * está errada desde sempre.
 *
 * No espelho os dois são mantidos por gatilho sobre as mensagens de verdade.
 *
 * Devolve `null` quando o espelho ainda não tem nada — aí quem chama cai no
 * CRM, como sempre fez. Espelho vazio é "a carga ainda não rodou", não "esta
 * clínica não tem conversas".
 */
async function conversasDoEspelho(
  supabase: SupabaseDoContexto,
  ownerId: string,
): Promise<ConversationRow[] | null> {
  // DUAS consultas, e não um `select` com `wa_contacts(...)` embutido.
  //
  // O embutido é o jeito natural no PostgREST e era o que estava aqui — mas
  // ele exige uma CHAVE ESTRANGEIRA entre as duas tabelas, e ela não existe:
  // o espelho liga conversa e contato por `(owner_id, origem, crm_contact_id)`,
  // uma chave natural composta que nunca virou constraint. A resposta era
  // sempre a mesma:
  //
  //   PGRST200 — Could not find a relationship between 'wa_conversations'
  //   and 'wa_contacts' in the schema cache
  //
  // Ou seja: esta função NUNCA devolveu nada. Todo dia, desde que foi
  // escrita, ela caía no CRM — e o `catch` logo abaixo, que eu pus como rede
  // de segurança, foi exatamente o que escondeu isso por dias. Só apareceu
  // quando o CRM deixou de ter o WhatsApp e a caixa de entrada parou de
  // receber conversa nova.
  //
  // Juntar aqui no código não precisa de migration, não depende de o banco
  // conhecer a relação, e funciona para as duas origens.
  const { data: conversas, error } = await supabase
    .from("wa_conversations")
    .select(
      "origem, crm_conversation_id, crm_contact_id, inbox_id, status, unread_count, last_message_at, last_message_preview",
    )
    .eq("owner_id", ownerId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(5000);

  if (error) {
    // Erro aqui NÃO derruba a tela — mas também não passa despercebido.
    console.error("[getConversations] espelho FALHOU, lendo do CRM:", error.code, error.message);
    return null;
  }
  if (!conversas?.length) return null;

  // Só os contatos DESTAS conversas, e em lotes.
  //
  // A primeira versão pedia a agenda inteira com `.limit(20000)` e ignorava o
  // erro — e o resultado na tela foi toda conversa chamada "Contato", com os
  // nomes intactos no banco. Pedir 4 mil linhas para usar mil, confiando num
  // teto que não é nosso, é frágil de um jeito que não aparece em teste
  // nenhum: some o nome, não some a conversa.
  //
  // São ~1050 ids; em lotes de 200 a URL não estoura e as chamadas vão
  // juntas.
  const ids = [
    ...new Set(
      (conversas as LinhaDeConversa[])
        .map((c) => c.crm_contact_id)
        .filter((id): id is string => !!id),
    ),
  ];

  const lotes: string[][] = [];
  for (let i = 0; i < ids.length; i += 200) lotes.push(ids.slice(i, i + 200));

  const respostas = await Promise.all(
    lotes.map((lote) =>
      supabase
        .from("wa_contacts")
        .select("origem, crm_contact_id, name, phone_raw, avatar_url")
        .eq("owner_id", ownerId)
        .in("crm_contact_id", lote),
    ),
  );

  // A chave inclui a ORIGEM: o mesmo `crm_contact_id` pode existir nas duas,
  // e sem ela o contato de uma apareceria no nome da conversa da outra.
  const porContato = new Map<string, LinhaDeContato>();
  for (const resposta of respostas) {
    if (resposta.error) {
      // Sem o nome a conversa ainda aparece — mas o motivo não pode sumir,
      // que foi exatamente como "Contato" em toda linha durou até alguém
      // reparar na tela.
      console.error("[getConversations] contatos do espelho:", resposta.error.message);
      continue;
    }
    for (const c of (resposta.data ?? []) as LinhaDeContato[]) {
      porContato.set(`${c.origem}:${c.crm_contact_id}`, c);
    }
  }

  return (conversas as LinhaDeConversa[]).map((row) => {
    const contato = row.crm_contact_id
      ? porContato.get(`${row.origem}:${row.crm_contact_id}`)
      : undefined;
    return {
      id: String(row.crm_conversation_id),
      contactId: row.crm_contact_id ? String(row.crm_contact_id) : null,
      inboxId: row.inbox_id ?? null,
      contactName: contato?.name ?? null,
      phone: contato?.phone_raw ?? null,
      avatarUrl: contato?.avatar_url ?? null,
      lastMessagePreview: row.last_message_preview ?? null,
      lastMessageAt: row.last_message_at ?? null,
      unreadCount: Number(row.unread_count ?? 0),
      status: row.status,
    };
  });
}

/** Só o que a lista pede de `wa_conversations`. */
interface LinhaDeConversa {
  origem: string;
  crm_conversation_id: string;
  crm_contact_id: string | null;
  inbox_id: string | null;
  status: ConversationRow["status"];
  unread_count: number | null;
  last_message_at: string | null;
  last_message_preview: string | null;
}

/** Só o que a lista pede de `wa_contacts`. */
interface LinhaDeContato {
  origem: string;
  crm_contact_id: string;
  name: string | null;
  phone_raw: string | null;
  avatar_url: string | null;
}

/**
 * Abertas primeiro, e dentro de cada grupo a mais recente no topo.
 *
 * A ordem importa desde que as resolvidas também passaram a vir: sem ela uma
 * conversa encerrada há meses pode aparecer acima do atendimento de hoje, só
 * porque a fonte devolveu naquela ordem. Vale para as duas fontes — o banco
 * já ordena por data, mas não sabe que resolvida desce.
 */
function ordenarConversas(linhas: ConversationRow[]): ConversationRow[] {
  const peso = (c: ConversationRow) => (c.status === "resolved" ? 1 : 0);
  return linhas.sort(
    (a, b) => peso(a) - peso(b) || (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""),
  );
}

export const getConversations = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<ConversationRow[]> => {
    // O espelho é a fonte, e a única.
    //
    // Havia aqui uma reserva que lia o CRM quando o espelho falhasse. Ela era
    // pior do que não ter: quando a leitura do espelho quebrou por um erro de
    // consulta, o `catch` a mandou calada para o CRM e a caixa de entrada
    // passou DIAS mostrando os dados de lá — com todo mundo chamado "Contato"
    // — sem nenhum erro na tela para explicar. Agora o erro sobe.
    const espelhadas = await conversasDoEspelho(context.supabase, context.ownerId);
    return ordenarConversas(espelhadas ?? []);
  });

export const getMessages = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { conversationId: string }) => input)
  /**
   * A thread de um NÚMERO — não de uma conversa.
   *
   * Cada fonte continua sendo a que sabe mais sobre a sua origem: a conversa
   * do CRM vem do CRM (o espelho só tem cópia parcial dela — mediana de uma
   * mensagem por conversa, porque a cópia é feita quando alguém abre), e a da
   * conexão própria vem do espelho, onde o webhook grava no instante em que a
   * mensagem chega.
   *
   * Buscar do espelho o que é do CRM perderia histórico em silêncio, que é o
   * pior jeito de perder.
   */
  .handler(async ({ data, context }): Promise<MessageRow[]> => {
    // ── Todas as conversas DESTE NÚMERO, numa thread só ──────────────────
    //
    // No WhatsApp o número é a conversa. As linhas separadas vinham do CRM —
    // encerrar e reabrir criava outra, e um contato salvo duas vezes criava
    // mais uma —, e a caixa de entrada já as mostra como uma linha só. Se a
    // thread continuasse abrindo apenas uma delas, "uma conversa" seria
    // verdade na lista e mentira ao abrir: metade do histórico ficaria fora
    // da tela sem nada dizer que existe.
    //
    // Na base são 88 pessoas com mais de uma conversa, no máximo 4. Para as
    // outras 868 isto é uma consulta a mais no espelho e nada mudou.
    const irmas = await conversasDoMesmoNumero(
      context.supabase,
      context.ownerId,
      data.conversationId,
    );

    const partes = await Promise.all(irmas.map((irma) => mensagensDaConversa(context, irma)));
    return juntarMensagens(partes);
  });

/** Uma conversa a buscar, e de onde. */
interface ConversaIrma {
  id: string;
  origem: string;
}

/**
 * As conversas que são a mesma pessoa — o mesmo telefone.
 *
 * Devolve sempre pelo menos a própria, inclusive quando o espelho não conhece
 * o id (conversa que só existe no CRM) ou quando a consulta falha. Juntar é
 * melhoria; não juntar não pode virar tela vazia.
 */
async function conversasDoMesmoNumero(
  supabase: SupabaseDoContexto,
  ownerId: string,
  conversationId: string,
): Promise<ConversaIrma[]> {
  const sozinha: ConversaIrma[] = [{ id: conversationId, origem: "desconhecida" }];
  try {
    const { data: atual } = await supabase
      .from("wa_conversas_por_pessoa")
      .select("pessoa")
      .eq("owner_id", ownerId)
      .eq("crm_conversation_id", conversationId)
      .limit(1)
      .maybeSingle();
    if (!atual?.pessoa) return sozinha;

    const { data, error } = await supabase
      .from("wa_conversas_por_pessoa")
      .select("crm_conversation_id, origem")
      .eq("owner_id", ownerId)
      .eq("pessoa", atual.pessoa)
      .limit(20);
    if (error) throw new Error(error.message);
    if (!data?.length) return sozinha;

    return (data as { crm_conversation_id: string; origem: string }[]).map((r) => ({
      id: String(r.crm_conversation_id),
      origem: r.origem,
    }));
  } catch (e) {
    console.error("[getMessages] não deu para achar as conversas do número:", e);
    return sozinha;
  }
}

/**
 * As mensagens de UMA conversa.
 *
 * As duas origens saem do mesmo lugar agora. A da conexão própria sempre saiu:
 * o id dela é um `remoteJid`, que o CRM nunca viu. A herdada era lida ao vivo
 * lá, com o espelho como reserva — e essa leitura já não traz nada, porque a
 * conta não tem mais caixa de WhatsApp desde 18/09.
 *
 * O que ficou é a cópia: 4.456 mensagens e 1.051 conversas, paradas no dia da
 * migração. É o histórico inteiro que existia para ser copiado.
 */
async function mensagensDaConversa(
  context: { supabase: SupabaseDoContexto; ownerId: string },
  conversa: ConversaIrma,
): Promise<MessageRow[]> {
  return (
    (await mensagensDoEspelho(context.supabase, context.ownerId, conversa.id, conversa.origem)) ??
    []
  );
}

/** O cliente do Supabase como o contexto o entrega — sem os tipos gerados,
 *  porque `types.ts` é do Lovable e as consultas aqui usam `as any` desde o
 *  primeiro cartão do espelho. */
type SupabaseDoContexto = {
  from: (tabela: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

/** Só o que esta leitura pede da linha de `wa_messages`. */
interface LinhaDoEspelho {
  crm_message_id: string;
  from_me: boolean;
  body: string | null;
  is_private: boolean;
  attachments: unknown;
  sent_at: string;
}

/**
 * A thread lida do espelho, ou `null` quando esta conversa não é de lá.
 *
 * `null` é "pergunte ao CRM", e é o que acontece para toda conversa que veio
 * do Wavy — inclusive quando a consulta falha. O espelho aqui só pode
 * ADICIONAR um caminho; ele nunca tira o que já funcionava.
 */
async function mensagensDoEspelho(
  supabase: SupabaseDoContexto,
  ownerId: string,
  conversationId: string,
  origem: string,
): Promise<MessageRow[] | null> {
  try {
    const { data, error } = await supabase
      .from("wa_messages")
      .select("crm_message_id, from_me, body, is_private, attachments, sent_at")
      .eq("owner_id", ownerId)
      .eq("origem", origem)
      .eq("crm_conversation_id", conversationId)
      .order("sent_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);

    return (data ?? []).map((row: LinhaDoEspelho) => ({
      id: String(row.crm_message_id),
      fromMe: row.from_me === true,
      body: row.body ?? null,
      attachments: anexosDoEspelho(row.attachments),
      status: row.from_me === true ? ("sent" as const) : ("received" as const),
      timestamp: row.sent_at,
      isPrivate: row.is_private === true,
    }));
  } catch (e) {
    // Conversa da Evolution cujo espelho falhou vai cair no CRM e voltar
    // vazia — mas vazia com o motivo no log é melhor do que a tela inteira
    // quebrando numa consulta que é, por desenho, opcional.
    console.warn("[getMessages] espelho indisponível:", e instanceof Error ? e.message : e);
    return null;
  }
}

export const sendWhatsappMessage = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  // isPrivate = nota interna: registra na conversa dentro do CRM sem enviar
  // nada pro contato no WhatsApp.
  //
  // attachments vão em base64 porque server function e Edge Function só
  // trafegam JSON; a Edge Function remonta o arquivo e envia como
  // multipart/form-data pro CRM (não existe upload separado lá).
  .inputValidator(
    (input: {
      conversationId: string;
      text: string;
      isPrivate?: boolean;
      attachments?: OutgoingAttachment[];
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const json = await callEdgeFunction("wa-enviar", {
      ownerId: context.ownerId,
      conversationId: data.conversationId,
      content: data.text,
      isPrivate: !!data.isPrivate,
      attachments: data.attachments ?? [],
    });
    return { ok: !!json.ok };
  });

export interface ScheduledMessage {
  id: string;
  content: string | null;
  scheduledFor: string | null;
  status: string;
}

/**
 * A mensagem agendada do chat.
 *
 * ── Onde ela morava ─────────────────────────────────────────────────────
 *
 * Em `/api/v1/scheduled_actions`, na conta do CRM — um recurso genérico dele,
 * do qual só usávamos "mandar mensagem". Apagar a conta apagaria junto tudo o
 * que estivesse marcado para sair.
 *
 * ── Onde ela mora agora ─────────────────────────────────────────────────
 *
 * Na MESMA fila do disparo (`whatsapp_broadcasts` + `whatsapp_broadcast_targets`).
 * Uma mensagem agendada é uma fila de uma pessoa só, marcada para o futuro —
 * e a fila já sabe tudo o que o agendamento precisa: o cron que roda de minuto
 * em minuto, o cancelamento, o registro da falha, a cota do dia e o mesmo
 * caminho de envio.
 *
 * Criar uma tabela própria significaria escrever de novo cada uma dessas
 * coisas, e descobrir uma a uma, em produção, quais eu tinha esquecido.
 */
export const scheduleWhatsappMessage = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator(
    (input: {
      conversationId: string;
      contactId?: string | null;
      /** O número de quem recebe. É por ele que o envio endereça. */
      phone?: string | null;
      contactName?: string | null;
      text: string;
      scheduledFor: string;
    }) => {
      if (!input.text?.trim()) throw new Error("Escreva a mensagem antes de agendar.");
      const quando = new Date(input.scheduledFor).getTime();
      if (!Number.isFinite(quando)) throw new Error("Data de envio inválida.");
      // Um minuto de folga: o cron acorda de minuto em minuto, e marcar para
      // "agora" faria a mensagem sair antes de quem agendou terminar de ler a
      // confirmação na tela.
      if (quando < Date.now() + 60_000) {
        throw new Error("Escolha um horário pelo menos um minuto à frente.");
      }
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const { callBroadcast } = await import("./broadcast.server");
    await callBroadcast({
      ownerId: context.ownerId,
      action: "create",
      message: data.text,
      name: "Mensagem agendada",
      iniciarEm: data.scheduledFor,
      targets: [
        {
          contactId: data.contactId || data.conversationId,
          conversationId: data.conversationId,
          name: data.contactName ?? null,
          phone: data.phone ?? null,
        },
      ],
    });
    return { ok: true };
  });

/**
 * O que ainda está marcado para sair para esta pessoa.
 *
 * Lê a fila pela CONVERSA, e não pelo contato: o id de contato mudou de
 * significado quando a base saiu do CRM, e a conversa é o que a tela do chat
 * tem em mãos de qualquer jeito.
 */
export const getScheduledMessages = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { conversationId: string }) => input)
  .handler(async ({ data, context }): Promise<ScheduledMessage[]> => {
    const supabase: any = context.supabase;
    const { data: alvos, error } = await supabase
      .from("whatsapp_broadcast_targets")
      .select("id, status, scheduled_for, broadcast_id")
      .eq("owner_id", context.ownerId)
      .eq("conversation_id", data.conversationId)
      .eq("status", "pending")
      .order("scheduled_for", { ascending: true });
    if (error) throw new Error(error.message);
    if (!alvos?.length) return [];

    // O texto mora no lote, não no alvo — é por isso que corrigir a mensagem de
    // um disparo em andamento funciona.
    const { data: lotes, error: erroLotes } = await supabase
      .from("whatsapp_broadcasts")
      .select("id, message, status")
      .eq("owner_id", context.ownerId)
      .in("id", [...new Set(alvos.map((a: any) => a.broadcast_id))]);
    if (erroLotes) throw new Error(erroLotes.message);
    const porLote = new Map<string, { message: string | null; status: string }>(
      (lotes ?? []).map((l: any) => [String(l.id), { message: l.message, status: l.status }]),
    );

    return (
      alvos
        // Lote cancelado ainda deixa o alvo como `pending` até o próximo tique.
        // Mostrar o que não vai sair faria alguém contar com uma mensagem morta.
        .filter((a: any) => porLote.get(String(a.broadcast_id))?.status === "running")
        .map((a: any) => ({
          id: String(a.id),
          content: porLote.get(String(a.broadcast_id))?.message ?? null,
          scheduledFor: a.scheduled_for ?? null,
          // A tela filtra por "scheduled" — é o nome que ela conhece.
          status: "scheduled",
        }))
    );
  });

export const cancelScheduledMessage = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { scheduledId: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { error } = await supabase
      .from("whatsapp_broadcast_targets")
      .update({ status: "skipped", error: "Agendamento cancelado" })
      .eq("id", data.scheduledId)
      .eq("owner_id", context.ownerId)
      // Só o que ainda não saiu. Sem isto, cancelar depois do envio marcaria
      // como cancelada uma mensagem que o paciente já recebeu.
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
