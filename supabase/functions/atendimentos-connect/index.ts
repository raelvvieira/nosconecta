// Creates/recovers the clinic's Evolution API instance and returns a QR
// code to scan. Protected (verify_jwt default), called from
// src/lib/atendimentos/atendimentos.functions.ts with the service role key
// — ownerId comes explicit in the body rather than a forwarded JWT, same
// pattern as send-appointment-notification/resendNotification.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { connectInstance, createInstance, extractQrCode, setWebhook } from "../_shared/evolution.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function instanceNameFor(ownerId: string): string {
  return `clinic_${ownerId.replace(/-/g, "")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");

  try {
    const { ownerId } = (await req.json()) as { ownerId?: string };
    if (!ownerId) {
      return new Response(JSON.stringify({ error: "ownerId é obrigatório" }), { status: 400 });
    }

    const instanceName = instanceNameFor(ownerId);
    const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/atendimentos-webhook?secret=${Deno.env.get("EVOLUTION_WEBHOOK_SECRET")}`;

    const { data: existing } = await supabase
      .from("whatsapp_instances")
      .select("id")
      .eq("owner_id", ownerId)
      .maybeSingle();

    if (!existing) {
      await supabase.from("whatsapp_instances").insert({
        owner_id: ownerId,
        instance_name: instanceName,
        status: "connecting",
      });
    }

    // Try creating the instance on Evolution's side; if it already exists
    // there, fall back to just (re)registering the webhook.
    try {
      await createInstance(instanceName, webhookUrl);
    } catch (e) {
      console.error("[atendimentos-connect] createInstance falhou, tentando setWebhook:", e);
      await setWebhook(instanceName, webhookUrl);
    }

    const connectRes = await connectInstance(instanceName);
    const qrCode = extractQrCode(connectRes);

    await supabase
      .from("whatsapp_instances")
      .update({
        status: "connecting",
        qr_code: qrCode,
        qr_expires_at: new Date(Date.now() + 60_000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("owner_id", ownerId);

    return new Response(JSON.stringify({ ok: true, qrCode, status: "connecting" }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error("[atendimentos-connect]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
