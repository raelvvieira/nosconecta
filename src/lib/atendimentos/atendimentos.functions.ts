import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { anexosDoEspelho, mapAttachments, type MessageAttachment } from "./anexos";
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

export const getWhatsappInstance = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<WhatsappInstance | null> => {
    // Consulta de status é informativa: se o CRM estiver lento, devolvemos
    // "desconhecido" em vez de deixar o erro estourar e apagar a tela inteira.
    try {
      const json = await callEdgeFunction("crm-whatsapp", {
        ownerId: context.ownerId,
        action: "status",
      });
      return json.instance ? mapInstance(json.instance) : null;
    } catch (err) {
      console.warn("[getWhatsappInstance] status indisponível:", err);
      return null;
    }
  });

export interface CrmInbox {
  id: string;
  name: string | null;
  phoneNumber: string | null;
  isWhatsapp: boolean;
}

export interface InboxSnapshot {
  inboxes: CrmInbox[];
  /** Caixa do número conectado agora, gravada pelo `connect`. */
  conectadaId: string | null;
  conectadaPhone: string | null;
}

/**
 * As caixas de WhatsApp da conta do CRM.
 *
 * O modelo do Wavy é um número = uma caixa, e trocar de número **não apaga** a
 * anterior: as conversas dela continuam na conta. Como nem `/contacts` nem
 * `/conversations` aceitam filtro de caixa, esta lista é a única forma de
 * separar quem é do número de hoje de quem veio de um número antigo.
 */
export const getWhatsappInboxes = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<InboxSnapshot> => {
    const json = await callEdgeFunction("crm-whatsapp", {
      ownerId: context.ownerId,
      action: "inboxes",
    });
    return {
      inboxes: json.inboxes ?? [],
      conectadaId: json.conectadaId ?? null,
      conectadaPhone: json.conectadaPhone ?? null,
    };
  });

export const connectWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { phoneNumber?: string }) => input)
  .handler(async ({ data, context }): Promise<WhatsappInstance> => {
    const json = await callEdgeFunction("crm-whatsapp", {
      ownerId: context.ownerId,
      action: "connect",
      phoneNumber: data.phoneNumber,
    });
    // O status vem do CRM: normalmente "connecting" (usuário ainda vai
    // escanear), mas pode já vir "open" quando a instância daquele número
    // já existia e estava conectada (`adopted`) — nesse caso não há QR.
    return {
      status: json.status === "open" ? "open" : "connecting",
      qrCode: json.qrCode ?? null,
      qrExpiresAt: null,
      phoneNumber: data.phoneNumber ?? null,
      lastError: null,
    };
  });

export const disconnectWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }) => {
    await callEdgeFunction("crm-whatsapp", { ownerId: context.ownerId, action: "disconnect" });
    return { ok: true };
  });

// Fallback manual: se o usuário do CRM não tiver permissão pra criar (nem
// listar) a inbox de WhatsApp, um admin cria pelo painel do CRM e cola o ID
// aqui.
export const setWhatsappInboxId = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { inboxId: string }) => input)
  .handler(async ({ data, context }) => {
    await callEdgeFunction("crm-whatsapp", {
      ownerId: context.ownerId,
      action: "set-inbox-id",
      inboxId: data.inboxId,
    });
    return { ok: true };
  });

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
  supabase: any,
  ownerId: string,
): Promise<ConversationRow[] | null> {
  // `as any` porque `types.ts` é gerado pelo Lovable e ainda não conhece as
  // tabelas do espelho. Mesmo escape dos cartões.
  const { data, error } = await (supabase as any)
    .from("wa_conversations")
    .select(
      "crm_conversation_id, crm_contact_id, inbox_id, status, unread_count, last_message_at, last_message_preview, wa_contacts(name, phone_raw, avatar_url)",
    )
    .eq("owner_id", ownerId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(5000);

  // Erro aqui NÃO derruba a tela: o espelho é uma otimização, e o CRM
  // continua sendo a fonte que sempre funcionou. Enquanto a migration não
  // roda, a tabela nem existe.
  if (error) {
    console.warn("[getConversations] espelho indisponível, lendo do CRM:", error.message);
    return null;
  }
  if (!data?.length) return null;

  return (data as any[]).map((row) => {
    const contato = row.wa_contacts ?? {};
    return {
      id: String(row.crm_conversation_id),
      contactId: row.crm_contact_id ? String(row.crm_contact_id) : null,
      inboxId: row.inbox_id ?? null,
      contactName: contato.name ?? null,
      phone: contato.phone_raw ?? null,
      avatarUrl: contato.avatar_url ?? null,
      lastMessagePreview: row.last_message_preview ?? null,
      lastMessageAt: row.last_message_at ?? null,
      unreadCount: Number(row.unread_count ?? 0),
      status: row.status,
    };
  });
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
    const espelhadas = await conversasDoEspelho(context.supabase, context.ownerId);
    if (espelhadas) return ordenarConversas(espelhadas);

    const json = await callEdgeFunction("crm-conversations", {
      ownerId: context.ownerId,
      action: "list",
    });
    // Leitura truncada (teto de páginas ou prazo) faz um contato que TEM
    // conversa ser lido como se não tivesse — e o disparo abriria uma nova para
    // ele. Quem impede isso de virar conversa duplicada é a checagem em
    // `_shared/whatsapp-send.ts`, que pergunta ao CRM antes de criar; este log
    // existe para o caso não ficar invisível quando acontecer.
    if (json.truncado) {
      console.warn(
        `[getConversations] leitura truncada em ${(json.conversations ?? []).length} conversas de ${json.total ?? "?"}`,
      );
    }
    return ordenarConversas((json.conversations ?? []).map(mapConversation));
  });

export const getMessages = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { conversationId: string }) => input)
  /**
   * A thread continua vindo do CRM, de propósito.
   *
   * O espelho serve a LISTA, que é o que era caro: ela pagina milhares de
   * conversas a cada abertura da tela. Uma thread é UMA chamada, e já era
   * rápida.
   *
   * Servi-la do espelho seria trocar rápido por velho: a tela repete a
   * consulta a cada 5 segundos enquanto a conversa está aberta, e o espelho
   * só é atualizado a cada 5 minutos pelo cron. Quem está atendendo veria a
   * resposta do paciente com minutos de atraso — pior do que hoje, em nome de
   * uma independência que a lista já entrega.
   *
   * Em compensação, a Edge Function GRAVA no espelho o que acabou de ler (ver
   * `handleMessages`): toda conversa que alguém abre é copiada na hora. As
   * conversas que importam entram no espelho primeiro, sem fila e sem espera.
   */
  .handler(async ({ data, context }): Promise<MessageRow[]> => {
    // ── E a exceção: conversa que nasceu na conexão própria ──────────────
    //
    // Aqui o `conversationId` é um `remoteJid` ("5548...@s.whatsapp.net"),
    // que o CRM nunca viu. Pedir a thread a ele devolve vazio, e a tela abre
    // em branco como se a conversa não tivesse mensagem nenhuma.
    //
    // O motivo de a thread não vir do espelho — o atraso de até 5 minutos do
    // cron — não vale para estas: o webhook grava no instante em que a
    // mensagem chega.
    const doEspelho = await mensagensDoEspelho(
      context.supabase,
      context.ownerId,
      data.conversationId,
    );
    if (doEspelho) return doEspelho;

    const json = await callEdgeFunction("crm-conversations", {
      ownerId: context.ownerId,
      action: "messages",
      conversationId: data.conversationId,
    });
    return (json.messages ?? []).map(mapMessage);
  });

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
): Promise<MessageRow[] | null> {
  try {
    const { data: conversa } = await supabase
      .from("wa_conversations")
      .select("origem")
      .eq("owner_id", ownerId)
      .eq("crm_conversation_id", conversationId)
      .limit(1)
      .maybeSingle();
    if (conversa?.origem !== "evolution") return null;

    const { data, error } = await supabase
      .from("wa_messages")
      .select("crm_message_id, from_me, body, is_private, attachments, sent_at")
      .eq("owner_id", ownerId)
      .eq("origem", "evolution")
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
    const json = await callEdgeFunction("crm-conversations", {
      ownerId: context.ownerId,
      action: "send",
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

// Estados do CRM: scheduled, executing, completed, failed, cancelled.
function mapScheduled(row: any): ScheduledMessage {
  return {
    id: String(row?.id),
    content: row?.payload?.content ?? null,
    scheduledFor: row?.scheduled_for ?? null,
    status: row?.status ?? "scheduled",
  };
}

export const scheduleWhatsappMessage = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator(
    (input: {
      conversationId: string;
      contactId?: string | null;
      text: string;
      scheduledFor: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    await callEdgeFunction("crm-conversations", {
      ownerId: context.ownerId,
      action: "schedule",
      conversationId: data.conversationId,
      contactId: data.contactId ?? null,
      content: data.text,
      scheduledFor: data.scheduledFor,
    });
    return { ok: true };
  });

export const getScheduledMessages = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { contactId: string }) => input)
  .handler(async ({ data, context }): Promise<ScheduledMessage[]> => {
    const json = await callEdgeFunction("crm-conversations", {
      ownerId: context.ownerId,
      action: "list-scheduled",
      contactId: data.contactId,
    });
    return (json.scheduled ?? []).map(mapScheduled);
  });

export const cancelScheduledMessage = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { scheduledId: string }) => input)
  .handler(async ({ data, context }) => {
    await callEdgeFunction("crm-conversations", {
      ownerId: context.ownerId,
      action: "cancel-scheduled",
      scheduledId: data.scheduledId,
    });
    return { ok: true };
  });
