import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { mapAttachments, type MessageAttachment } from "./anexos";

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
    throw new Error(json?.error ?? `Falha ao chamar ${name} (${res.status})`);
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
    status: row?.status === "resolved" ? "resolved" : row?.status === "pending" ? "pending" : "open",
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
    const json = await callEdgeFunction("crm-whatsapp", { ownerId: context.ownerId, action: "status" });
    return json.instance ? mapInstance(json.instance) : null;
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
    await callEdgeFunction("crm-whatsapp", { ownerId: context.ownerId, action: "set-inbox-id", inboxId: data.inboxId });
    return { ok: true };
  });

export const getConversations = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<ConversationRow[]> => {
    const json = await callEdgeFunction("crm-conversations", { ownerId: context.ownerId, action: "list" });
    const linhas: ConversationRow[] = (json.conversations ?? []).map(mapConversation);
    // Abertas primeiro, e dentro de cada grupo a mais recente no topo. A ordem
    // importa agora que as resolvidas também vêm: sem isto, uma conversa
    // encerrada há meses poderia aparecer acima do atendimento de hoje, só
    // porque o CRM devolveu naquela ordem.
    const peso = (c: ConversationRow) => (c.status === "resolved" ? 1 : 0);
    return linhas.sort(
      (a, b) => peso(a) - peso(b) || (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""),
    );
  });

export const getMessages = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { conversationId: string }) => input)
  .handler(async ({ data, context }): Promise<MessageRow[]> => {
    const json = await callEdgeFunction("crm-conversations", {
      ownerId: context.ownerId,
      action: "messages",
      conversationId: data.conversationId,
    });
    return (json.messages ?? []).map(mapMessage);
  });

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
    (input: { conversationId: string; contactId?: string | null; text: string; scheduledFor: string }) => input,
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
