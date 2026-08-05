// CRUD de etapas do funil + listagem/movimentação de itens no pipeline do
// CRM. A conta não vem com nenhum pipeline pronto — a própria tela cria um
// (action "create-pipeline") na primeira vez. "set-pipeline-id" fica como
// fallback manual pra vincular um pipeline já existente (útil se um dia a
// mesma clínica precisar trocar de pipeline).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crmFetch } from "../_shared/crm-auth.ts";
import { unwrap } from "../_shared/crm-client.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function getPipelineIdOrNull(ownerId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("crm_credentials")
    .select("pipeline_id")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.pipeline_id ?? null;
}

async function requirePipelineId(ownerId: string): Promise<string> {
  const id = await getPipelineIdOrNull(ownerId);
  if (!id) throw new Error("Configure o Pipeline ID desta clínica antes de usar o funil.");
  return id;
}

async function handleSetPipelineId(ownerId: string, pipelineId: string) {
  await supabase
    .from("crm_credentials")
    .update({ pipeline_id: pipelineId, updated_at: new Date().toISOString() })
    .eq("owner_id", ownerId);
  return { ok: true };
}

async function handleCreatePipeline(ownerId: string, name: string) {
  const res = await crmFetch(supabase, ownerId, "/api/v1/pipelines", {
    method: "POST",
    body: JSON.stringify({
      pipeline: { name, description: "Funil de atendimento" },
      create_default_stages: false,
    }),
  });
  const pipelineId = unwrap(res)?.id;
  if (!pipelineId) throw new Error("O CRM não retornou o id do pipeline criado.");
  await supabase
    .from("crm_credentials")
    .update({ pipeline_id: String(pipelineId), updated_at: new Date().toISOString() })
    .eq("owner_id", ownerId);
  return { ok: true, pipelineId: String(pipelineId) };
}

async function handleListStages(ownerId: string) {
  const pipelineId = await getPipelineIdOrNull(ownerId);
  if (!pipelineId) return { ok: true, configured: false, stages: [] };
  const res = await crmFetch(supabase, ownerId, `/api/v1/pipelines/${pipelineId}/pipeline_stages`);
  const unwrapped = unwrap(res);
  const stages = Array.isArray(unwrapped) ? unwrapped : [];
  return { ok: true, configured: true, stages };
}

async function handleSaveStage(
  ownerId: string,
  stage: { id?: string; name: string; position?: number; color?: string; stageType?: "active" | "completed" | "cancelled" },
) {
  const pipelineId = await requirePipelineId(ownerId);
  const path = stage.id
    ? `/api/v1/pipelines/${pipelineId}/pipeline_stages/${stage.id}`
    : `/api/v1/pipelines/${pipelineId}/pipeline_stages`;
  const res = await crmFetch(supabase, ownerId, path, {
    method: stage.id ? "PATCH" : "POST",
    body: JSON.stringify({
      pipeline_stage: {
        name: stage.name,
        position: stage.position,
        color: stage.color,
        // Confirmado no manual (seção 7): campo obrigatório do CRM, nunca
        // mandado antes. Etapas do nosso funil de atendimento são todas
        // "em andamento" por padrão — não temos hoje um conceito de
        // etapa "ganha"/"perdida" na UI, então não editamos isso ainda,
        // só evitamos deixar o campo faltando.
        stage_type: stage.stageType ?? "active",
      },
    }),
  });
  return { ok: true, stage: unwrap(res) };
}

async function handleDeleteStage(ownerId: string, stageId: string) {
  const pipelineId = await requirePipelineId(ownerId);
  await crmFetch(supabase, ownerId, `/api/v1/pipelines/${pipelineId}/pipeline_stages/${stageId}`, { method: "DELETE" });
  return { ok: true };
}

async function handleReorderStages(ownerId: string, orderedIds: string[]) {
  const pipelineId = await requirePipelineId(ownerId);
  for (let i = 0; i < orderedIds.length; i++) {
    await crmFetch(supabase, ownerId, `/api/v1/pipelines/${pipelineId}/pipeline_stages/${orderedIds[i]}`, {
      method: "PATCH",
      body: JSON.stringify({ pipeline_stage: { position: i } }),
    });
  }
  return { ok: true };
}

async function handleListItems(ownerId: string) {
  const pipelineId = await getPipelineIdOrNull(ownerId);
  if (!pipelineId) return { ok: true, configured: false, items: [] };
  const res = await crmFetch(supabase, ownerId, `/api/v1/pipelines/${pipelineId}/pipeline_items`);
  const unwrapped = unwrap(res);
  const items = Array.isArray(unwrapped) ? unwrapped : [];
  return { ok: true, configured: true, items };
}

async function handleAddItem(
  ownerId: string,
  input: { type: "conversation" | "contact"; itemId: string; stageId: string },
) {
  const pipelineId = await requirePipelineId(ownerId);
  const res = await crmFetch(supabase, ownerId, `/api/v1/pipelines/${pipelineId}/pipeline_items`, {
    method: "POST",
    body: JSON.stringify({ type: input.type, item_id: input.itemId, pipeline_stage_id: input.stageId }),
  });
  return { ok: true, item: unwrap(res) };
}

async function handleMoveItem(ownerId: string, input: { itemId: string; newStageId: string; notes?: string }) {
  const pipelineId = await requirePipelineId(ownerId);
  const res = await crmFetch(supabase, ownerId, `/api/v1/pipelines/${pipelineId}/pipeline_items/${input.itemId}/move_to_stage`, {
    method: "PATCH",
    body: JSON.stringify({ new_stage_id: input.newStageId, notes: input.notes }),
  });
  return { ok: true, item: unwrap(res) };
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
      case "set-pipeline-id":
        result = await handleSetPipelineId(ownerId, body.pipelineId);
        break;
      case "create-pipeline":
        result = await handleCreatePipeline(ownerId, body.name);
        break;
      case "list-stages":
        result = await handleListStages(ownerId);
        break;
      case "save-stage":
        result = await handleSaveStage(ownerId, body.stage);
        break;
      case "delete-stage":
        result = await handleDeleteStage(ownerId, body.stageId);
        break;
      case "reorder-stages":
        result = await handleReorderStages(ownerId, body.orderedIds ?? []);
        break;
      case "list-items":
        result = await handleListItems(ownerId);
        break;
      case "add-item":
        result = await handleAddItem(ownerId, body.item);
        break;
      case "move-item":
        result = await handleMoveItem(ownerId, body.move);
        break;
      default:
        return new Response(JSON.stringify({ error: `action desconhecida: ${action}` }), { status: 400 });
    }

    return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
  } catch (e) {
    console.error("[crm-pipeline]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
