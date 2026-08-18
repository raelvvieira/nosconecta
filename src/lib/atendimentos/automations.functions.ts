import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { SYSTEM_EVENTS, type SystemEvent } from "@/lib/integrations/meta-capi.functions";

export type AutomationActionType = "send_whatsapp" | "move_pipeline_stage";

export interface AutomationAction {
  type: AutomationActionType;
  /** Só em send_whatsapp — texto da mensagem, aceita {{nome}}. */
  message?: string;
  /** Só em move_pipeline_stage — etapa de destino. */
  stageId?: string;
}

export interface AutomationCanvasPosition {
  x: number;
  y: number;
}

export interface AutomationCanvasLayout {
  acionamento?: AutomationCanvasPosition;
  configuracoes?: AutomationCanvasPosition;
  acoes?: AutomationCanvasPosition;
}

export interface AutomationRule {
  id: string;
  name: string;
  active: boolean;
  triggerEvent: SystemEvent | null;
  triggerConditions: { stageId?: string; status?: string; dealStatus?: string };
  actions: AutomationAction[];
  canvasLayout: AutomationCanvasLayout;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationRunLogRow {
  id: string;
  ruleName: string | null;
  triggerEvent: string;
  actionType: string;
  status: string;
  error: string | null;
  ranAt: string;
}

function mapRule(row: any): AutomationRule {
  return {
    id: String(row.id),
    name: row.name ?? "",
    active: row.active ?? true,
    triggerEvent: (row.trigger_event as SystemEvent) ?? null,
    triggerConditions: (row.trigger_conditions ?? {}) as AutomationRule["triggerConditions"],
    actions: Array.isArray(row.actions) ? row.actions : [],
    canvasLayout: (row.canvas_layout ?? {}) as AutomationCanvasLayout,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Regras não guardam segredo, então falam direto com o Supabase pela RLS de
// dono — sem passar pela Edge Function (mesmo padrão de meta-capi.functions.ts
// pros gatilhos da Meta CAPI). Só a execução (atendimento-automations) precisa
// de service role, por causa do token do CRM.
export const listAutomations = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<AutomationRule[]> => {
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("automation_rules")
      .select("*")
      .eq("owner_id", context.ownerId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapRule);
  });

export const getAutomation = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }): Promise<AutomationRule | null> => {
    const supabase: any = context.supabase;
    const { data: row, error } = await supabase
      .from("automation_rules")
      .select("*")
      .eq("id", data.id)
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ? mapRule(row) : null;
  });

export const saveAutomation = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: Partial<AutomationRule> & { name: string }) => {
    if (!input.name?.trim()) throw new Error("Dê um nome à automação.");
    if (!input.triggerEvent || !SYSTEM_EVENTS.includes(input.triggerEvent)) {
      throw new Error("Escolha quando a automação dispara.");
    }
    if (!input.actions?.length) throw new Error("Adicione ao menos uma ação.");
    for (const acao of input.actions) {
      if (acao.type === "send_whatsapp" && !acao.message?.trim()) {
        throw new Error("Escreva a mensagem da ação de WhatsApp.");
      }
      if (acao.type === "move_pipeline_stage" && !acao.stageId) {
        throw new Error("Escolha a etapa de destino da ação de mover no funil.");
      }
    }
    // Guardrail de loop: mover etapa não pode ser ação de uma automação que
    // já dispara ao mudar de etapa — ver comentário em automations.server.ts.
    if (
      input.triggerEvent === "pipeline.stage_changed" &&
      input.actions.some((a) => a.type === "move_pipeline_stage")
    ) {
      throw new Error(
        'Automações que disparam quando "o card muda de etapa" não podem ter "mover para etapa" como ação — isso criaria um loop.',
      );
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const row = {
      id: data.id || crypto.randomUUID(),
      owner_id: context.ownerId,
      name: data.name.trim(),
      active: data.active ?? true,
      trigger_event: data.triggerEvent,
      trigger_conditions: data.triggerConditions ?? {},
      actions: data.actions,
      canvas_layout: data.canvasLayout ?? {},
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("automation_rules").upsert(row);
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const deleteAutomation = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { error } = await supabase
      .from("automation_rules")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getAutomationRuns = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { ruleId?: string } = {}) => input)
  .handler(async ({ data, context }): Promise<AutomationRunLogRow[]> => {
    const supabase: any = context.supabase;
    let query = supabase
      .from("automation_runs")
      .select("id, rule_name, trigger_event, action_type, status, error, ran_at")
      .eq("owner_id", context.ownerId)
      .order("ran_at", { ascending: false })
      .limit(20);
    if (data.ruleId) query = query.eq("rule_id", data.ruleId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      id: String(r.id),
      ruleName: r.rule_name,
      triggerEvent: r.trigger_event,
      actionType: r.action_type,
      status: r.status,
      error: r.error,
      ranAt: r.ran_at,
    }));
  });
