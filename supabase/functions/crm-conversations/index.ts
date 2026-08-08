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

// Agendamento é um recurso genérico do CRM (/scheduled_actions serve pra
// mensagem, tarefa, mudança de etapa etc.). Aqui só usamos `send_message`,
// que é o caso do chat.
async function handleSchedule(
  ownerId: string,
  input: { conversationId: string; contactId?: string | null; content: string; scheduledFor: string },
) {
  const res = await crmFetch(supabase, ownerId, "/api/v1/scheduled_actions", {
    method: "POST",
    body: JSON.stringify({
      scheduled_action: {
        action_type: "send_message",
        scheduled_for: input.scheduledFor,
        conversation_id: input.conversationId,
        contact_id: input.contactId ?? undefined,
        payload: { content: input.content },
        recurrence_type: "once",
        max_retries: 3,
      },
    }),
  });
  return { ok: true, scheduled: unwrap(res) };
}

async function handleListScheduled(ownerId: string, contactId: string) {
  const res = await crmFetch(supabase, ownerId, `/api/v1/scheduled_actions/by_contact/${contactId}`);
  const unwrapped = unwrap(res);
  return { ok: true, scheduled: Array.isArray(unwrapped) ? unwrapped : [] };
}

async function handleCancelScheduled(ownerId: string, scheduledId: string) {
  await crmFetch(supabase, ownerId, `/api/v1/scheduled_actions/${scheduledId}`, { method: "DELETE" });
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  try {
    const { ownerId, action, conversationId, content, isPrivate, attachments, contactId, scheduledFor, scheduledId } =
      (await req.json()) as {
        ownerId?: string;
        action?: string;
        conversationId?: string;
        content?: string;
        isPrivate?: boolean;
        attachments?: OutgoingAttachment[];
        contactId?: string | null;
        scheduledFor?: string;
        scheduledId?: string;
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
    } else if (action === "schedule") {
      if (!conversationId || !content?.trim() || !scheduledFor) {
        return new Response(
          JSON.stringify({ error: "conversationId, content e scheduledFor são obrigatórios" }),
          { status: 400 },
        );
      }
      result = await handleSchedule(ownerId, {
        conversationId,
        contactId,
        content: content.trim(),
        scheduledFor,
      });
    } else if (action === "list-scheduled") {
      if (!contactId) return new Response(JSON.stringify({ error: "contactId é obrigatório" }), { status: 400 });
      result = await handleListScheduled(ownerId, contactId);
    } else if (action === "cancel-scheduled") {
      if (!scheduledId) return new Response(JSON.stringify({ error: "scheduledId é obrigatório" }), { status: 400 });
      result = await handleCancelScheduled(ownerId, scheduledId);
    } else {
      return new Response(JSON.stringify({ error: `action desconhecida: ${action}` }), { status: 400 });
    }

    return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
  } catch (e) {
    console.error("[crm-conversations]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
