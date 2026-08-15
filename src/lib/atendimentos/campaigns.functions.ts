import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";

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

/** Status conhecidos. `null` = o CRM mandou algo que não sabemos traduzir. */
export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "running"
  | "paused"
  | "completed"
  | "stopped";

const STATUS_CONHECIDOS: CampaignStatus[] = [
  "draft",
  "scheduled",
  "running",
  "paused",
  "completed",
  "stopped",
];

/**
 * Normaliza o status vindo do CRM.
 *
 * O Wavy devolve o status como número em algumas respostas, e a tela imprimia
 * esse número cru — era de onde vinha o "4" que parecia contagem de contatos.
 * Enquanto o de-para numérico não estiver confirmado com o CRM, um valor
 * desconhecido vira `null` e a interface mostra "—": não saber é melhor que
 * mostrar um número que a pessoa vai interpretar como outra coisa.
 */
function normalizeStatus(raw: unknown): CampaignStatus | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  return (STATUS_CONHECIDOS as string[]).includes(s) ? (s as CampaignStatus) : null;
}

export interface Campaign {
  id: string;
  title: string;
  status: CampaignStatus | null;
  sendToAll: boolean;
  messageInterval: MessageInterval | null;
}

export interface CampaignSend {
  id: string;
  executedAt: string;
  recipientCount: number;
}

export interface CampaignDetail extends Campaign {
  /** Id do template no CRM; o conteúdo vem cruzando com getMessageTemplates. */
  templateId: string | null;
  pauseAfterCount: number | null;
  resumeAfterMinutes: number | null;
  /** Estimativa de destinatários — igual para toda campanha, já que todas são
   *  "todos os contatos". */
  estimatedRecipients: number;
  usage: DailyUsage;
  sends: CampaignSend[];
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
    status: normalizeStatus(row?.status),
    // O resto do payload do Wavy é snake_case; ler só camelCase dava sempre
    // `undefined`, e a tela escrevia "Segmento" para 100% das campanhas —
    // exatamente o contrário da verdade, já que toda campanha é criada com
    // sendToAll: true (o CRM não segmenta por etapa).
    sendToAll: Boolean(row?.sendToAll ?? row?.send_to_all ?? true),
    messageInterval:
      row?.deliveryDistribution?.message_interval ?? row?.delivery_distribution?.message_interval ?? null,
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
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<MessageTemplate[]> => {
    const json = await callTemplates({ ownerId: context.ownerId, action: "list" });
    return (json.templates ?? []).map(mapTemplate);
  });

export const saveMessageTemplate = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { id?: string; name: string; content: string; mediaUrl?: string }) => {
    // Mesma regra que já vale pro disparo por seleção (criarDisparo) — texto
    // ou imagem, nunca os dois vazios. A tela já trava isto antes de chegar
    // aqui (isComposerReady em NewCampaignSheet.tsx); isto é rede de
    // segurança para quem bater direto no endpoint.
    if (!input.content?.trim() && !input.mediaUrl) {
      throw new Error("A mensagem precisa ter texto ou imagem.");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const json = await callTemplates({ ownerId: context.ownerId, action: "save", template: data });
    return { ok: true, template: json.template ? mapTemplate(json.template) : null };
  });

export const getCampaigns = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<Campaign[]> => {
    const json = await callCampaigns({ ownerId: context.ownerId, action: "list" });
    return (json.campaigns ?? []).map(mapCampaign);
  });

/**
 * Detalhe de uma campanha, com o que a revisão de disparo precisa mostrar.
 *
 * Liga a action `"detail"`, que existia na Edge Function desde sempre e nunca
 * tinha sido chamada por nenhuma tela — era por isso que não dava para abrir
 * uma campanha e ver do que ela tratava.
 *
 * O formato da resposta de `/api/v1/campaigns/{id}` não está documentado no
 * repositório e nenhum código a consumia até agora, então a leitura aqui é
 * defensiva: tenta camelCase e snake_case, e devolve `null` em vez de inventar
 * valor quando o campo não vier.
 */
export const getCampaignDetail = createServerFn({ method: "GET" })
  .inputValidator((input: { campaignId: string }) => input)
  .middleware([requireClinicMembership])
  .handler(async ({ data, context }): Promise<CampaignDetail> => {
    const json = await callCampaigns({
      ownerId: context.ownerId,
      action: "detail",
      campaignId: data.campaignId,
    });
    const row = json.campaign ?? {};
    const base = mapCampaign({ ...row, id: row?.id ?? data.campaignId });
    const dist = row?.deliveryDistribution ?? row?.delivery_distribution ?? {};

    return {
      ...base,
      templateId:
        row?.templateAllocationConfig?.templateId ??
        row?.template_allocation_config?.template_id ??
        null,
      pauseAfterCount: dist?.pause_after_count ?? null,
      resumeAfterMinutes: dist?.resume_after_minutes ?? null,
      estimatedRecipients: Number(json.estimatedRecipients ?? 0),
      usage: json.usage ?? { limit: 200, usedToday: 0 },
      sends: (json.sends ?? []).map((s: any) => ({
        id: String(s.id),
        executedAt: s.executed_at,
        recipientCount: Number(s.recipient_count ?? 0),
      })),
    };
  });

export const saveCampaign = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
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
    const json = await callCampaigns({ ownerId: context.ownerId, action: "save", campaign: data });
    return { ok: true, campaign: json.campaign ? mapCampaign(json.campaign) : null };
  });

export const executeCampaign = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { campaignId: string }) => input)
  .handler(async ({ data, context }) => {
    const json = await callCampaigns({ ownerId: context.ownerId, action: "execute", campaignId: data.campaignId });
    return { ok: true, recipientsCounted: json.recipientsCounted ?? 0 };
  });

export const deleteCampaign = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { campaignId: string }) => input)
  .handler(async ({ data, context }) => {
    await callCampaigns({ ownerId: context.ownerId, action: "delete", campaignId: data.campaignId });
    return { ok: true };
  });

export const campaignLifecycle = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { campaignId: string; action: "schedule" | "pause" | "resume" | "stop"; scheduleTo?: string }) => input)
  .handler(async ({ data, context }) => {
    await callCampaigns({
      ownerId: context.ownerId,
      action: data.action,
      campaignId: data.campaignId,
      scheduleTo: data.scheduleTo,
    });
    return { ok: true };
  });

/** Quantos contatos uma campanha alcançaria hoje — a conta inteira do CRM. */
export const getEstimatedRecipients = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<number> => {
    const json = await callCampaigns({ ownerId: context.ownerId, action: "estimate" });
    return Number(json.estimated ?? 0);
  });

export const getDailySendUsage = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<DailyUsage> => {
    const json = await callCampaigns({ ownerId: context.ownerId, action: "get-usage" });
    return json.usage ?? { limit: 200, usedToday: 0 };
  });

export const setDailySendLimit = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { limit: number }) => input)
  .handler(async ({ data, context }) => {
    await callCampaigns({ ownerId: context.ownerId, action: "set-limit", limit: data.limit });
    return { ok: true };
  });

export const getCampaignConfig = createServerFn({ method: "GET" })
  .inputValidator((input: { campaignId: string }) => input)
  .middleware([requireClinicMembership])
  .handler(async ({ data, context }): Promise<CampaignConfig | null> => {
    const json = await callCampaigns({ ownerId: context.ownerId, action: "get-config", campaignId: data.campaignId });
    return json.config ? mapCampaignConfig(json.config, data.campaignId) : null;
  });

// Chamado depois do loop de mover contatos pra etapa de destino (rodado no
// frontend — ver CreateTransmissionDialog): grava só os ids que ainda
// falharam, permitindo retomar depois; passar [] quando tudo deu certo.
export const updatePendingMove = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { campaignId: string; remainingIds: string[] }) => input)
  .handler(async ({ data, context }) => {
    await callCampaigns({
      ownerId: context.ownerId,
      action: "clear-pending-move",
      campaignId: data.campaignId,
      remainingIds: data.remainingIds,
    });
    return { ok: true };
  });
