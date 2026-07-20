// Fires a one-off Brevo send (email/sms/whatsapp) with placeholder
// appointment data, so the Notificações admin page can smoke-test each
// channel/kind without needing a real appointment. Not tied to any
// appointment_notifications row — the result goes straight back to the
// caller, not persisted.
import { sendBrevoEmail, sendBrevoSms, sendBrevoWhatsapp } from "../_shared/brevo.ts";
import { buildAppointmentMessage, type NotificationKind } from "../_shared/appointment-messages.ts";
import { toE164BR, toWhatsappBR } from "../_shared/phone.ts";

const WHATSAPP_TEMPLATE_ENV: Record<NotificationKind, string> = {
  confirmation: "BREVO_WHATSAPP_TEMPLATE_CONFIRMATION",
  reminder_day_before: "BREVO_WHATSAPP_TEMPLATE_REMINDER_DAY_BEFORE",
  reminder_day_of: "BREVO_WHATSAPP_TEMPLATE_REMINDER_DAY_OF",
};

function placeholderMessage(kind: NotificationKind) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return buildAppointmentMessage(kind, {
    patientName: "Paciente Teste",
    procedureName: "Consulta de teste",
    professionalName: "Equipe NÓS Conecta",
    date: d.toISOString().slice(0, 10),
    startTime: "09:00",
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");

  try {
    const { channel, kind, destination } = (await req.json()) as {
      channel?: "email" | "sms" | "whatsapp";
      kind?: NotificationKind;
      destination?: string;
    };
    if (!channel || !kind || !destination?.trim()) {
      return new Response(JSON.stringify({ error: "channel, kind e destination são obrigatórios" }), {
        status: 400,
      });
    }

    const msg = placeholderMessage(kind);

    if (channel === "email") {
      await sendBrevoEmail({ to: { email: destination.trim() }, subject: `[TESTE] ${msg.subject}`, htmlContent: msg.html });
      return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
    }

    if (channel === "sms") {
      const e164 = toE164BR(destination);
      if (!e164) return new Response(JSON.stringify({ error: "Telefone inválido para SMS" }), { status: 400 });
      await sendBrevoSms({ recipient: e164, content: `[TESTE] ${msg.sms}` });
      return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
    }

    // whatsapp
    const waPhone = toWhatsappBR(destination);
    if (!waPhone) return new Response(JSON.stringify({ error: "Telefone inválido para WhatsApp" }), { status: 400 });
    const senderNumber = Deno.env.get("BREVO_WHATSAPP_SENDER_NUMBER");
    const templateIdRaw = Deno.env.get(WHATSAPP_TEMPLATE_ENV[kind]);
    const templateId = templateIdRaw ? Number(templateIdRaw) : NaN;
    if (!senderNumber || !Number.isFinite(templateId)) {
      return new Response(JSON.stringify({ error: "WhatsApp não configurado (sender/template ausente)" }), { status: 400 });
    }
    await sendBrevoWhatsapp({ senderNumber, contactNumber: waPhone, templateId, params: msg.whatsappParams });
    return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
  } catch (e) {
    console.error("[send-test-notification]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
