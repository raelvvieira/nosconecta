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
  remoteJid: string;
  contactName: string | null;
  patientId: string | null;
  patientName: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

export interface MessageRow {
  id: string;
  fromMe: boolean;
  body: string | null;
  messageType: string;
  status: "sending" | "sent" | "received" | "failed";
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
    status: row?.status ?? "disconnected",
    qrCode: row?.qr_code ?? null,
    qrExpiresAt: row?.qr_expires_at ?? null,
    phoneNumber: row?.phone_number ?? null,
    lastError: row?.last_error ?? null,
  };
}

export const getWhatsappInstance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WhatsappInstance | null> => {
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("whatsapp_instances")
      .select("*")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapInstance(data) : null;
  });

export const connectWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WhatsappInstance> => {
    const json = await callEdgeFunction("atendimentos-connect", { ownerId: context.userId });
    return { status: json.status ?? "connecting", qrCode: json.qrCode ?? null, qrExpiresAt: null, phoneNumber: null, lastError: null };
  });

export const refreshWhatsappStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WhatsappInstance | null> => {
    const json = await callEdgeFunction("atendimentos-status", { ownerId: context.userId });
    return json.instance ? mapInstance(json.instance) : null;
  });

export const getConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ConversationRow[]> => {
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("whatsapp_conversations")
      .select("id, remote_jid, contact_name, patient_id, last_message_preview, last_message_at, unread_count, patients(name)")
      .eq("owner_id", context.userId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: any) => ({
      id: row.id,
      remoteJid: row.remote_jid,
      contactName: row.contact_name,
      patientId: row.patient_id,
      patientName: row.patients?.name ?? null,
      lastMessagePreview: row.last_message_preview,
      lastMessageAt: row.last_message_at,
      unreadCount: row.unread_count ?? 0,
    }));
  });

export const getMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string }) => input)
  .handler(async ({ data, context }): Promise<MessageRow[]> => {
    const supabase: any = context.supabase;
    const { data: rows, error } = await supabase
      .from("whatsapp_messages")
      .select("id, from_me, body, message_type, status, timestamp")
      .eq("owner_id", context.userId)
      .eq("conversation_id", data.conversationId)
      .order("timestamp", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);

    await supabase
      .from("whatsapp_conversations")
      .update({ unread_count: 0 })
      .eq("owner_id", context.userId)
      .eq("id", data.conversationId);

    return (rows ?? []).map((row: any) => ({
      id: row.id,
      fromMe: row.from_me,
      body: row.body,
      messageType: row.message_type,
      status: row.status,
      timestamp: row.timestamp,
    }));
  });

export const sendWhatsappMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string; text: string }) => input)
  .handler(async ({ data, context }) => {
    const json = await callEdgeFunction("atendimentos-send-message", {
      ownerId: context.userId,
      conversationId: data.conversationId,
      text: data.text,
    });
    return json as { ok: boolean; status: "sent" | "failed" };
  });
