// Reconciles the local whatsapp_instances.status against Evolution API's
// own connectionState — used for the initial page load / manual refresh.
// Real-time status changes normally arrive via the CONNECTION_UPDATE
// webhook event in atendimentos-webhook.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractConnectionStatus, getConnectionState, normalizeStatus } from "../_shared/evolution.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");

  try {
    const { ownerId } = (await req.json()) as { ownerId?: string };
    if (!ownerId) {
      return new Response(JSON.stringify({ error: "ownerId é obrigatório" }), { status: 400 });
    }

    const { data: instance, error } = await supabase
      .from("whatsapp_instances")
      .select("*")
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!instance) {
      return new Response(JSON.stringify({ ok: true, instance: null }), {
        headers: { "content-type": "application/json" },
      });
    }

    try {
      const stateRes = await getConnectionState(instance.instance_name);
      const status = normalizeStatus(extractConnectionStatus(stateRes));
      const { data: updated } = await supabase
        .from("whatsapp_instances")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("owner_id", ownerId)
        .select("*")
        .single();
      return new Response(JSON.stringify({ ok: true, instance: updated ?? instance }), {
        headers: { "content-type": "application/json" },
      });
    } catch (e) {
      console.error("[atendimentos-status] falha ao consultar Evolution API:", e);
      return new Response(JSON.stringify({ ok: true, instance }), {
        headers: { "content-type": "application/json" },
      });
    }
  } catch (e) {
    console.error("[atendimentos-status]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
