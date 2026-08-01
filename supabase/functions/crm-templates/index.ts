// CRUD simples de templates de mensagem (nome + conteúdo), guardados no
// próprio CRM — não existe nenhum template pronto hoje (conferido pelo
// usuário direto no banco), então esta function é o único lugar que os
// cria.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crmFetch } from "../_shared/crm-auth.ts";
import { unwrap } from "../_shared/crm-client.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function handleList(ownerId: string) {
  const res = await crmFetch(supabase, ownerId, "/api/v1/message_templates");
  const unwrapped = unwrap(res);
  const templates = Array.isArray(unwrapped) ? unwrapped : [];
  return { ok: true, templates };
}

async function handleSave(
  ownerId: string,
  template: { id?: string; name: string; content: string; mediaUrl?: string },
) {
  const path = template.id ? `/api/v1/message_templates/${template.id}` : "/api/v1/message_templates";
  const res = await crmFetch(supabase, ownerId, path, {
    method: template.id ? "PATCH" : "POST",
    // media_url é especulativo — não confirmado com dados reais do Wavy,
    // revisar assim que houver teste com uma campanha/template real.
    body: JSON.stringify({
      message_template: { name: template.name, content: template.content, media_url: template.mediaUrl ?? undefined },
    }),
  });
  return { ok: true, template: unwrap(res) };
}

async function handleDelete(ownerId: string, id: string) {
  await crmFetch(supabase, ownerId, `/api/v1/message_templates/${id}`, { method: "DELETE" });
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  try {
    const body = await req.json();
    const { ownerId, action } = body as { ownerId?: string; action?: string };
    if (!ownerId || !action) {
      return new Response(JSON.stringify({ error: "ownerId e action são obrigatórios" }), { status: 400 });
    }

    let result: unknown;
    switch (action) {
      case "list":
        result = await handleList(ownerId);
        break;
      case "save":
        result = await handleSave(ownerId, body.template);
        break;
      case "delete":
        result = await handleDelete(ownerId, body.id);
        break;
      default:
        return new Response(JSON.stringify({ error: `action desconhecida: ${action}` }), { status: 400 });
    }

    return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
  } catch (e) {
    console.error("[crm-templates]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
