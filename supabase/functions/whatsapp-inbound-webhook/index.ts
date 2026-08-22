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
import { pushToOwner } from "../_shared/push.ts";
import { onlyDigits, phoneMatches } from "../_shared/phone-match.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Manda a resposta para o motor de automações.
 *
 *  Falha é engolida de propósito: automação quebrada não pode impedir o
 *  registro da resposta nem o push para a equipe, que são o mínimo que essa
 *  função precisa entregar. Mesma regra dos 6 pontos de dispatch do app. */
async function dispatchAutomation(ownerId: string, context: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/atendimento-automations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        ownerId,
        action: "dispatch",
        systemEvent: "whatsapp.reply_received",
        context,
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    console.error("[whatsapp-inbound-webhook] dispatch de automação falhou:", e);
  }
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
      .select("id, owner_id, phone, name")
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

    // Fuso da clínica, não UTC: esta função roda quando o paciente responde,
    // a qualquer hora. Às 21:00 de Brasília o "hoje" em UTC já é amanhã, e o
    // gte() abaixo passaria por cima de um agendamento de hoje à noite.
    // en-CA porque seu formato de data já é YYYY-MM-DD (mesma técnica de
    // atendimento-automations/index.ts e de src/lib/date.ts).
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const { data: appt } = await supabase
      .from("appointments")
      // Campos além de id/status: viajam no contexto da automação para as
      // variáveis da mensagem ({{data}}, {{hora}}, {{unidade}}…).
      .select("id, status, date, start_time, procedure_name, professional_name, unit_id")
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

    // A resposta vira evento de automação ANTES de qualquer decisão embutida:
    // é o que permite a clínica escrever as próprias palavras ("confirmo",
    // "tá", "blz") em vez de depender da lista fixa de `classifyReply`.
    const { data: regraDeResposta } = await supabase
      .from("automation_rules")
      .select("id")
      .eq("owner_id", patient.owner_id)
      .eq("trigger_event", "whatsapp.reply_received")
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    const automacaoDecide = !!regraDeResposta;

    if (automacaoDecide) {
      await dispatchAutomation(patient.owner_id, {
        entityId: appt.id,
        appointmentId: appt.id,
        patientId: patient.id,
        contactName: patient.name ?? null,
        status: appt.status ?? null,
        replyText: messageText,
        appointment: {
          date: appt.date ?? null,
          startTime: appt.start_time ?? null,
          procedureName: appt.procedure_name ?? null,
          professionalName: appt.professional_name ?? null,
          unitId: appt.unit_id ?? null,
        },
      });
    }

    const classification = classifyReply(messageText);
    let action = automacaoDecide ? "automation" : "unmatched";
    // Com automação ativa, quem muda o status é o fluxo — aplicar também a
    // regra fixa aqui faria a mesma resposta ser tratada duas vezes, e a
    // clínica não teria como desligar o comportamento embutido. Sem automação,
    // nada muda em relação a antes.
    if (!automacaoDecide) {
      if (classification === "confirm") {
        await supabase.from("appointments").update({ status: "confirmed" }).eq("id", appt.id);
        action = "confirmed";
      } else if (classification === "decline") {
        // Never auto-cancel from a text reply — flagged for staff to review
        // and cancel/reschedule manually from the Agenda.
        action = "declined";
      }
    }

    await logReply({
      ownerId: patient.owner_id,
      appointmentId: appt.id,
      patientId: patient.id,
      fromPhone,
      messageText,
      action,
    });

    // "declined" era o pior buraco do fluxo: o paciente pedia pra remarcar e
    // ninguém era avisado — ficava esperando alguém abrir a tela de
    // Notificações por acaso. Push resolve os dois casos.
    if (action === "confirmed" || action === "declined") {
      await pushToOwner(supabase, patient.owner_id, "appointment_reply", {
        title: action === "confirmed" ? "Agendamento confirmado" : "Paciente quer remarcar",
        body:
          action === "confirmed"
            ? `${patient.name ?? "O paciente"} confirmou o agendamento.`
            : `${patient.name ?? "O paciente"} respondeu pedindo para cancelar ou remarcar.`,
        url: "/agenda",
      }, {
        appointmentId: appt.id,
        patientId: patient.id,
      }).catch((e) => console.error("[whatsapp-inbound-webhook] push falhou:", e));
    }

    return new Response(JSON.stringify({ ok: true, matched: true, action }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error("[whatsapp-inbound-webhook]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
