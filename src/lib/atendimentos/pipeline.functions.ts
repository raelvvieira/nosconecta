import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface PipelineStage {
  id: string;
  name: string;
  position: number;
  color: string | null;
}

export interface PipelineItem {
  id: string;
  type: "conversation" | "contact";
  itemId: string;
  stageId: string;
  title: string | null;
}

async function callEdgeFunction(body: unknown) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");
  const res = await fetch(`${url}/functions/v1/crm-pipeline`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `Falha ao chamar crm-pipeline (${res.status})`);
  return json;
}

function mapStage(row: any): PipelineStage {
  return {
    id: String(row?.id),
    name: row?.name ?? "Sem nome",
    position: row?.position ?? 0,
    color: row?.color ?? null,
  };
}

// Formato exato do item ainda não confirmado com dados reais — mapeamento
// defensivo, revisar assim que houver credenciais de teste.
function mapItem(row: any): PipelineItem {
  return {
    id: String(row?.id),
    type: row?.type === "contact" ? "contact" : "conversation",
    itemId: String(row?.item_id ?? row?.conversation_id ?? row?.contact_id ?? ""),
    stageId: String(row?.pipeline_stage_id ?? row?.stage_id ?? ""),
    title: row?.title ?? row?.conversation?.meta?.sender?.name ?? row?.contact?.name ?? null,
  };
}

export const getPipelineStages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ configured: boolean; stages: PipelineStage[] }> => {
    const json = await callEdgeFunction({ ownerId: context.userId, action: "list-stages" });
    return { configured: !!json.configured, stages: (json.stages ?? []).map(mapStage) };
  });

export const getPipelineItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ configured: boolean; items: PipelineItem[] }> => {
    const json = await callEdgeFunction({ ownerId: context.userId, action: "list-items" });
    return { configured: !!json.configured, items: (json.items ?? []).map(mapItem) };
  });

export const setPipelineId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pipelineId: string }) => input)
  .handler(async ({ data, context }) => {
    await callEdgeFunction({ ownerId: context.userId, action: "set-pipeline-id", pipelineId: data.pipelineId });
    return { ok: true };
  });

export const createPipeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string }) => input)
  .handler(async ({ data, context }) => {
    const json = await callEdgeFunction({ ownerId: context.userId, action: "create-pipeline", name: data.name });
    return { ok: true, pipelineId: json.pipelineId as string };
  });

export const savePipelineStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id?: string; name: string; position?: number; color?: string }) => input)
  .handler(async ({ data, context }) => {
    await callEdgeFunction({ ownerId: context.userId, action: "save-stage", stage: data });
    return { ok: true };
  });

export const deletePipelineStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    await callEdgeFunction({ ownerId: context.userId, action: "delete-stage", stageId: data.id });
    return { ok: true };
  });

export const reorderPipelineStages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderedIds: string[] }) => input)
  .handler(async ({ data, context }) => {
    await callEdgeFunction({ ownerId: context.userId, action: "reorder-stages", orderedIds: data.orderedIds });
    return { ok: true };
  });

export const addPipelineItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { type: "conversation" | "contact"; itemId: string; stageId: string }) => input)
  .handler(async ({ data, context }) => {
    await callEdgeFunction({ ownerId: context.userId, action: "add-item", item: data });
    return { ok: true };
  });

export const movePipelineItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { itemId: string; newStageId: string; notes?: string }) => input)
  .handler(async ({ data, context }) => {
    await callEdgeFunction({ ownerId: context.userId, action: "move-item", move: data });
    return { ok: true };
  });
