// Lista conversas/mensagens do inbox de WhatsApp da clínica no CRM, e envia
// mensagens novas. Nada é espelhado localmente — cada chamada busca ao vivo
// no CRM; o cache curto fica só no TanStack Query do front-end.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crmFetch } from "../_shared/crm-auth.ts";
import { unwrap } from "../_shared/crm-client.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function handleList(ownerId: string) {
  const res = await crmFetch(supabase, ownerId, "/api/v1/conversations");
  const unwrapped = unwrap(res);
  return { ok: true, conversations: Array.isArray(unwrapped) ? unwrapped : [] };
}

async function handleMessages(ownerId: string, conversationId: string) {
  const res = await crmFetch(supabase, ownerId, `/api/v1/conversations/${conversationId}/messages`);
  const unwrapped = unwrap(res);
  return { ok: true, messages: Array.isArray(unwrapped) ? unwrapped : [] };
}

interface OutgoingAttachment {
  name: string;
  type: string;
  // Conteúdo do arquivo em base64 (sem o prefixo `data:...;base64,`). É
  // assim que o binário atravessa server function → Edge Function, que só
  // trafegam JSON.
  data: string;
  // Marca áudio gravado na hora: é o que faz o WhatsApp exibir como
  // mensagem de voz em vez de arquivo anexado.
  isRecordedAudio?: boolean;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// `private: true` = nota interna: fica registrada na conversa dentro do CRM
// mas NÃO é enviada pro contato no WhatsApp.
//
// Com anexo, o mesmo endpoint muda de JSON pra multipart/form-data — não há
// upload separado, o arquivo vai junto da mensagem. O tipo (imagem, vídeo,
// documento, áudio) é deduzido pelo CRM a partir do content_type do arquivo,
// então não mandamos campo de tipo.
async function handleSend(
  ownerId: string,
  conversationId: string,
  content: string,
  isPrivate = false,
  attachments: OutgoingAttachment[] = [],
) {
  const path = `/api/v1/conversations/${conversationId}/messages`;

  if (attachments.length === 0) {
    const res = await crmFetch(supabase, ownerId, path, {
      method: "POST",
      body: JSON.stringify({ content, message_type: "outgoing", private: isPrivate }),
    });
    return { ok: true, message: res };
  }

  const form = new FormData();
  form.append("content", content ?? "");
  form.append("message_type", "outgoing");
  form.append("private", String(isPrivate));
  for (const att of attachments) {
    const file = new File([base64ToBytes(att.data)], att.name, {
      type: att.type || "application/octet-stream",
    });
    form.append("attachments[]", file);
    if (att.isRecordedAudio) form.append("is_recorded_audio[]", att.name);
  }

  const res = await crmFetch(supabase, ownerId, path, { method: "POST", body: form });
  return { ok: true, message: res };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  try {
    const { ownerId, action, conversationId, content, isPrivate, attachments } = (await req.json()) as {
      ownerId?: string;
      action?: string;
      conversationId?: string;
      content?: string;
      isPrivate?: boolean;
      attachments?: OutgoingAttachment[];
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
      const files = attachments ?? [];
      // Com anexo, o texto é opcional (mandar só a foto é um caso normal).
      if (!conversationId || (!content?.trim() && files.length === 0)) {
        return new Response(JSON.stringify({ error: "conversationId e conteúdo (texto ou anexo) são obrigatórios" }), {
          status: 400,
        });
      }
      result = await handleSend(ownerId, conversationId, content?.trim() ?? "", !!isPrivate, files);
    } else {
      return new Response(JSON.stringify({ error: `action desconhecida: ${action}` }), { status: 400 });
    }

    return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
  } catch (e) {
    console.error("[crm-conversations]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
