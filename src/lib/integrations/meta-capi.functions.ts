import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";

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
    fixedValue:
      row.fixed_value === null || row.fixed_value === undefined ? null : Number(row.fixed_value),
    currency: row.currency ?? "BRL",
    active: row.active ?? true,
  };
}

export const getMetaCapiSettings = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<MetaCapiSettings> => {
    const json = await callEdgeFunction({ ownerId: context.ownerId, action: "get-settings" });
    return json.settings as MetaCapiSettings;
  });

export const saveMetaCapiSettings = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
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
    await callEdgeFunction({ ownerId: context.ownerId, action: "save-settings", settings: data });
    return { ok: true };
  });

export const sendMetaCapiTestEvent = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }) => {
    const json = await callEdgeFunction({ ownerId: context.ownerId, action: "test-connection" });
    return { ok: true, testMode: Boolean(json.testMode) };
  });

export const getMetaCapiEventLog = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<MetaCapiEventLogRow[]> => {
    const json = await callEdgeFunction({
      ownerId: context.ownerId,
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
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<MetaCapiTrigger[]> => {
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("meta_capi_triggers")
      .select("*")
      .eq("owner_id", context.ownerId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapTrigger);
  });

export const saveMetaCapiTrigger = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
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
      owner_id: context.ownerId,
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
  .middleware([requireClinicMembership])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { error } = await supabase
      .from("meta_capi_triggers")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Reenvia à Meta a conversão de um agendamento que saiu cega.
 *
 * ── Por que isto precisa existir ────────────────────────────────────────
 *
 * Um agendamento salvo sem ficha de paciente manda o Lead com hash de nome e
 * mais nada. A Meta responde `events_received: 1`, o log do sistema marca
 * "enviado", e a conversão não casa com clique nenhum — ela não existe para
 * o anúncio. Completar o telefone depois conserta a ficha, mas não faz o
 * evento voltar.
 *
 * ── Por que isto NÃO é um botão de "mandar de novo" ─────────────────────
 *
 * Reenviar uma conversão que JÁ casou é contar a mesma venda duas vezes, e
 * inflar conversão é pior do que perder uma: decisões de verba saem de lá.
 * Por isso as travas abaixo são o corpo inteiro desta função, e o envio é a
 * última linha.
 */
export const reenviarConversaoDoAgendamento = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { appointmentId: string }) => {
    if (!input?.appointmentId) throw new Error("Agendamento inválido.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;

    const { data: agendamento } = await supabase
      .from("appointments")
      .select("id, patient_id, patient_name, expected_revenue")
      .eq("id", data.appointmentId)
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    if (!agendamento) throw new Error("Agendamento não encontrado.");
    if (!agendamento.patient_id) {
      throw new Error(
        "Este agendamento ainda não tem ficha de paciente. Preencha o telefone e salve primeiro.",
      );
    }

    const { data: paciente } = await supabase
      .from("patients")
      .select("id, name, first_name, last_name, phone, email")
      .eq("id", agendamento.patient_id)
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    if (!paciente) throw new Error("A ficha deste paciente não foi encontrada.");

    // O critério do pedido: telefone (ou e-mail) E nome separado do sobrenome.
    // Sem um identificador não há como casar; sem as duas partes do nome, `fn`
    // e `ln` viram hashes errados e o match cai muito.
    const temIdentificador = Boolean(paciente.phone?.trim() || paciente.email?.trim());
    if (!temIdentificador) {
      throw new Error(
        "A ficha precisa de telefone ou e-mail — é o que a Meta usa para reconhecer a pessoa.",
      );
    }
    if (!paciente.first_name?.trim() || !paciente.last_name?.trim()) {
      throw new Error("A ficha precisa de nome e sobrenome separados para o reenvio valer a pena.");
    }

    // ── A trava que importa ───────────────────────────────────────────────
    //
    // Só reenvia o que NÃO casou. A prova está no próprio log: o payload
    // gravado traz o `user_data` que foi mandado, e se ele tinha `em` ou `ph`
    // a conversão era casável — reenviar contaria de novo.
    const { data: enviados } = await supabase
      .from("meta_capi_events")
      .select("event_id, status, payload, sent_at")
      .eq("owner_id", context.ownerId)
      .eq("system_event", "appointment.created")
      .like("event_id", `%:${data.appointmentId}%`)
      .order("sent_at", { ascending: false })
      .limit(10);

    const linhas = (enviados ?? []) as any[];
    if (linhas.some((e) => String(e.event_id).endsWith(":reenvio"))) {
      throw new Error("A conversão deste agendamento já foi reenviada uma vez.");
    }
    const casavel = linhas.some((e) => {
      if (e.status !== "sent") return false;
      const ud = e.payload?.data?.[0]?.user_data ?? e.payload?.user_data ?? {};
      return Boolean(ud.em || ud.ph);
    });
    if (casavel) {
      throw new Error(
        "A conversão deste agendamento já foi enviada com telefone ou e-mail — a Meta já a reconheceu. Reenviar contaria duas vezes.",
      );
    }

    const { dispatchMetaCapiEvent } = await import("@/lib/integrations/meta-capi.server");
    await dispatchMetaCapiEvent(context.ownerId, "appointment.created", {
      entityId: agendamento.id,
      patientId: agendamento.patient_id,
      contactName: agendamento.patient_name,
      amount: agendamento.expected_revenue,
      reenvio: true,
    });

    return { ok: true };
  });
