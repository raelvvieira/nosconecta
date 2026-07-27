// Sends an outbound text message through the clinic's Evolution API
// instance and records it locally. Doesn't wait for the webhook to echo
// the message back — the local insert is the source of truth for the
// sent bubble.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTextMessage } from "../_shared/evolution.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");

  try {
    const { ownerId, conversationId, text } = (await req.json()) as {
      ownerId?: string;
      conversationId?: string;
      text?: string;
    };
    if (!ownerId || !conversationId || !text?.trim()) {
      return new Response(JSON.stringify({ error: "ownerId, conversationId e text são obrigatórios" }), {
        status: 400,
      });
    }

    const [{ data: conversation }, { data: instance }] = await Promise.all([
      supabase
        .from("whatsapp_conversations")
        .select("id, remote_jid")
        .eq("id", conversationId)
        .eq("owner_id", ownerId)
        .maybeSingle(),
      supabase
        .from("whatsapp_instances")
        .select("instance_name")
        .eq("owner_id", ownerId)
        .maybeSingle(),
    ]);
    if (!conversation) {
      return new Response(JSON.stringify({ error: "Conversa não encontrada" }), { status: 404 });
    }
    if (!instance) {
      return new Response(JSON.stringify({ error: "WhatsApp não conectado" }), { status: 400 });
    }

    const number = conversation.remote_jid.split("@")[0];
    const now = new Date().toISOString();

    const { data: inserted, error: insertErr } = await supabase
      .from("whatsapp_messages")
      .insert({
        owner_id: ownerId,
        conversation_id: conversationId,
        from_me: true,
        body: text.trim(),
        message_type: "text",
        status: "sending",
        sent_by_user_id: ownerId,
        timestamp: now,
      })
      .select("id")
      .single();
    if (insertErr) throw new Error(insertErr.message);

    let finalStatus: "sent" | "failed" = "sent";
    let evolutionMessageId: string | null = null;
    try {
      const sendRes = await sendTextMessage(instance.instance_name, number, text.trim());
      evolutionMessageId = sendRes?.key?.id ?? sendRes?.id ?? null;
    } catch (e) {
      console.error("[atendimentos-send-message] falha ao enviar:", e);
      finalStatus = "failed";
    }

    await supabase
      .from("whatsapp_messages")
      .update({ status: finalStatus, evolution_message_id: evolutionMessageId })
      .eq("id", inserted.id);

    await supabase
      .from("whatsapp_conversations")
      .update({ last_message_preview: text.trim(), last_message_at: now })
      .eq("id", conversationId);

    return new Response(JSON.stringify({ ok: finalStatus === "sent", status: finalStatus }), {
      status: finalStatus === "sent" ? 200 : 502,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error("[atendimentos-send-message]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
