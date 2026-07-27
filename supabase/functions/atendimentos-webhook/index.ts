// Receives Evolution API webhook events (MESSAGES_UPSERT, CONNECTION_UPDATE,
// QRCODE_UPDATED) for the "Atendimentos" WhatsApp mirror — separate from
// Brevo's whatsapp-inbound-webhook, which only handles replies to official
// template messages. This one mirrors a full live conversation.
//
// Public endpoint (verify_jwt = false, see supabase/config.toml): Evolution
// API can't present a Supabase JWT, so this checks its own shared secret
// (EVOLUTION_WEBHOOK_SECRET) via a ?secret= query param, same pattern as
// whatsapp-inbound-webhook.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { onlyDigits, phoneMatches } from "../_shared/phone-match.ts";
import { normalizeStatus } from "../_shared/evolution.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Message text field name varies by Evolution/Baileys message type — try
// the known shapes, fall back to a placeholder rather than dropping the
// message entirely.
function extractMessageText(data: any): { body: string; type: string } {
  const msg = data?.message;
  if (typeof msg?.conversation === "string") return { body: msg.conversation, type: "text" };
  if (typeof msg?.extendedTextMessage?.text === "string") {
    return { body: msg.extendedTextMessage.text, type: "text" };
  }
  if (msg?.imageMessage) return { body: msg.imageMessage.caption ?? "[imagem]", type: "image" };
  if (msg?.audioMessage) return { body: "[áudio]", type: "audio" };
  if (msg?.videoMessage) return { body: msg.videoMessage.caption ?? "[vídeo]", type: "video" };
  if (msg?.documentMessage) return { body: msg.documentMessage.fileName ?? "[documento]", type: "document" };
  return { body: "[mensagem não suportada]", type: "other" };
}

function toIso(timestamp: unknown): string {
  const n = Number(timestamp);
  if (!n) return new Date().toISOString();
  // Evolution/Baileys timestamps are usually epoch seconds.
  const ms = n < 10_000_000_000 ? n * 1000 : n;
  return new Date(ms).toISOString();
}

async function handleMessageUpsert(ownerId: string, data: any) {
  const remoteJid: string | undefined = data?.key?.remoteJid;
  if (!remoteJid || remoteJid.endsWith("@g.us")) return; // skip group chats for v1
  const fromMe: boolean = !!data?.key?.fromMe;
  const evolutionMessageId: string | null = data?.key?.id ?? null;
  const phoneDigits = onlyDigits(remoteJid.split("@")[0]);
  const { body, type } = extractMessageText(data);
  const timestamp = toIso(data?.messageTimestamp);

  let patientId: string | null = null;
  const { data: patients } = await supabase
    .from("patients")
    .select("id, phone")
    .eq("owner_id", ownerId)
    .not("phone", "is", null);
  const patient = (patients ?? []).find((p: any) => phoneMatches(onlyDigits(p.phone), phoneDigits));
  if (patient) patientId = patient.id;

  const { data: conversation } = await supabase
    .from("whatsapp_conversations")
    .upsert(
      {
        owner_id: ownerId,
        remote_jid: remoteJid,
        phone_digits: phoneDigits,
        patient_id: patientId,
        contact_name: data?.pushName ?? null,
        last_message_preview: body,
        last_message_at: timestamp,
      },
      { onConflict: "owner_id,remote_jid" },
    )
    .select("id, unread_count")
    .single();
  if (!conversation) return;

  if (!fromMe) {
    await supabase
      .from("whatsapp_conversations")
      .update({ unread_count: (conversation.unread_count ?? 0) + 1 })
      .eq("id", conversation.id);
  }

  await supabase
    .from("whatsapp_messages")
    .upsert(
      {
        owner_id: ownerId,
        conversation_id: conversation.id,
        evolution_message_id: evolutionMessageId,
        from_me: fromMe,
        body,
        message_type: type,
        status: "received",
        timestamp,
      },
      { onConflict: "owner_id,evolution_message_id", ignoreDuplicates: true },
    );
}

async function handleConnectionUpdate(ownerId: string, data: any) {
  const status = normalizeStatus(data?.state ?? data?.connection);
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === "open") {
    patch.last_connected_at = new Date().toISOString();
    patch.last_error = null;
    if (data?.number) patch.phone_number = data.number;
  }
  if (status === "error" && data?.error) patch.last_error = String(data.error);
  await supabase.from("whatsapp_instances").update(patch).eq("owner_id", ownerId);
}

async function handleQrCodeUpdated(ownerId: string, data: any) {
  const qrCode = data?.qrcode?.base64 ?? data?.base64 ?? null;
  if (!qrCode) return;
  await supabase
    .from("whatsapp_instances")
    .update({
      qr_code: qrCode,
      qr_expires_at: new Date(Date.now() + 60_000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("owner_id", ownerId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");

  const url = new URL(req.url);
  const expectedSecret = Deno.env.get("EVOLUTION_WEBHOOK_SECRET");
  if (!expectedSecret || url.searchParams.get("secret") !== expectedSecret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  try {
    const body = await req.json();
    const instanceName: string | undefined = body?.instance;
    const event: string | undefined = body?.event;
    if (!instanceName || !event) {
      return new Response(JSON.stringify({ ok: true, skipped: "payload sem instance/event" }));
    }

    const { data: instance } = await supabase
      .from("whatsapp_instances")
      .select("owner_id")
      .eq("instance_name", instanceName)
      .maybeSingle();
    if (!instance) {
      return new Response(JSON.stringify({ ok: true, skipped: "instância desconhecida" }));
    }

    const eventUpper = event.toUpperCase().replace(/\./g, "_");
    // MESSAGES_UPSERT can carry a single message object or an array.
    const dataItems = Array.isArray(body?.data) ? body.data : [body?.data];

    if (eventUpper.includes("MESSAGES_UPSERT")) {
      for (const item of dataItems) {
        if (item) await handleMessageUpsert(instance.owner_id, item);
      }
    } else if (eventUpper.includes("CONNECTION_UPDATE")) {
      await handleConnectionUpdate(instance.owner_id, body?.data ?? {});
    } else if (eventUpper.includes("QRCODE_UPDATED")) {
      await handleQrCodeUpdated(instance.owner_id, body?.data ?? {});
    } else {
      return new Response(JSON.stringify({ ok: true, skipped: `evento não tratado: ${event}` }));
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error("[atendimentos-webhook]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
