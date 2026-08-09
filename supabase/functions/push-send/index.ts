// Ponto de entrada HTTP para enviar push. A lógica mora em _shared/push.ts,
// porque o cron de conversas também envia.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { pushToOwner, vapidConfig, type PushType } from "../_shared/push.ts";
import { sendPush } from "../_shared/webpush.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// O teste ignora a preferência de propósito: testar um tipo que está
// desligado pareceria falha do sistema em vez de configuração.
async function handleTest(ownerId: string) {
  const vapid = vapidConfig();
  if (!vapid) throw new Error("Cadastre as chaves VAPID antes de testar.");

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("owner_id", ownerId);
  if (!subs?.length) {
    throw new Error("Nenhum aparelho inscrito. Ative as notificações no celular primeiro.");
  }

  const results = await Promise.all(
    subs.map(async (row: any) => {
      const result = await sendPush(
        { endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth },
        {
          title: "NÓS Conecta",
          body: "Notificação de teste — está funcionando.",
          url: "/configuracoes/notificacoes",
          tag: "test",
        },
        vapid,
      );
      if (result.gone) await supabase.from("push_subscriptions").delete().eq("id", row.id);
      return result;
    }),
  );

  const failed = results.find((r) => !r.ok);
  if (failed) throw new Error(failed.error ?? "Falha ao enviar a notificação de teste.");
  return { ok: true, sent: results.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  try {
    const body = await req.json();
    const { ownerId, action } = body as { ownerId?: string; action?: string };
    if (!ownerId) {
      return new Response(JSON.stringify({ error: "ownerId é obrigatório" }), { status: 400 });
    }

    let result: unknown;
    switch (action ?? "send") {
      case "send":
        result = await pushToOwner(supabase, ownerId, body.type as PushType, {
          title: body.title,
          body: body.body,
          url: body.url,
        });
        break;
      case "test":
        result = await handleTest(ownerId);
        break;
      default:
        return new Response(JSON.stringify({ error: `action desconhecida: ${action}` }), {
          status: 400,
        });
    }

    return new Response(JSON.stringify(result), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error("[push-send]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
