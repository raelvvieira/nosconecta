// Lista conversas/mensagens do inbox de WhatsApp da clínica no CRM, e envia
// mensagens novas. Nada é espelhado localmente — cada chamada busca ao vivo
// no CRM; o cache curto fica só no TanStack Query do front-end.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crmFetch } from "../_shared/crm-auth.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function handleList(ownerId: string) {
  const res = await crmFetch(supabase, ownerId, "/api/v1/conversations");
  const list = Array.isArray(res) ? res : (res?.data ?? res?.conversations ?? []);
  return { ok: true, conversations: list };
}

async function handleMessages(ownerId: string, conversationId: string) {
  const res = await crmFetch(supabase, ownerId, `/api/v1/conversations/${conversationId}/messages`);
  const list = Array.isArray(res) ? res : (res?.data ?? res?.messages ?? []);
  return { ok: true, messages: list };
}

async function handleSend(ownerId: string, conversationId: string, content: string) {
  const res = await crmFetch(supabase, ownerId, `/api/v1/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content, message_type: "outgoing", private: false }),
  });
  return { ok: true, message: res };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  try {
    const { ownerId, action, conversationId, content } = (await req.json()) as {
      ownerId?: string;
      action?: string;
      conversationId?: string;
      content?: string;
    };
    if (!ownerId || !action) {
      return new Response(JSON.stringify({ error: "ownerId e action são obrigatórios" }), { status: 400 });
    }

    let result: unknown;
    if (action === "list") {
      result = await handleList(ownerId);
    } else if (action === "messages") {
      if (!conversationId) return new Response(JSON.stringify({ error: "conversationId é obrigatório" }), { status: 400 });
      result = await handleMessages(ownerId, conversationId);
    } else if (action === "send") {
      if (!conversationId || !content?.trim()) {
        return new Response(JSON.stringify({ error: "conversationId e content são obrigatórios" }), { status: 400 });
      }
      result = await handleSend(ownerId, conversationId, content.trim());
    } else {
      return new Response(JSON.stringify({ error: `action desconhecida: ${action}` }), { status: 400 });
    }

    return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
  } catch (e) {
    console.error("[crm-conversations]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
