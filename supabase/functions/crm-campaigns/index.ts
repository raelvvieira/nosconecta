// Campanhas de disparo em massa via CRM (domínio flow.wavymarketing.com.br,
// mesmo token de login do api.wavymarketing.com.br). Além do
// `message_interval` que já existe no motor de disparo, aplicamos uma
// proteção própria: limite configurável de contatos/dia por clínica,
// checado ANTES de chamar /execute — se estourar, nem chega a chamar o CRM.
//
// Limitação conhecida: só cobrimos campanhas disparadas via /execute a
// partir desta tela. Uma campanha agendada (schedule) que dispara sozinha
// depois, sem passar por aqui, não é contabilizada no limite diário — não
// existe webhook do CRM avisando quando isso acontece.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { campaignFetch, crmFetch } from "../_shared/crm-auth.ts";
import { unwrap } from "../_shared/crm-client.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function handleList(ownerId: string) {
  const res = await campaignFetch(supabase, ownerId, "/api/v1/campaigns");
  const unwrapped = unwrap(res);
  const campaigns = Array.isArray(unwrapped) ? unwrapped : [];
  return { ok: true, campaigns };
}

async function handleDetail(ownerId: string, campaignId: string) {
  const res = await campaignFetch(supabase, ownerId, `/api/v1/campaigns/${campaignId}`);
  return { ok: true, campaign: unwrap(res) };
}

async function handleSave(
  ownerId: string,
  campaign: {
    id?: string;
    title: string;
    sendToAll: boolean;
    messageInterval: "1_5" | "5_10" | "10_15" | "15_20";
    templateId?: string;
  },
) {
  const { data: cred } = await supabase
    .from("crm_credentials")
    .select("inbox_id")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!cred?.inbox_id) throw new Error("Conecte o WhatsApp desta clínica antes de criar campanhas.");

  const path = campaign.id ? `/api/v1/campaigns/${campaign.id}` : "/api/v1/campaigns";
  const body = {
    title: campaign.title,
    type: "simple",
    channelType: "Channel::Whatsapp",
    inboxId: cred.inbox_id,
    sendToAll: campaign.sendToAll,
    templateAllocationConfig: campaign.templateId ? { templateId: campaign.templateId } : undefined,
    deliveryDistribution: { message_interval: campaign.messageInterval },
  };
  const res = await campaignFetch(supabase, ownerId, path, {
    method: campaign.id ? "PATCH" : "POST",
    body: JSON.stringify(body),
  });
  return { ok: true, campaign: unwrap(res) };
}

// pageSize=1 só pra ler meta.pagination.total sem baixar a lista inteira —
// confirmado que a paginação de /contacts vem em meta.pagination, não em
// data.length (que só reflete a página atual).
async function estimateRecipients(ownerId: string): Promise<number> {
  try {
    const res = await crmFetch(supabase, ownerId, "/api/v1/contacts?page=1&pageSize=1");
    return Number(res?.meta?.pagination?.total ?? 0);
  } catch {
    return 0;
  }
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
  const usedToday = (sends ?? []).reduce((sum: number, r: any) => sum + (r.recipient_count ?? 0), 0);
  return { limit, usedToday };
}

async function handleExecute(ownerId: string, campaignId: string) {
  const estimated = await estimateRecipients(ownerId);
  const { limit, usedToday } = await getDailyUsage(ownerId);
  if (usedToday + estimated > limit) {
    throw new Error(
      `Limite diário de disparo excedido (${usedToday}/${limit} contatos já usados hoje, esta campanha alcançaria ~${estimated}). Ajuste o limite ou aguarde amanhã.`,
    );
  }

  // Resposta confirmada do /execute: { data: { execution_id, workflow_id,
  // run_id, message } } — sem contagem de destinatários. Usamos a
  // estimativa de /contacts como o número contabilizado no limite diário.
  const res = await campaignFetch(supabase, ownerId, `/api/v1/campaigns/${campaignId}/execute`, { method: "POST" });
  await supabase.from("crm_campaign_sends").insert({ owner_id: ownerId, campaign_id: campaignId, recipient_count: estimated });
  return { ok: true, campaign: unwrap(res), recipientsCounted: estimated };
}

async function handleLifecycle(ownerId: string, campaignId: string, action: "schedule" | "pause" | "resume" | "stop", scheduleTo?: string) {
  const init: RequestInit =
    action === "schedule" ? { method: "POST", body: JSON.stringify({ scheduleTo }) } : { method: "POST" };
  const res = await campaignFetch(supabase, ownerId, `/api/v1/campaigns/${campaignId}/${action}`, init);
  return { ok: true, campaign: unwrap(res) };
}

async function handleSetLimit(ownerId: string, limit: number) {
  await supabase
    .from("crm_credentials")
    .update({ daily_send_limit: limit, updated_at: new Date().toISOString() })
    .eq("owner_id", ownerId);
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
      case "detail":
        result = await handleDetail(ownerId, body.campaignId);
        break;
      case "save":
        result = await handleSave(ownerId, body.campaign);
        break;
      case "execute":
        result = await handleExecute(ownerId, body.campaignId);
        break;
      case "schedule":
        result = await handleLifecycle(ownerId, body.campaignId, "schedule", body.scheduleTo);
        break;
      case "pause":
        result = await handleLifecycle(ownerId, body.campaignId, "pause");
        break;
      case "resume":
        result = await handleLifecycle(ownerId, body.campaignId, "resume");
        break;
      case "stop":
        result = await handleLifecycle(ownerId, body.campaignId, "stop");
        break;
      case "get-usage":
        result = { ok: true, usage: await getDailyUsage(ownerId) };
        break;
      case "set-limit":
        result = await handleSetLimit(ownerId, Number(body.limit));
        break;
      default:
        return new Response(JSON.stringify({ error: `action desconhecida: ${action}` }), { status: 400 });
    }

    return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
  } catch (e) {
    console.error("[crm-campaigns]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
