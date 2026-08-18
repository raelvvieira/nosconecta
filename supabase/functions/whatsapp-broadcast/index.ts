// Disparo próprio para uma lista escolhida a dedo.
//
// Por que existe: o motor de campanhas do Wavy só manda para TODOS. O manual de
// integração v2 (seção 14) confirma que `contactIds` é ignorado, e toda campanha
// vai `sendToAll: true` — não há como recortar "só o DDD 48" por lá. Aqui a
// mensagem sai uma a uma, pelo mesmo endpoint que o chat usa.
//
// A cota do dia é a MESMA das campanhas (`crm_campaign_sends`): o WhatsApp é um
// só, e dois contadores separados deixariam o número exposto ao dobro do que a
// clínica escolheu como limite.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enviarWhatsapp } from "../_shared/whatsapp-send.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** Quantos alvos vencidos cada tick processa. O cron roda a cada minuto, e o
 *  teto existe para a função não estourar o tempo com uma fila represada. */
const POR_TICK = 40;

interface AlvoEntrada {
  contactId: string;
  conversationId?: string | null;
  name?: string | null;
  phone?: string | null;
}

async function getDailyUsage(ownerId: string): Promise<{ limit: number; usedToday: number }> {
  const { data: cred } = await supabase
    .from("crm_credentials")
    .select("daily_send_limit")
    .eq("owner_id", ownerId)
    .maybeSingle();
  const limit = cred?.daily_send_limit ?? 200;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { data: sends } = await supabase
    .from("crm_campaign_sends")
    .select("recipient_count")
    .eq("owner_id", ownerId)
    .gte("executed_at", startOfDay.toISOString());
  const usedToday = (sends ?? []).reduce((s: number, r: any) => s + (r.recipient_count ?? 0), 0);
  return { limit, usedToday };
}

async function handleCreate(
  ownerId: string,
  message: string,
  intervalSeconds: number,
  alvos: AlvoEntrada[],
) {
  if (!message?.trim()) throw new Error("Escreva a mensagem antes de disparar.");
  if (!alvos?.length) throw new Error("Selecione ao menos um contato.");

  // Confere ANTES de enfileirar: enfileirar e recusar depois deixaria metade
  // das mensagens saindo antes de alguém perceber.
  const { limit, usedToday } = await getDailyUsage(ownerId);
  if (usedToday + alvos.length > limit) {
    throw new Error(
      `Limite diário excedido (${usedToday}/${limit} contatos hoje, esta seleção tem ${alvos.length}). Ajuste o limite ou aguarde amanhã.`,
    );
  }

  const passo = Math.max(1, Math.min(intervalSeconds, 300));
  const { data: lote, error } = await supabase
    .from("whatsapp_broadcasts")
    .insert({
      owner_id: ownerId,
      message: message.trim(),
      interval_seconds: passo,
      total: alvos.length,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const inicio = Date.now();
  const linhas = alvos.map((a, i) => ({
    broadcast_id: lote.id,
    owner_id: ownerId,
    contact_id: a.contactId,
    conversation_id: a.conversationId ?? null,
    contact_name: a.name ?? null,
    phone: a.phone ?? null,
    // O primeiro sai já; os outros escalonados. É aqui que o ritmo mora.
    scheduled_for: new Date(inicio + i * passo * 1000).toISOString(),
  }));
  const { error: erroAlvos } = await supabase.from("whatsapp_broadcast_targets").insert(linhas);
  if (erroAlvos) throw new Error(erroAlvos.message);

  // Debita a cota inteira agora, como o disparo de campanha já faz: cancelar no
  // meio não devolve, porque o que já saiu não volta.
  await supabase
    .from("crm_campaign_sends")
    .insert({ owner_id: ownerId, campaign_id: `broadcast:${lote.id}`, recipient_count: alvos.length });

  return {
    ok: true,
    broadcastId: lote.id,
    total: alvos.length,
    terminaEm: new Date(inicio + (alvos.length - 1) * passo * 1000).toISOString(),
  };
}

async function handleTick() {
  const agora = new Date().toISOString();
  const { data: alvos } = await supabase
    .from("whatsapp_broadcast_targets")
    .select("id, owner_id, broadcast_id, contact_id, conversation_id")
    .eq("status", "pending")
    .lte("scheduled_for", agora)
    .order("scheduled_for", { ascending: true })
    .limit(POR_TICK);

  if (!alvos?.length) return { ok: true, enviados: 0, falhas: 0 };

  // A mensagem e o status do lote são lidos uma vez por lote, não por alvo.
  const lotes = new Map<string, { message: string; status: string }>();
  for (const id of new Set(alvos.map((a: any) => a.broadcast_id))) {
    const { data } = await supabase
      .from("whatsapp_broadcasts")
      .select("message, status")
      .eq("id", id)
      .maybeSingle();
    if (data) lotes.set(String(id), data);
  }

  let enviados = 0;
  let falhas = 0;

  for (const alvo of alvos as any[]) {
    const lote = lotes.get(alvo.broadcast_id);
    // Lote cancelado entre o agendamento e agora: o alvo não sai.
    if (!lote || lote.status !== "running") {
      await supabase
        .from("whatsapp_broadcast_targets")
        .update({ status: "skipped", error: "Lote cancelado" })
        .eq("id", alvo.id);
      continue;
    }

    try {
      const { via } = await enviarWhatsapp(supabase, alvo.owner_id, alvo, lote.message);
      await supabase
        .from("whatsapp_broadcast_targets")
        .update({ status: "sent", sent_via: via, sent_at: new Date().toISOString(), error: null })
        .eq("id", alvo.id);
      enviados++;
    } catch (e) {
      // Uma falha não para a fila: o resto da lista não tem culpa.
      await supabase
        .from("whatsapp_broadcast_targets")
        .update({ status: "failed", error: String(e).slice(0, 500) })
        .eq("id", alvo.id);
      falhas++;
    }
  }

  // Lote sem nenhum pendente vira concluído.
  for (const id of lotes.keys()) {
    const { count } = await supabase
      .from("whatsapp_broadcast_targets")
      .select("id", { count: "exact", head: true })
      .eq("broadcast_id", id)
      .eq("status", "pending");
    if ((count ?? 0) === 0) {
      await supabase
        .from("whatsapp_broadcasts")
        .update({ status: "done", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "running");
    }
  }

  return { ok: true, enviados, falhas };
}

async function handleCancel(ownerId: string, broadcastId: string) {
  await supabase
    .from("whatsapp_broadcasts")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", broadcastId)
    .eq("owner_id", ownerId);
  const { count } = await supabase
    .from("whatsapp_broadcast_targets")
    .update({ status: "skipped", error: "Lote cancelado" }, { count: "exact" })
    .eq("broadcast_id", broadcastId)
    .eq("owner_id", ownerId)
    .eq("status", "pending");
  // A cota já debitada não é devolvida: quem já recebeu, recebeu.
  return { ok: true, cancelados: count ?? 0 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  try {
    const body = await req.json().catch(() => ({}));
    const { ownerId, action } = body as { ownerId?: string; action?: string };

    // `tick` vem do cron e varre todos os donos — não tem ownerId.
    if (action === "tick" || !action) {
      const result = await handleTick();
      return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
    }

    if (!ownerId) {
      return new Response(JSON.stringify({ error: "ownerId é obrigatório" }), { status: 400 });
    }

    let result: unknown;
    switch (action) {
      case "create":
        result = await handleCreate(
          ownerId,
          body.message,
          Number(body.intervalSeconds ?? 8),
          body.targets ?? [],
        );
        break;
      case "cancel":
        result = await handleCancel(ownerId, body.broadcastId);
        break;
      default:
        return new Response(JSON.stringify({ error: `action desconhecida: ${action}` }), { status: 400 });
    }

    return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
  } catch (e) {
    console.error("[whatsapp-broadcast]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
