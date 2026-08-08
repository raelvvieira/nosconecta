import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Status da negociação de cada card do funil. O CRM externo não tem esse
// conceito por card (só `stage_type` por etapa), então ele mora no nosso
// banco, chaveado pelo id remoto do item.
export type DealStatus = "negotiating" | "won" | "lost";

export const DEAL_STATUS_LABEL: Record<DealStatus, string> = {
  negotiating: "Em negociação",
  won: "Ganho",
  lost: "Perdido",
};

// Motivos prontos para o caso mais comum. Sem motivo, "perdido" não ensina
// nada depois — mas texto livre também é aceito.
export const LOSS_REASONS = [
  "Preço",
  "Foi para outra clínica",
  "Sem retorno / sumiu",
  "Adiou o tratamento",
  "Não era o perfil",
  "Distância / localização",
];

export interface Deal {
  itemId: string;
  status: DealStatus;
  lossReason: string | null;
  value: number | null;
  currency: string;
  updatedAt: string | null;
}

export type DealEventKind = "note" | "status" | "stage" | "appointment";

export interface DealEventMeta {
  status?: string;
  stageId?: string;
}

export interface DealEvent {
  id: string;
  itemId: string;
  kind: DealEventKind;
  body: string | null;
  meta: DealEventMeta | null;
  createdAt: string;
}

function mapDeal(row: any): Deal {
  return {
    itemId: row.item_id,
    status: (row.status ?? "negotiating") as DealStatus,
    lossReason: row.loss_reason ?? null,
    value: row.value === null || row.value === undefined ? null : Number(row.value),
    currency: row.currency ?? "BRL",
    updatedAt: row.updated_at ?? null,
  };
}

function mapEvent(row: any): DealEvent {
  return {
    id: String(row.id),
    itemId: row.item_id,
    kind: (row.kind ?? "note") as DealEventKind,
    body: row.body ?? null,
    meta: (row.meta ?? null) as DealEventMeta | null,
    createdAt: row.created_at,
  };
}

// Uma chamada só para o board inteiro: os cards vêm do CRM e só os que
// tiverem negociação registrada aparecem aqui. A tela cruza por itemId.
export const getDeals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Deal[]> => {
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("pipeline_deals")
      .select("*")
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapDeal);
  });

export const getDealTimeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { itemId: string }) => input)
  .handler(async ({ data, context }): Promise<DealEvent[]> => {
    const supabase: any = context.supabase;
    const { data: rows, error } = await supabase
      .from("pipeline_deal_events")
      .select("*")
      .eq("owner_id", context.userId)
      .eq("item_id", data.itemId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (rows ?? []).map(mapEvent);
  });

// upsert manual em vez de .upsert(): o índice único é (owner_id, item_id) e
// precisamos preservar os campos que não vieram nesta chamada (ex.: mudar o
// status não pode zerar o valor já registrado).
async function upsertDeal(
  supabase: any,
  ownerId: string,
  itemId: string,
  patch: Record<string, unknown>,
) {
  const { data: existing } = await supabase
    .from("pipeline_deals")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("item_id", itemId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("pipeline_deals")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await supabase
    .from("pipeline_deals")
    .insert({ owner_id: ownerId, item_id: itemId, ...patch });
  if (error) throw new Error(error.message);
}

async function logEvent(
  supabase: any,
  ownerId: string,
  itemId: string,
  kind: DealEventKind,
  body: string | null,
  meta?: DealEventMeta,
) {
  await supabase
    .from("pipeline_deal_events")
    .insert({ owner_id: ownerId, item_id: itemId, kind, body, meta: meta ?? null });
}

export const saveDealStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { itemId: string; status: DealStatus; lossReason?: string; contactName?: string }) => {
      if (input.status === "lost" && !input.lossReason?.trim()) {
        throw new Error("Informe o motivo da perda.");
      }
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const lossReason = data.status === "lost" ? data.lossReason!.trim() : null;

    await upsertDeal(supabase, context.userId, data.itemId, {
      status: data.status,
      loss_reason: lossReason,
    });
    await logEvent(
      supabase,
      context.userId,
      data.itemId,
      "status",
      lossReason,
      { status: data.status },
    );

    // Ganho/Perdido é a conversão de verdade — antes o gatilho da Meta
    // dependia de "o card entrou na etapa X", que só funcionava se a clínica
    // lembrasse de configurar qual etapa era a de ganho.
    const { data: deal } = await supabase
      .from("pipeline_deals")
      .select("value")
      .eq("owner_id", context.userId)
      .eq("item_id", data.itemId)
      .maybeSingle();

    const { dispatchMetaCapiEvent } = await import("@/lib/integrations/meta-capi.server");
    await dispatchMetaCapiEvent(context.userId, "deal.status_changed", {
      entityId: `${data.itemId}:${data.status}`,
      dealStatus: data.status,
      contactName: data.contactName ?? null,
      amount: deal?.value === null || deal?.value === undefined ? null : Number(deal.value),
    });

    return { ok: true };
  });

export const saveDealValue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { itemId: string; value: number | null }) => input)
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    await upsertDeal(supabase, context.userId, data.itemId, { value: data.value });
    return { ok: true };
  });

export const addDealNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { itemId: string; body: string }) => {
    if (!input.body?.trim()) throw new Error("Escreva a observação.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    // Garante o registro da negociação mesmo que a primeira interação com o
    // card tenha sido uma observação, e não a mudança de status.
    await upsertDeal(supabase, context.userId, data.itemId, {});
    await logEvent(supabase, context.userId, data.itemId, "note", data.body.trim());
    return { ok: true };
  });

// Registrada quando um agendamento é criado a partir do card, para a linha do
// tempo contar a história completa da negociação.
export const logDealAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { itemId: string; body: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    await logEvent(supabase, context.userId, data.itemId, "appointment", data.body);
    return { ok: true };
  });
