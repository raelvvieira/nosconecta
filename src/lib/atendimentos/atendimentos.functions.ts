import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface WhatsappInstance {
  status: "disconnected" | "connecting" | "open" | "error";
  qrCode: string | null;
  qrExpiresAt: string | null;
  phoneNumber: string | null;
  lastError: string | null;
}

export interface ConversationRow {
  id: string;
  contactName: string | null;
  phone: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

export interface MessageRow {
  id: string;
  fromMe: boolean;
  body: string | null;
  status: "sent" | "received";
  timestamp: string;
}

async function callEdgeFunction(name: string, body: unknown) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");
  const res = await fetch(`${url}/functions/v1/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `Falha ao chamar ${name} (${res.status})`);
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

// Formato exato da conversa/mensagem do CRM ainda não confirmado com dados
// reais (a API é no estilo Chatwoot) — mapeamento defensivo com os nomes de
// campo mais prováveis, revisar assim que houver credenciais de teste.
function mapConversation(row: any): ConversationRow {
  const sender = row?.meta?.sender ?? row?.contact ?? {};
  const lastMessage = row?.last_non_activity_message ?? row?.last_message ?? null;
  const lastTs = lastMessage?.created_at ?? row?.timestamp ?? row?.last_activity_at ?? null;
  return {
    id: String(row?.id),
    contactName: sender?.name ?? null,
    phone: sender?.phone_number ?? sender?.phoneNumber ?? null,
    lastMessagePreview: lastMessage?.content ?? null,
    lastMessageAt: toIso(lastTs),
    unreadCount: row?.unread_count ?? 0,
  };
}

function mapMessage(row: any): MessageRow {
  const outgoing = row?.message_type === 1 || row?.message_type === "outgoing";
  return {
    id: String(row?.id),
    fromMe: outgoing,
    body: row?.content ?? null,
    status: outgoing ? "sent" : "received",
    timestamp: toIso(row?.created_at),
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
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WhatsappInstance | null> => {
    const json = await callEdgeFunction("crm-whatsapp", { ownerId: context.userId, action: "status" });
    return json.instance ? mapInstance(json.instance) : null;
  });

export const connectWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WhatsappInstance> => {
    const json = await callEdgeFunction("crm-whatsapp", { ownerId: context.userId, action: "connect" });
    return { status: "connecting", qrCode: json.qrCode ?? null, qrExpiresAt: null, phoneNumber: null, lastError: null };
  });

export const disconnectWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await callEdgeFunction("crm-whatsapp", { ownerId: context.userId, action: "disconnect" });
    return { ok: true };
  });

export const getConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ConversationRow[]> => {
    const json = await callEdgeFunction("crm-conversations", { ownerId: context.userId, action: "list" });
    return (json.conversations ?? []).map(mapConversation);
  });

export const getMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string }) => input)
  .handler(async ({ data, context }): Promise<MessageRow[]> => {
    const json = await callEdgeFunction("crm-conversations", {
      ownerId: context.userId,
      action: "messages",
      conversationId: data.conversationId,
    });
    return (json.messages ?? []).map(mapMessage);
  });

export const sendWhatsappMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string; text: string }) => input)
  .handler(async ({ data, context }) => {
    const json = await callEdgeFunction("crm-conversations", {
      ownerId: context.userId,
      action: "send",
      conversationId: data.conversationId,
      content: data.text,
    });
    return { ok: !!json.ok };
  });
