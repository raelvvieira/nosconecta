// Sends the email + SMS for a single (appointmentId, kind) pair via Brevo,
// and records the outcome per channel in appointment_notifications.
//
// Protected (verify_jwt, see supabase/config.toml default): only callable
// with a valid Supabase JWT. Both legitimate callers already hold the
// service role key from their own environment — our TanStack server
// (src/lib/agenda/notifications.server.ts) and the cron-triggered
// send-appointment-reminders function — so nothing sensitive needs to be
// embedded in a migration or committed file to reach this endpoint.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendBrevoEmail, sendBrevoSms, sendBrevoWhatsapp } from "../_shared/brevo.ts";
import { buildAppointmentMessage, type NotificationKind } from "../_shared/appointment-messages.ts";
import { toE164BR, toWhatsappBR } from "../_shared/phone.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// One Meta-approved template per notification kind — see the "Notificações"
// admin page in the app for the exact text each template needs to contain.
const WHATSAPP_TEMPLATE_ENV: Record<NotificationKind, string> = {
  confirmation: "BREVO_WHATSAPP_TEMPLATE_CONFIRMATION",
  reminder_day_before: "BREVO_WHATSAPP_TEMPLATE_REMINDER_DAY_BEFORE",
  reminder_day_of: "BREVO_WHATSAPP_TEMPLATE_REMINDER_DAY_OF",
};

type Channel = "email" | "sms" | "whatsapp";
type ChannelResult = { status: "sent" | "failed" | "skipped"; error?: string };

async function recordResult(
  appointmentId: string,
  ownerId: string,
  kind: NotificationKind,
  channel: Channel,
  result: ChannelResult,
) {
  await supabase.from("appointment_notifications").upsert(
    {
      appointment_id: appointmentId,
      owner_id: ownerId,
      kind,
      channel,
      status: result.status,
      sent_at: result.status === "sent" ? new Date().toISOString() : null,
      error: result.error ?? null,
    },
    { onConflict: "appointment_id,kind,channel" },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");

  try {
    const { appointmentId, kind } = (await req.json()) as {
      appointmentId?: string;
      kind?: NotificationKind;
    };
    if (!appointmentId || !kind) {
      return new Response(JSON.stringify({ error: "appointmentId e kind são obrigatórios" }), {
        status: 400,
      });
    }

    const { data: appt, error: apptErr } = await supabase
      .from("appointments")
      .select("id, owner_id, patient_id, patient_name, procedure_name, professional_name, date, start_time")
      .eq("id", appointmentId)
      .maybeSingle();
    if (apptErr) throw new Error(apptErr.message);
    if (!appt) {
      return new Response(JSON.stringify({ error: "Agendamento não encontrado" }), { status: 404 });
    }

    // Already-sent channels are never retried, so re-running this (e.g. the
    // daily cron firing more than once) can't double-send.
    const { data: existing } = await supabase
      .from("appointment_notifications")
      .select("channel, status")
      .eq("appointment_id", appointmentId)
      .eq("kind", kind);
    const alreadySent = new Set(
      (existing ?? []).filter((r) => r.status === "sent").map((r) => r.channel as Channel),
    );

    let email: string | null = null;
    let phone: string | null = null;
    if (appt.patient_id) {
      const { data: patient } = await supabase
        .from("patients")
        .select("email, phone")
        .eq("id", appt.patient_id)
        .maybeSingle();
      email = patient?.email ?? null;
      phone = patient?.phone ?? null;
    }

    const msg = buildAppointmentMessage(kind, {
      patientName: appt.patient_name,
      procedureName: appt.procedure_name,
      professionalName: appt.professional_name,
      date: appt.date,
      startTime: String(appt.start_time).slice(0, 5),
    });

    const results: Record<Channel, ChannelResult> = {
      email: { status: "skipped", error: "não reprocessado (já enviado)" },
      sms: { status: "skipped", error: "não reprocessado (já enviado)" },
      whatsapp: { status: "skipped", error: "não reprocessado (já enviado)" },
    };

    if (!alreadySent.has("email")) {
      if (email) {
        try {
          await sendBrevoEmail({ to: { email, name: appt.patient_name }, subject: msg.subject, htmlContent: msg.html });
          results.email = { status: "sent" };
        } catch (e) {
          results.email = { status: "failed", error: String(e) };
        }
      } else {
        results.email = { status: "skipped", error: "Paciente sem e-mail cadastrado" };
      }
      await recordResult(appointmentId, appt.owner_id, kind, "email", results.email);
    }

    if (!alreadySent.has("sms")) {
      const e164 = toE164BR(phone);
      if (e164) {
        try {
          await sendBrevoSms({ recipient: e164, content: msg.sms });
          results.sms = { status: "sent" };
        } catch (e) {
          results.sms = { status: "failed", error: String(e) };
        }
      } else {
        results.sms = { status: "skipped", error: "Paciente sem telefone válido" };
      }
      await recordResult(appointmentId, appt.owner_id, kind, "sms", results.sms);
    }

    if (!alreadySent.has("whatsapp")) {
      const waPhone = toWhatsappBR(phone);
      const senderNumber = Deno.env.get("BREVO_WHATSAPP_SENDER_NUMBER");
      const templateIdRaw = Deno.env.get(WHATSAPP_TEMPLATE_ENV[kind]);
      const templateId = templateIdRaw ? Number(templateIdRaw) : NaN;
      if (!waPhone) {
        results.whatsapp = { status: "skipped", error: "Paciente sem telefone válido" };
      } else if (!senderNumber || !Number.isFinite(templateId)) {
        results.whatsapp = { status: "skipped", error: "WhatsApp não configurado (sender/template ausente)" };
      } else {
        try {
          await sendBrevoWhatsapp({
            senderNumber,
            contactNumber: waPhone,
            templateId,
            params: msg.whatsappParams,
          });
          results.whatsapp = { status: "sent" };
        } catch (e) {
          results.whatsapp = { status: "failed", error: String(e) };
        }
      }
      await recordResult(appointmentId, appt.owner_id, kind, "whatsapp", results.whatsapp);
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error("[send-appointment-notification]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
