import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { resolveUnitId } from "@/lib/auth/resolve-unit";
import { gravarTolerandoColunaAusente, semColuna } from "@/lib/schema-fallback";

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
  // O opt-out explícito. Não tinha onde ser registrado, e era o caso mais
  // caro de errar: mandar campanha para quem pediu para não receber.
  "Pediu para não receber mensagens",
  "Outro",
];

export const MOTIVO_OUTRO = "Outro";

/**
 * Motivos dos quais não se volta.
 *
 * Quem cai num destes sai de qualquer disparo por coluna no funil de
 * recuperação. Sai do próprio motivo, e não de uma chave separada, porque
 * chave separada depende de alguém lembrar de marcar — e quem esquece manda
 * mensagem para quem pediu para não receber.
 */
export const MOTIVOS_DEFINITIVOS = [
  "Não era o perfil",
  "Distância / localização",
  "Pediu para não receber mensagens",
];

/**
 * O motivo gravado, encaixado na lista fechada.
 *
 * Até agora o campo era texto livre ao lado dos chips, então há histórico com
 * qualquer coisa escrita. Nada disso é reescrito: o que não bate com a lista é
 * LIDO como "Outro" — o texto original continua no detalhe da negociação, que é
 * onde ele ainda vale alguma coisa.
 */
export function motivoNormalizado(reason: string | null | undefined): string {
  const texto = (reason ?? "").trim();
  if (!texto) return MOTIVO_OUTRO;
  return LOSS_REASONS.includes(texto) ? texto : MOTIVO_OUTRO;
}

export function motivoEhDefinitivo(reason: string | null | undefined): boolean {
  return MOTIVOS_DEFINITIVOS.includes(motivoNormalizado(reason));
}

export interface Deal {
  itemId: string;
  status: DealStatus;
  lossReason: string | null;
  value: number | null;
  currency: string;
  updatedAt: string | null;
  /** Dia em que o atendimento aconteceu, informado ao marcar como ganho. */
  realizedOn: string | null;
  /** Atendimento concluído criado a partir deste ganho. */
  appointmentId: string | null;
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
    // `undefined` enquanto a migration não roda; a tela trata como "sem data".
    realizedOn: row.realized_on ?? null,
    appointmentId: row.appointment_id ?? null,
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
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<Deal[]> => {
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("pipeline_deals")
      .select("*")
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapDeal);
  });

export const getDealTimeline = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { itemId: string }) => input)
  .handler(async ({ data, context }): Promise<DealEvent[]> => {
    const supabase: any = context.supabase;
    const { data: rows, error } = await supabase
      .from("pipeline_deal_events")
      .select("*")
      .eq("owner_id", context.ownerId)
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

  // `realized_on` e `appointment_id` nascem numa migration aplicada à parte;
  // sem a tolerância, marcar ganho quebraria por inteiro entre o deploy do
  // código e o comando no Lovable. Aqui elas são exigidas: gravar um ganho sem
  // a data seria perder justamente o dado que a tela obrigou a preencher.
  const exigida = patch.realized_on !== undefined;
  const motivo = "A data do atendimento realizado ainda não pode ser gravada.";

  if (existing) {
    const { error } = await gravarTolerandoColunaAusente({
      coluna: "realized_on",
      exigida,
      motivo,
      tentar: (sem) =>
        supabase
          .from("pipeline_deals")
          .update({
            ...(sem ? semColuna(semColuna(patch, "realized_on"), "appointment_id") : patch),
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id),
    });
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await gravarTolerandoColunaAusente({
    coluna: "realized_on",
    exigida,
    motivo,
    tentar: (sem) =>
      supabase.from("pipeline_deals").insert({
        owner_id: ownerId,
        item_id: itemId,
        ...(sem ? semColuna(semColuna(patch, "realized_on"), "appointment_id") : patch),
      }),
  });
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
  .middleware([requireClinicMembership])
  .inputValidator(
    (input: {
      itemId: string;
      status: DealStatus;
      lossReason?: string;
      contactName?: string;
      /** Contato do CRM: é por ele que a Meta acha telefone e e-mail. */
      crmContactId?: string | null;
    }) => {
      // Id do card no CRM, ou a chave da conversa quando não há card — mesma
      // regra de `confirmarGanho` (ver deal-key.ts).
      if (!input.itemId?.trim()) throw new Error("Negociação sem identificação.");
      if (input.status === "lost" && !input.lossReason?.trim()) {
        throw new Error("Informe o motivo da perda.");
      }
      // "Ganho" tem caminho próprio (`confirmarGanho`), que exige valor e data
      // e consolida o atendimento. Deixar este aberto seria manter uma porta
      // dos fundos que grava ganho sem nada disso — era o comportamento antigo.
      if (input.status === "won") {
        throw new Error("Use a confirmação de ganho, que pede o valor e a data do atendimento.");
      }
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const lossReason = data.status === "lost" ? data.lossReason!.trim() : null;

    await upsertDeal(supabase, context.ownerId, data.itemId, {
      status: data.status,
      loss_reason: lossReason,
    });
    await logEvent(
      supabase,
      context.ownerId,
      data.itemId,
      "status",
      lossReason,
      { status: data.status },
    );

    // O valor entra no evento quando o gatilho estiver configurado como "valor
    // do evento". Relido do banco porque esta chamada não o recebe.
    const { data: deal } = await supabase
      .from("pipeline_deals")
      .select("value")
      .eq("owner_id", context.ownerId)
      .eq("item_id", data.itemId)
      .maybeSingle();

    const { dispatchMetaCapiEvent } = await import("@/lib/integrations/meta-capi.server");
    await dispatchMetaCapiEvent(context.ownerId, "deal.status_changed", {
      entityId: `${data.itemId}:${data.status}`,
      dealStatus: data.status,
      // Sem isto o `resolvePerson` da Edge Function não tem por onde procurar o
      // paciente, e o evento vai só com hash de nome — era assim para todos.
      crmContactId: data.crmContactId ?? null,
      contactName: data.contactName ?? null,
      amount: deal?.value === null || deal?.value === undefined ? null : Number(deal.value),
    });
    const { dispatchAutomationEvent } = await import("@/lib/atendimentos/automations.server");
    await dispatchAutomationEvent(context.ownerId, "deal.status_changed", {
      entityId: `${data.itemId}:${data.status}`,
      itemId: data.itemId,
      dealStatus: data.status,
      crmContactId: data.crmContactId ?? null,
      contactName: data.contactName ?? null,
      amount: deal?.value === null || deal?.value === undefined ? null : Number(deal.value),
    });

    // O push de "negociação ganha" mora agora em `confirmarGanho`, junto do
    // ganho de verdade — aqui `won` nem chega mais.
    return { ok: true };
  });

export interface ResultadoGanho {
  ok: true;
  /** Já havia atendimento concluído para esta pessoa nesta data. */
  jaConsolidado: boolean;
  /** Id do atendimento — o criado agora, ou o que já existia. */
  appointmentId: string | null;
  /** Nome usado; devolvido para a tela confirmar o que foi gravado. */
  patientName: string | null;
}

/**
 * Marcar como ganho é confirmar que o atendimento aconteceu.
 *
 * Substitui o caminho antigo (`saveDealStatus` com status `won`), que tinha
 * três problemas de uma vez:
 *
 * 1. Mandava a conversão para a Meta com `contactName` e mais nada — sem
 *    `patientId` nem `crmContactId`, o `resolvePerson` caía no fallback de
 *    nome e a conversão ia sem telefone, com casamento quase nulo.
 * 2. O valor era um campo separado, salvo por outro botão. Quem marcasse ganho
 *    antes de digitar mandava `amount: null`, e como o `event_id` é estável a
 *    Meta deduplicava qualquer correção — o valor certo nunca chegava.
 * 3. Não havia data: o ganho de hoje e o atendimento de terça viravam a mesma
 *    coisa.
 *
 * Agora o ganho vira um atendimento concluído de verdade, pelo mesmo caminho da
 * Agenda (`criarAgendamento`), com as mesmas regras: valor obrigatório, data
 * passada não notifica ninguém, conversão e recebimento saindo da transição de
 * status. Um só lugar decide o que é um atendimento realizado.
 */
export const confirmarGanho = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator(
    (input: {
      itemId: string;
      contactName: string;
      crmContactId?: string | null;
      phone?: string | null;
      patientId?: string | null;
      valor: number;
      /** "YYYY-MM-DD" — o dia em que o atendimento aconteceu. */
      realizadoEm: string;
      procedureName?: string | null;
      gerarCobranca?: boolean;
      /** Ganho com valor é receita concretizada na data do evento — por isso o
       *  padrão é `true`. Desligado, vira uma cobrança em aberto (o caso do
       *  tratamento que ainda será pago). */
      pagamentoRecebido?: boolean;
      /** Só lido de fato pra admin — quem não é admin sempre cai na própria unidade. */
      unitId?: string;
    }) => {
      // `itemId` é o id do card no CRM quando existe, ou a chave da conversa
      // (`conv:<id>`, ver deal-key.ts) quando o ganho é marcado direto do chat
      // sem card no funil. A coluna é `text` sem FK justamente por isso.
      if (!input.itemId?.trim()) throw new Error("Negociação sem identificação.");
      if (!input.contactName?.trim()) throw new Error("Informe o nome do cliente.");
      if (!input.realizadoEm) throw new Error("Informe a data em que o atendimento foi realizado.");
      // Mesma regra da Agenda, pela mesma razão: zero é cortesia, vazio é
      // ninguém preencheu. Ver assertValorAoConcluir em agenda.functions.ts.
      if (input.valor === null || input.valor === undefined || Number.isNaN(input.valor)) {
        throw new Error("Informe o valor cobrado para confirmar o atendimento.");
      }
      if (input.valor < 0) throw new Error("O valor cobrado não pode ser negativo.");
      return input;
    },
  )
  .handler(async ({ data, context }): Promise<ResultadoGanho> => {
    const supabase: any = context.supabase;
    const unitId = await resolveUnitId(context, data.unitId);

    const { resolverPacienteDoContato } = await import("@/lib/patients/patients.functions");
    const paciente = await resolverPacienteDoContato(
      supabase,
      context.ownerId,
      {
        patientId: data.patientId,
        name: data.contactName,
        phone: data.phone,
        crmContactId: data.crmContactId,
      },
      unitId,
    );

    // A verificação de duplicidade é contra o fato — existe atendimento
    // concluído para esta pessoa neste dia? — e não contra o log de envios à
    // Meta. Aquela tabela não tem coluna de pessoa e o `event_id` muda de
    // formato por gatilho, então casar por lá seria adivinhação. Como a Agenda
    // e o funil agora escrevem o mesmo registro, a checagem vale nos dois
    // sentidos: o que foi concluído pela Agenda barra o reenvio pelo funil, e
    // vice-versa.
    let jaConsolidado = false;
    let appointmentId: string | null = null;

    if (paciente) {
      const { data: existente } = await supabase
        .from("appointments")
        .select("id")
        .eq("owner_id", context.ownerId)
        .eq("patient_id", paciente.id)
        .eq("date", data.realizadoEm)
        .eq("status", "completed")
        .maybeSingle();
      if (existente) {
        jaConsolidado = true;
        appointmentId = existente.id;
      }
    }

    if (!jaConsolidado) {
      const { criarAgendamento } = await import("@/lib/agenda/agenda.functions");
      const criado = await criarAgendamento(supabase, context.ownerId, {
        unit_id: unitId,
        patient_id: paciente?.id ?? null,
        patient_name: paciente?.name ?? data.contactName.trim(),
        procedure_name: data.procedureName?.trim() || "Atendimento",
        professional_id: null,
        professional_name: "",
        room_id: null,
        room_name: null,
        date: data.realizadoEm,
        // Sem horário no funil: uma hora cheia guarda o lugar na agenda sem
        // fingir precisão que ninguém informou.
        start_time: "09:00",
        end_time: "10:00",
        status: "completed",
        type: "consultation",
        expected_revenue: data.valor,
        actual_revenue: data.valor,
        notes: "Registrado a partir do funil de atendimentos.",
        generate_financial: data.gerarCobranca ?? true,
      }, {
        // Ganho é sempre retroativo: o atendimento já aconteceu. Sem isto, um
        // ganho confirmado hoje dispara "confirme sua consulta" no WhatsApp
        // (a guarda `jaAconteceu` compara com `<`, e hoje não é passado).
        skipConfirmation: true,
        receberEm: (data.pagamentoRecebido ?? true) ? data.realizadoEm : null,
      });
      appointmentId = criado.id;
    }

    await upsertDeal(supabase, context.ownerId, data.itemId, {
      status: "won",
      loss_reason: null,
      value: data.valor,
      realized_on: data.realizadoEm,
      appointment_id: appointmentId,
    });
    await logEvent(supabase, context.ownerId, data.itemId, "status", null, { status: "won" });

    // Nenhum `deal.status_changed` aqui, de propósito: a conversão deste ganho
    // já saiu como `appointment.status_changed`, dentro do `criarAgendamento`.
    // Disparar os dois faria a mesma venda ser contada duas vezes por quem
    // tivesse ambos os gatilhos configurados. O `deal.status_changed` continua
    // existindo para "Perdido", em `saveDealStatus`.
    const { sendPushToOwner } = await import("@/lib/notifications/push.server");
    await sendPushToOwner(context.ownerId, "deal_result", {
      title: "Negociação ganha 🎉",
      body: `${paciente?.name ?? data.contactName} fechou.`,
      url: "/atendimentos/pipeline",
    });

    return {
      ok: true,
      jaConsolidado,
      appointmentId,
      patientName: paciente?.name ?? data.contactName.trim(),
    };
  });

export const saveDealValue = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { itemId: string; value: number | null }) => input)
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    await upsertDeal(supabase, context.ownerId, data.itemId, { value: data.value });
    return { ok: true };
  });

export const addDealNote = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { itemId: string; body: string }) => {
    if (!input.body?.trim()) throw new Error("Escreva a observação.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    // Garante o registro da negociação mesmo que a primeira interação com o
    // card tenha sido uma observação, e não a mudança de status.
    await upsertDeal(supabase, context.ownerId, data.itemId, {});
    await logEvent(supabase, context.ownerId, data.itemId, "note", data.body.trim());
    return { ok: true };
  });

// Registrada quando um agendamento é criado a partir do card, para a linha do
// tempo contar a história completa da negociação.
export const logDealAppointment = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { itemId: string; body: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    await logEvent(supabase, context.ownerId, data.itemId, "appointment", data.body);
    return { ok: true };
  });
