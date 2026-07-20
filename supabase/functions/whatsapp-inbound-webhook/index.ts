// Receives Brevo Conversations webhooks (conversationFragment events) for
// inbound WhatsApp replies, matches the sender's phone number to a patient
// and their nearest upcoming appointment, and auto-confirms it when the
// reply reads as a "yes". Every reply is logged to
// appointment_notification_replies regardless of the outcome, so the
// Notificações admin page shows exactly what was received and decided.
//
// Public endpoint (verify_jwt = false, see supabase/config.toml): Brevo has
// no way to present a Supabase JWT, so this function checks its own shared
// secret (WHATSAPP_WEBHOOK_SECRET) via a ?secret= query param on the
// webhook URL configured in Brevo Conversations > Settings > Webhooks.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function onlyDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

// Compares by the last 10-11 digits so formatting differences (with/without
// country code, leading 9, etc.) don't cause false negatives.
function phoneMatches(a: string, b: string): boolean {
  if (!a || !b) return false;
  const tailLen = 10;
  return a.slice(-tailLen) === b.slice(-tailLen);
}

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function classifyReply(text: string): "confirm" | "decline" | "unclear" {
  const norm = stripAccents(text).toLowerCase().trim();
  const confirmWords = ["sim", "s", "confirmo", "confirmar", "confirmado", "ok", "okay", "beleza", "1"];
  const declineWords = ["nao", "n", "cancelar", "cancela", "cancelo", "remarcar", "desmarcar", "2"];
  const tokens = norm.split(/[\s,.!]+/).filter(Boolean);
  const hasConfirm = tokens.some((t) => confirmWords.includes(t));
  const hasDecline = tokens.some((t) => declineWords.includes(t));
  if (hasConfirm && !hasDecline) return "confirm";
  if (hasDecline && !hasConfirm) return "decline";
  return "unclear";
}

async function logReply(input: {
  ownerId: string | null;
  appointmentId: string | null;
  patientId: string | null;
  fromPhone: string;
  messageText: string;
  action: string;
}) {
  if (!input.ownerId) return; // owner_id is NOT NULL; nothing to attribute this to
  await supabase.from("appointment_notification_replies").insert({
    owner_id: input.ownerId,
    appointment_id: input.appointmentId,
    patient_id: input.patientId,
    channel: "whatsapp",
    from_phone: input.fromPhone,
    message_text: input.messageText,
    action: input.action,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");

  const url = new URL(req.url);
  const expectedSecret = Deno.env.get("WHATSAPP_WEBHOOK_SECRET");
  if (!expectedSecret || url.searchParams.get("secret") !== expectedSecret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  try {
    const body = await req.json();
    if (body.eventName !== "conversationFragment") {
      return new Response(JSON.stringify({ ok: true, skipped: "not a conversationFragment event" }));
    }
    if (body.visitor?.source !== "whatsapp") {
      return new Response(JSON.stringify({ ok: true, skipped: "not whatsapp" }));
    }
    const visitorMessages = (body.messages ?? []).filter((m: any) => m.type === "visitor" && m.text?.trim());
    if (visitorMessages.length === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: "no visitor message" }));
    }

    const rawPhone: string =
      body.visitor?.formattedAttributes?.WHATSAPP ??
      body.visitor?.attributes?.WHATSAPP ??
      body.visitor?.attributes?.SMS ??
      "";
    const fromPhone = onlyDigits(rawPhone);
    const messageText: string = visitorMessages[visitorMessages.length - 1].text.trim();

    if (!fromPhone) {
      await logReply({
        ownerId: null,
        appointmentId: null,
        patientId: null,
        fromPhone: rawPhone || "(desconhecido)",
        messageText,
        action: "no_patient_found",
      });
      return new Response(JSON.stringify({ ok: true, matched: false, reason: "sem telefone no payload" }));
    }

    const { data: patients } = await supabase
      .from("patients")
      .select("id, owner_id, phone")
      .not("phone", "is", null);
    const patient = (patients ?? []).find((p: any) => phoneMatches(onlyDigits(p.phone), fromPhone));

    if (!patient) {
      await logReply({
        ownerId: null,
        appointmentId: null,
        patientId: null,
        fromPhone,
        messageText,
        action: "no_patient_found",
      });
      return new Response(JSON.stringify({ ok: true, matched: false, reason: "paciente não encontrado" }));
    }

    const today = new Date().toISOString().slice(0, 10);
    const { data: appt } = await supabase
      .from("appointments")
      .select("id, status")
      .eq("patient_id", patient.id)
      .gte("date", today)
      .in("status", ["pending", "confirmed"])
      .order("date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!appt) {
      await logReply({
        ownerId: patient.owner_id,
        appointmentId: null,
        patientId: patient.id,
        fromPhone,
        messageText,
        action: "no_appointment_found",
      });
      return new Response(JSON.stringify({ ok: true, matched: false, reason: "sem agendamento futuro" }));
    }

    const classification = classifyReply(messageText);
    let action = "unmatched";
    if (classification === "confirm") {
      await supabase.from("appointments").update({ status: "confirmed" }).eq("id", appt.id);
      action = "confirmed";
    } else if (classification === "decline") {
      // Never auto-cancel from a text reply — flagged for staff to review
      // and cancel/reschedule manually from the Agenda.
      action = "declined";
    }

    await logReply({
      ownerId: patient.owner_id,
      appointmentId: appt.id,
      patientId: patient.id,
      fromPhone,
      messageText,
      action,
    });

    return new Response(JSON.stringify({ ok: true, matched: true, action }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error("[whatsapp-inbound-webhook]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
