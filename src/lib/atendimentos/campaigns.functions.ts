import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MessageInterval = "1_5" | "5_10" | "10_15" | "15_20";

export const MESSAGE_INTERVAL_OPTIONS: { value: MessageInterval; label: string }[] = [
  { value: "5_10", label: "5 a 10 segundos (padrão sugerido)" },
  { value: "10_15", label: "10 a 15 segundos" },
  { value: "15_20", label: "15 a 20 segundos" },
  { value: "1_5", label: "1 a 5 segundos (não recomendado)" },
];

// Pausar a cada N mensagens / retomar após X minutos — especulativo, ver
// comentário em supabase/functions/crm-campaigns/index.ts.
export const PAUSE_AFTER_OPTIONS = [10, 20, 50, 100];
export const RESUME_AFTER_MINUTES_OPTIONS = [1, 2, 5, 10];

export interface MessageTemplate {
  id: string;
  name: string;
  content: string;
}

export interface Campaign {
  id: string;
  title: string;
  status: string;
  sendToAll: boolean;
  messageInterval: MessageInterval | null;
}

export interface CampaignConfig {
  campaignId: string;
  targetStageId: string | null;
  pauseAfterCount: number | null;
  resumeAfterMinutes: number | null;
  movePendingContactIds: string[];
}

export interface DailyUsage {
  limit: number;
  usedToday: number;
}

async function callTemplates(body: unknown) {
  return callEdgeFunction("crm-templates", body);
}
async function callCampaigns(body: unknown) {
  return callEdgeFunction("crm-campaigns", body);
}

async function callEdgeFunction(name: string, body: unknown) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");
  const res = await fetch(`${url}/functions/v1/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `Falha ao chamar ${name} (${res.status})`);
  return json;
}

function mapTemplate(row: any): MessageTemplate {
  return { id: String(row?.id), name: row?.name ?? "Sem nome", content: row?.content ?? "" };
}

function mapCampaign(row: any): Campaign {
  return {
    id: String(row?.id),
    title: row?.title ?? "Sem título",
    status: row?.status ?? "draft",
    sendToAll: !!row?.sendToAll,
    messageInterval: row?.deliveryDistribution?.message_interval ?? null,
  };
}

function mapCampaignConfig(row: any, campaignId: string): CampaignConfig {
  return {
    campaignId,
    targetStageId: row?.target_stage_id ?? null,
    pauseAfterCount: row?.pause_after_count ?? null,
    resumeAfterMinutes: row?.resume_after_minutes ?? null,
    movePendingContactIds: row?.move_pending_contact_ids ?? [],
  };
}

export const getMessageTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MessageTemplate[]> => {
    const json = await callTemplates({ ownerId: context.userId, action: "list" });
    return (json.templates ?? []).map(mapTemplate);
  });

export const saveMessageTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id?: string; name: string; content: string; mediaUrl?: string }) => input)
  .handler(async ({ data, context }) => {
    const json = await callTemplates({ ownerId: context.userId, action: "save", template: data });
    return { ok: true, template: json.template ? mapTemplate(json.template) : null };
  });

export const getCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Campaign[]> => {
    const json = await callCampaigns({ ownerId: context.userId, action: "list" });
    return (json.campaigns ?? []).map(mapCampaign);
  });

export const saveCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id?: string;
      title: string;
      sendToAll: boolean;
      messageInterval: MessageInterval;
      templateId?: string;
      // targetStageId/pauseAfterCount/resumeAfterMinutes: metadado local
      // (crm_campaign_configs), não vai no payload de segmentação — CRM
      // não suporta segmentar campanha por etapa do pipeline (confirmado
      // no manual de integração v2, seção 14). pauseAfterCount/
      // resumeAfterMinutes seguem especulativos no payload do Wavy — ver
      // comentário em crm-campaigns/index.ts.
      targetStageId?: string | null;
      // Ids de pipeline item a mover pra targetStageId após o envio — ver
      // comentário em crm-campaigns/index.ts.
      moveContactIds?: string[];
      pauseAfterCount?: number | null;
      resumeAfterMinutes?: number | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const json = await callCampaigns({ ownerId: context.userId, action: "save", campaign: data });
    return { ok: true, campaign: json.campaign ? mapCampaign(json.campaign) : null };
  });

export const executeCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { campaignId: string }) => input)
  .handler(async ({ data, context }) => {
    const json = await callCampaigns({ ownerId: context.userId, action: "execute", campaignId: data.campaignId });
    return { ok: true, recipientsCounted: json.recipientsCounted ?? 0 };
  });

export const campaignLifecycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { campaignId: string; action: "schedule" | "pause" | "resume" | "stop"; scheduleTo?: string }) => input)
  .handler(async ({ data, context }) => {
    await callCampaigns({
      ownerId: context.userId,
      action: data.action,
      campaignId: data.campaignId,
      scheduleTo: data.scheduleTo,
    });
    return { ok: true };
  });

export const getDailySendUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DailyUsage> => {
    const json = await callCampaigns({ ownerId: context.userId, action: "get-usage" });
    return json.usage ?? { limit: 200, usedToday: 0 };
  });

export const setDailySendLimit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit: number }) => input)
  .handler(async ({ data, context }) => {
    await callCampaigns({ ownerId: context.userId, action: "set-limit", limit: data.limit });
    return { ok: true };
  });

export const getCampaignConfig = createServerFn({ method: "GET" })
  .inputValidator((input: { campaignId: string }) => input)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<CampaignConfig | null> => {
    const json = await callCampaigns({ ownerId: context.userId, action: "get-config", campaignId: data.campaignId });
    return json.config ? mapCampaignConfig(json.config, data.campaignId) : null;
  });

// Chamado depois do loop de mover contatos pra etapa de destino (rodado no
// frontend — ver CreateTransmissionDialog): grava só os ids que ainda
// falharam, permitindo retomar depois; passar [] quando tudo deu certo.
export const updatePendingMove = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { campaignId: string; remainingIds: string[] }) => input)
  .handler(async ({ data, context }) => {
    await callCampaigns({
      ownerId: context.userId,
      action: "clear-pending-move",
      campaignId: data.campaignId,
      remainingIds: data.remainingIds,
    });
    return { ok: true };
  });
