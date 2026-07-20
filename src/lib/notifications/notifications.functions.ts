import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { NotificationChannel, NotificationKind } from "@/components/agenda/types";

export interface NotificationsHealth {
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
  whatsappInboundWebhook: boolean;
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

export const getNotificationsHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<NotificationsHealth> => {
    const json = await callEdgeFunction("notifications-health", {});
    return {
      email: !!json.email,
      sms: !!json.sms,
      whatsapp: !!json.whatsapp,
      whatsappInboundWebhook: !!json.whatsappInboundWebhook,
    };
  });

export const sendTestNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { channel: NotificationChannel; kind: NotificationKind; destination: string }) => input)
  .handler(async ({ data }) => {
    await callEdgeFunction("send-test-notification", data);
    return { ok: true };
  });

export interface NotificationLogRow {
  id: string;
  appointmentId: string;
  kind: NotificationKind;
  channel: NotificationChannel;
  status: "pending" | "sent" | "failed" | "skipped";
  error: string | null;
  sentAt: string | null;
  patientName: string | null;
  date: string | null;
  startTime: string | null;
}

export const getNotificationsLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NotificationLogRow[]> => {
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("appointment_notifications")
      .select("id, appointment_id, kind, channel, status, error, sent_at, created_at, appointments(patient_name, date, start_time)")
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: any) => ({
      id: row.id,
      appointmentId: row.appointment_id,
      kind: row.kind,
      channel: row.channel,
      status: row.status,
      error: row.error,
      sentAt: row.sent_at,
      patientName: row.appointments?.patient_name ?? null,
      date: row.appointments?.date ?? null,
      startTime: row.appointments?.start_time ? String(row.appointments.start_time).slice(0, 5) : null,
    }));
  });

export interface NotificationReplyRow {
  id: string;
  fromPhone: string;
  messageText: string;
  action: string;
  createdAt: string;
  patientName: string | null;
}

export const getNotificationReplies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NotificationReplyRow[]> => {
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("appointment_notification_replies")
      .select("id, from_phone, message_text, action, created_at, patients(name)")
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: any) => ({
      id: row.id,
      fromPhone: row.from_phone,
      messageText: row.message_text,
      action: row.action,
      createdAt: row.created_at,
      patientName: row.patients?.name ?? null,
    }));
  });

export const resendNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { appointmentId: string; kind: NotificationKind }) => input)
  .handler(async ({ data }) => {
    const json = await callEdgeFunction("send-appointment-notification", {
      appointmentId: data.appointmentId,
      kind: data.kind,
    });
    return json as { ok: true; results: Record<NotificationChannel, { status: string; error?: string }> };
  });
