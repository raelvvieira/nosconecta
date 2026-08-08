import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Eventos internos que a tela de Integrações oferece como gatilho. A lista
// aqui é a fonte da verdade — cada valor precisa ter um dispatchMetaCapiEvent
// correspondente no código que executa a operação.
export const SYSTEM_EVENTS = [
  "deal.status_changed",
  "pipeline.stage_changed",
  "appointment.created",
  "appointment.status_changed",
  "receivable.paid",
  "patient.created",
] as const;
export type SystemEvent = (typeof SYSTEM_EVENTS)[number];

export type ValueSource = "none" | "event" | "fixed";

export interface MetaCapiSettings {
  pixelId: string;
  offlineEventSetId: string;
  /** Destino em uso — o conjunto offline ganha do pixel quando existe. */
  mode: "offline_dataset" | "pixel_events";
  testEventCode: string;
  apiVersion: string;
  enabled: boolean;
  hasToken: boolean;
  tokenPreview: string;
  lastSuccessAt: string | null;
  lastError: string | null;
  /** Último erro foi código 190 (token expirado/revogado). */
  needsReconnect: boolean;
}

export interface MetaCapiTrigger {
  id: string;
  name: string;
  systemEvent: SystemEvent;
  conditions: { stageId?: string; status?: string; dealStatus?: string };
  metaEventName: string;
  valueSource: ValueSource;
  fixedValue: number | null;
  currency: string;
  active: boolean;
}

export interface MetaCapiEventLogRow {
  id: string;
  systemEvent: string;
  metaEventName: string;
  status: "sent" | "failed";
  error: string | null;
  /** Campos descartados na normalização — diagnóstico de qualidade de match. */
  droppedKeys: string[];
  sentAt: string;
}

// Mesmo padrão de pipeline.functions.ts: as credenciais ficam numa tabela
// deny-all, então o acesso passa obrigatoriamente pela Edge Function com
// service role em vez do client RLS do usuário.
async function callEdgeFunction(body: unknown) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");
  const res = await fetch(`${url}/functions/v1/meta-capi`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `Falha ao chamar meta-capi (${res.status})`);
  return json;
}

function mapTrigger(row: any): MetaCapiTrigger {
  return {
    id: String(row.id),
    name: row.name ?? "",
    systemEvent: row.system_event as SystemEvent,
    conditions: (row.conditions ?? {}) as MetaCapiTrigger["conditions"],
    metaEventName: row.meta_event_name ?? "",
    valueSource: (row.value_source ?? "none") as ValueSource,
    fixedValue: row.fixed_value === null || row.fixed_value === undefined ? null : Number(row.fixed_value),
    currency: row.currency ?? "BRL",
    active: row.active ?? true,
  };
}

export const getMetaCapiSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MetaCapiSettings> => {
    const json = await callEdgeFunction({ ownerId: context.userId, action: "get-settings" });
    return json.settings as MetaCapiSettings;
  });

export const saveMetaCapiSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      pixelId: string;
      offlineEventSetId?: string;
      accessToken?: string;
      testEventCode?: string;
      apiVersion?: string;
      enabled: boolean;
    }) => {
      if (input.enabled && !input.pixelId?.trim() && !input.offlineEventSetId?.trim()) {
        throw new Error(
          "Informe o Pixel ID ou o conjunto de eventos offline para ativar a integração.",
        );
      }
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    await callEdgeFunction({ ownerId: context.userId, action: "save-settings", settings: data });
    return { ok: true };
  });

export const sendMetaCapiTestEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const json = await callEdgeFunction({ ownerId: context.userId, action: "test-connection" });
    return { ok: true, testMode: Boolean(json.testMode) };
  });

export const getMetaCapiEventLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MetaCapiEventLogRow[]> => {
    const json = await callEdgeFunction({
      ownerId: context.userId,
      action: "list-events",
      limit: 20,
    });
    return (json.events ?? []).map((row: any) => ({
      id: String(row.id),
      systemEvent: row.system_event,
      metaEventName: row.meta_event_name,
      status: row.status,
      error: row.error ?? null,
      droppedKeys: Array.isArray(row.dropped_keys) ? row.dropped_keys : [],
      sentAt: row.sent_at,
    }));
  });

// Gatilhos não guardam segredo, então falam direto com o Supabase pela RLS
// de dono — sem passar pela Edge Function.
export const listMetaCapiTriggers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MetaCapiTrigger[]> => {
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("meta_capi_triggers")
      .select("*")
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapTrigger);
  });

export const saveMetaCapiTrigger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Partial<MetaCapiTrigger> & { name: string }) => {
    if (!input.name?.trim()) throw new Error("Dê um nome ao gatilho.");
    if (!input.systemEvent) throw new Error("Escolha quando o gatilho dispara.");
    if (!input.metaEventName?.trim()) throw new Error("Escolha o evento enviado à Meta.");
    if (input.valueSource === "fixed" && !Number(input.fixedValue)) {
      throw new Error("Informe o valor fixo do evento.");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const row = {
      id: data.id || crypto.randomUUID(),
      owner_id: context.userId,
      name: data.name.trim(),
      system_event: data.systemEvent,
      conditions: data.conditions ?? {},
      meta_event_name: data.metaEventName!.trim(),
      value_source: data.valueSource ?? "none",
      fixed_value: data.valueSource === "fixed" ? Number(data.fixedValue ?? 0) : null,
      currency: data.currency || "BRL",
      active: data.active ?? true,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("meta_capi_triggers").upsert(row);
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const deleteMetaCapiTrigger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { error } = await supabase
      .from("meta_capi_triggers")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
