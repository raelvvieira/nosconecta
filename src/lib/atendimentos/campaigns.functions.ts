import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MessageInterval = "1_5" | "5_10" | "10_15" | "15_20";

export const MESSAGE_INTERVAL_OPTIONS: { value: MessageInterval; label: string }[] = [
  { value: "5_10", label: "5 a 10 segundos (padrão sugerido)" },
  { value: "10_15", label: "10 a 15 segundos" },
  { value: "15_20", label: "15 a 20 segundos" },
  { value: "1_5", label: "1 a 5 segundos (não recomendado)" },
];

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

export const getMessageTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MessageTemplate[]> => {
    const json = await callTemplates({ ownerId: context.userId, action: "list" });
    return (json.templates ?? []).map(mapTemplate);
  });

export const saveMessageTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id?: string; name: string; content: string }) => input)
  .handler(async ({ data, context }) => {
    await callTemplates({ ownerId: context.userId, action: "save", template: data });
    return { ok: true };
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
    (input: { id?: string; title: string; sendToAll: boolean; messageInterval: MessageInterval; templateId?: string }) =>
      input,
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
