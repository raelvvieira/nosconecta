// Detecta mensagem nova no WhatsApp e avisa a equipe por push.
//
// O CRM não tem webhook de entrada — as conversas só existem por consulta.
// E não dá pra usar data para saber o que é novo: o `created_at` que a lista
// devolve é o da criação da CONVERSA, não o da última mensagem. Então a
// detecção é por contador: guarda quantas não-lidas cada conversa tinha na
// rodada anterior (push_poll_state) e compara. Subiu, chegou mensagem.
//
// Chamada por cron. Roda só para donos que têm aparelho inscrito — sem isso
// gastaria chamada ao CRM para quem nem receberia nada.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crmFetch } from "../_shared/crm-auth.ts";
import { unwrap } from "../_shared/crm-client.ts";
import { pushToOwner } from "../_shared/push.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface ConversationSummary {
  id: string;
  name: string;
  unread: number;
}

function summarize(rows: any[]): ConversationSummary[] {
  return rows
    .map((row) => ({
      id: String(row?.id ?? ""),
      name: row?.contact?.name ?? row?.contact?.phone_number ?? "Contato",
      unread: Number(row?.unread_count ?? 0),
    }))
    .filter((row) => row.id);
}

async function pollOwner(ownerId: string) {
  const res = await crmFetch(supabase, ownerId, "/api/v1/conversations");
  const unwrapped = unwrap(res);
  if (!Array.isArray(unwrapped)) return { ownerId, skipped: "formato inesperado" };
  const conversations = summarize(unwrapped);

  const { data: state } = await supabase
    .from("push_poll_state")
    .select("unread_snapshot")
    .eq("owner_id", ownerId)
    .maybeSingle();

  const previous = (state?.unread_snapshot ?? {}) as Record<string, number>;
  const snapshot: Record<string, number> = {};
  const novas: ConversationSummary[] = [];

  for (const conversation of conversations) {
    snapshot[conversation.id] = conversation.unread;
    const before = previous[conversation.id];
    // `before === undefined` na primeira rodada: registra o estado e não
    // notifica, senão ativar o push despejaria um aviso por conversa antiga
    // que já estava lá.
    if (before !== undefined && conversation.unread > before) novas.push(conversation);
  }

  await supabase.from("push_poll_state").upsert(
    { owner_id: ownerId, unread_snapshot: snapshot, updated_at: new Date().toISOString() },
    { onConflict: "owner_id" },
  );

  if (!novas.length) return { ownerId, sent: 0 };

  // Um aviso só, mesmo com várias conversas: quatro notificações separadas
  // no celular é ruído, não informação.
  const title = novas.length === 1 ? novas[0].name : `${novas.length} conversas com mensagem nova`;
  const body =
    novas.length === 1
      ? "Mandou uma mensagem nova no WhatsApp."
      : novas.map((c) => c.name).slice(0, 4).join(", ");

  const result = await pushToOwner(supabase, ownerId, "whatsapp_message", {
    title,
    body,
    url: "/atendimentos/chat",
  });
  return { ownerId, ...result };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  try {
    // Só quem tem aparelho inscrito entra na varredura.
    const { data: subscribers, error } = await supabase
      .from("push_subscriptions")
      .select("owner_id");
    if (error) throw new Error(error.message);

    const owners = [...new Set((subscribers ?? []).map((row: any) => row.owner_id))];
    if (!owners.length) {
      return new Response(JSON.stringify({ ok: true, owners: 0 }), {
        headers: { "content-type": "application/json" },
      });
    }

    // Um dono com CRM fora do ar não pode impedir os outros de serem
    // avisados.
    const results = await Promise.all(
      owners.map((ownerId) =>
        pollOwner(ownerId as string).catch((e) => ({ ownerId, error: String(e) })),
      ),
    );

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error("[push-poll-conversations]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
