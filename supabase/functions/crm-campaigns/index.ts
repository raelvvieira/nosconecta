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
//
// `pause_after_count`/`resume_after_minutes`/`contactIds` (segmentação por
// etapa do pipeline) são campos ESPECULATIVOS — nomes plausíveis, não
// confirmados com dados reais da API do Wavy. Revisar assim que houver
// teste com uma campanha real. Pior caso se `contactIds` for ignorado:
// como `sendToAll` já vai `false` nesse caso, a campanha não envia pra
// ninguém (falha segura) em vez de enviar pra todo mundo por engano.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { campaignFetch, crmFetch } from "../_shared/crm-auth.ts";
import { unwrap } from "../_shared/crm-client.ts";
import { findWhatsappInboxId } from "../_shared/crm-inbox.ts";

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

interface SaveCampaignInput {
  id?: string;
  title: string;
  sendToAll: boolean;
  messageInterval: "1_5" | "5_10" | "10_15" | "15_20";
  templateId?: string;
  sourceStageId?: string | null;
  targetStageId?: string | null;
  contactIds?: string[];
  pauseAfterCount?: number | null;
  resumeAfterMinutes?: number | null;
  saveAudienceList?: boolean;
}

async function handleSave(ownerId: string, campaign: SaveCampaignInput) {
  const { data: cred } = await supabase
    .from("crm_credentials")
    .select("inbox_id, whatsapp_status")
    .eq("owner_id", ownerId)
    .maybeSingle();

  let inboxId: string | null = cred?.inbox_id ?? null;
  if (!inboxId && cred?.whatsapp_status === "open") {
    // WhatsApp já pareado, só falta o inbox de Campanhas ainda não ter sido
    // vinculado — tenta resolver agora antes de desistir.
    inboxId = await findWhatsappInboxId(supabase, ownerId);
    if (inboxId) {
      await supabase.from("crm_credentials").update({ inbox_id: inboxId, updated_at: new Date().toISOString() }).eq("owner_id", ownerId);
    }
  }
  if (!inboxId) {
    if (cred?.whatsapp_status === "open") {
      throw new Error(
        "O WhatsApp desta clínica está conectado, mas ainda não conseguimos vincular automaticamente a caixa de " +
          "entrada de campanhas no CRM. Peça a um administrador do Wavy pra confirmar/criar essa inbox, ou informe " +
          "o Inbox ID em Atendimentos → Conectar.",
      );
    }
    throw new Error("Conecte o WhatsApp desta clínica antes de criar campanhas.");
  }

  const path = campaign.id ? `/api/v1/campaigns/${campaign.id}` : "/api/v1/campaigns";
  const body = {
    title: campaign.title,
    type: "simple",
    channelType: "Channel::Whatsapp",
    inboxId: cred.inbox_id,
    sendToAll: campaign.sendToAll,
    templateAllocationConfig: campaign.templateId ? { templateId: campaign.templateId } : undefined,
    deliveryDistribution: {
      message_interval: campaign.messageInterval,
      pause_after_count: campaign.pauseAfterCount ?? undefined,
      resume_after_minutes: campaign.resumeAfterMinutes ?? undefined,
    },
    contactIds: !campaign.sendToAll && campaign.contactIds?.length ? campaign.contactIds : undefined,
  };
  const res = await campaignFetch(supabase, ownerId, path, {
    method: campaign.id ? "PATCH" : "POST",
    body: JSON.stringify(body),
  });
  const saved = unwrap(res);
  const campaignId = String(saved?.id ?? campaign.id ?? "");

  // Guarda localmente o que o Wavy provavelmente não ecoa de volta —
  // etapas de origem/destino, pacing e a lista de pendências de
  // movimentação (gravada já aqui, antes do execute, como rede de
  // segurança caso o loop de movimentação seja interrompido no meio).
  if (campaignId) {
    await supabase.from("crm_campaign_configs").upsert(
      {
        owner_id: ownerId,
        campaign_id: campaignId,
        source_stage_id: campaign.sourceStageId ?? null,
        target_stage_id: campaign.targetStageId ?? null,
        pause_after_count: campaign.pauseAfterCount ?? null,
        resume_after_minutes: campaign.resumeAfterMinutes ?? null,
        audience_contact_ids: campaign.saveAudienceList ? campaign.contactIds ?? [] : null,
        save_audience_list: !!campaign.saveAudienceList,
        move_pending_contact_ids: campaign.targetStageId ? campaign.contactIds ?? [] : [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id,campaign_id" },
    );
  }

  return { ok: true, campaign: saved };
}

// pageSize=1 só pra ler meta.pagination.total sem baixar a lista inteira —
// confirmado que a paginação de /contacts vem em meta.pagination, não em
// data.length (que só reflete a página atual). Quando a campanha é
// segmentada (contactIds presente), a contagem exata já é conhecida — não
// precisa dessa estimativa.
async function estimateRecipients(ownerId: string, contactIds?: string[]): Promise<number> {
  if (contactIds && contactIds.length > 0) return contactIds.length;
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

async function handleExecute(ownerId: string, campaignId: string, contactIds?: string[]) {
  const estimated = await estimateRecipients(ownerId, contactIds);
  const { limit, usedToday } = await getDailyUsage(ownerId);
  if (usedToday + estimated > limit) {
    throw new Error(
      `Limite diário de disparo excedido (${usedToday}/${limit} contatos já usados hoje, esta campanha alcançaria ~${estimated}). Ajuste o limite ou aguarde amanhã.`,
    );
  }

  // Resposta confirmada do /execute: { data: { execution_id, workflow_id,
  // run_id, message } } — sem contagem de destinatários. Usamos a
  // estimativa acima (ou a contagem exata da segmentação) como o número
  // contabilizado no limite diário.
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

async function handleGetConfig(ownerId: string, campaignId: string) {
  const { data } = await supabase
    .from("crm_campaign_configs")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("campaign_id", campaignId)
    .maybeSingle();
  return { ok: true, config: data ?? null };
}

// Chamado pelo frontend depois do loop de movimentação de pipeline: grava
// só os ids que ainda falharam (retry), ou zera de vez se tudo deu certo.
async function handleClearPendingMove(ownerId: string, campaignId: string, remainingIds: string[]) {
  await supabase
    .from("crm_campaign_configs")
    .update({ move_pending_contact_ids: remainingIds, updated_at: new Date().toISOString() })
    .eq("owner_id", ownerId)
    .eq("campaign_id", campaignId);
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
        result = await handleExecute(ownerId, body.campaignId, body.contactIds);
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
      case "get-config":
        result = await handleGetConfig(ownerId, body.campaignId);
        break;
      case "clear-pending-move":
        result = await handleClearPendingMove(ownerId, body.campaignId, body.remainingIds ?? []);
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
