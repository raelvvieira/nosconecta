// Automações personalizadas: avalia as regras (gatilho -> condições -> ações)
// configuradas pela clínica sempre que um dos SYSTEM_EVENTS acontece.
//
// Mesma estrutura de meta-capi/index.ts (o gatilho é literalmente o mesmo —
// dispatchAutomationEvent é uma chamada irmã de dispatchMetaCapiEvent nos
// mesmos 6 pontos do código), só trocando "mandar pra Meta" por "executar
// uma lista de ações configuráveis". CRUD das regras (nome, gatilho,
// condições, ações, layout do canvas) mora em automations.functions.ts, via
// RLS direto — regra de automação não guarda segredo. Só a EXECUÇÃO passa
// por aqui, porque as ações reais (mandar WhatsApp, mover etapa) precisam da
// service role / token do CRM.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enviarWhatsapp } from "../_shared/whatsapp-send.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface DispatchContext {
  entityId?: string | null;
  /** Id "limpo" do card do funil (sem composição tipo "itemId:status") —
   *  só existe quando o evento tem um, usado pela ação "mover etapa". */
  itemId?: string | null;
  patientId?: string | null;
  crmContactId?: string | null;
  contactName?: string | null;
  stageId?: string | null;
  status?: string | null;
  dealStatus?: string | null;
  amount?: number | null;
}

type ActionConfig =
  | { type: "send_whatsapp"; message: string }
  | { type: "move_pipeline_stage"; stageId: string };

// Mesma função de meta-capi/index.ts:381-388, copiada — 6 linhas não
// justificam um módulo compartilhado, e cada consumidor evolui sozinho.
function matchesConditions(conditions: Record<string, unknown>, ctx: DispatchContext) {
  if (conditions?.stageId && String(conditions.stageId) !== String(ctx.stageId ?? "")) return false;
  if (conditions?.status && String(conditions.status) !== String(ctx.status ?? "")) return false;
  if (conditions?.dealStatus && String(conditions.dealStatus) !== String(ctx.dealStatus ?? "")) {
    return false;
  }
  return true;
}

function interpolar(template: string, nome: string | null): string {
  return template.replace(/\{\{\s*nome\s*\}\}/gi, nome?.trim() || "");
}

async function logRun(row: {
  owner_id: string;
  rule_id: string;
  rule_name: string;
  trigger_event: string;
  action_type: string;
  status: string;
  error?: string | null;
}) {
  await supabase.from("automation_runs").insert(row);
}

/** Resolve um crm_contact_id pra mandar mensagem — reaproveita o mesmo
 *  upsert que garantirContatoCrm já usa (crm-contacts, action "upsert"),
 *  que só funciona com patientId (não aceita crmContactId direto). Sem
 *  patientId nem crmContactId, não tem pra quem mandar. */
async function resolverContatoParaEnvio(
  ownerId: string,
  ctx: DispatchContext,
): Promise<{ contactId: string; conversationId: null } | null> {
  if (ctx.crmContactId) return { contactId: ctx.crmContactId, conversationId: null };
  if (!ctx.patientId) return null;

  const { data: paciente } = await supabase
    .from("patients")
    .select("name, phone, crm_contact_id")
    .eq("id", ctx.patientId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!paciente) return null;
  if (paciente.crm_contact_id) return { contactId: paciente.crm_contact_id, conversationId: null };
  if (!paciente.phone) return null;

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const res = await fetch(`${url}/functions/v1/crm-contacts`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({
      ownerId,
      action: "upsert",
      patient: { patientId: ctx.patientId, name: paciente.name, phone: paciente.phone },
    }),
    signal: AbortSignal.timeout(55_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.contactId) return null;
  return { contactId: String(json.contactId), conversationId: null };
}

async function executarAcao(
  ownerId: string,
  action: ActionConfig,
  ctx: DispatchContext,
  regra: { id: string; name: string; trigger_event: string },
) {
  if (action.type === "send_whatsapp") {
    const alvo = await resolverContatoParaEnvio(ownerId, ctx);
    if (!alvo) {
      await logRun({
        owner_id: ownerId,
        rule_id: regra.id,
        rule_name: regra.name,
        trigger_event: regra.trigger_event,
        action_type: action.type,
        status: "skipped_no_contact",
      });
      return;
    }
    try {
      await enviarWhatsapp(supabase, ownerId, alvo, interpolar(action.message, ctx.contactName ?? null));
      await logRun({
        owner_id: ownerId,
        rule_id: regra.id,
        rule_name: regra.name,
        trigger_event: regra.trigger_event,
        action_type: action.type,
        status: "sent",
      });
    } catch (e) {
      await logRun({
        owner_id: ownerId,
        rule_id: regra.id,
        rule_name: regra.name,
        trigger_event: regra.trigger_event,
        action_type: action.type,
        status: "failed",
        error: String(e).slice(0, 500),
      });
    }
    return;
  }

  if (action.type === "move_pipeline_stage") {
    if (!ctx.itemId) {
      await logRun({
        owner_id: ownerId,
        rule_id: regra.id,
        rule_name: regra.name,
        trigger_event: regra.trigger_event,
        action_type: action.type,
        status: "skipped_no_contact",
        error: "Evento sem card de funil pra mover.",
      });
      return;
    }
    try {
      // Chama a Edge Function crm-pipeline direto (não o server function
      // movePipelineItem) — é essa escolha que evita o card mover, disparar
      // pipeline.stage_changed de novo e criar um loop. Não mudar isto sem
      // reconsiderar o guardrail (ver comentário em automations.server.ts).
      const url = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const res = await fetch(`${url}/functions/v1/crm-pipeline`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({
          ownerId,
          action: "move-item",
          move: { itemId: ctx.itemId, newStageId: action.stageId },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error ?? `crm-pipeline respondeu ${res.status}`);
      }
      await logRun({
        owner_id: ownerId,
        rule_id: regra.id,
        rule_name: regra.name,
        trigger_event: regra.trigger_event,
        action_type: action.type,
        status: "sent",
      });
    } catch (e) {
      await logRun({
        owner_id: ownerId,
        rule_id: regra.id,
        rule_name: regra.name,
        trigger_event: regra.trigger_event,
        action_type: action.type,
        status: "failed",
        error: String(e).slice(0, 500),
      });
    }
  }
}

async function handleDispatch(
  ownerId: string,
  systemEvent: string,
  ctx: DispatchContext,
  depth: number,
) {
  // Corta qualquer cadeia entre automações de eventos diferentes antes que
  // vire um ciclo — barato, autocontido, não exige grafo de dependências
  // entre regras (ver plano: guardrail de profundidade).
  if (depth >= 2) {
    return { ok: true, skipped: "profundidade máxima de encadeamento atingida" };
  }

  const { data: regras, error } = await supabase
    .from("automation_rules")
    .select("id, name, trigger_conditions, actions")
    .eq("owner_id", ownerId)
    .eq("trigger_event", systemEvent)
    .eq("active", true);
  if (error) throw new Error(error.message);

  const matching = (regras ?? []).filter((r: any) => matchesConditions(r.trigger_conditions ?? {}, ctx));
  if (!matching.length) return { ok: true, skipped: "nenhuma automação corresponde", executed: 0 };

  for (const regra of matching as any[]) {
    const acoes: ActionConfig[] = Array.isArray(regra.actions) ? regra.actions : [];
    for (const acao of acoes) {
      await executarAcao(ownerId, acao, ctx, {
        id: regra.id,
        name: regra.name,
        trigger_event: systemEvent,
      });
    }
  }

  return { ok: true, executed: matching.length };
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
      case "dispatch":
        result = await handleDispatch(
          ownerId,
          body.systemEvent,
          body.context ?? {},
          Number(body.depth ?? 0),
        );
        break;
      default:
        return new Response(JSON.stringify({ error: `action desconhecida: ${action}` }), { status: 400 });
    }

    return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
  } catch (e) {
    console.error("[atendimento-automations]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
