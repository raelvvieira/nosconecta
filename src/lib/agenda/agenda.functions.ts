import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  Appointment,
  AppointmentNotification,
  AppointmentStatus,
  AppointmentType,
  BlockedTime,
  WaitingListItem,
} from "@/components/agenda/types";

export interface AgendaOverview {
  appointments: Appointment[];
  blockedTimes: BlockedTime[];
  waitingList: WaitingListItem[];
}

function mapAppointment(row: any, notifications: AppointmentNotification[]): Appointment {
  return {
    id: row.id,
    patientId: row.patient_id ?? undefined,
    patientName: row.patient_name,
    procedureName: row.procedure_name,
    professionalId: row.professional_id ?? "",
    professionalName: row.professional_name,
    roomId: row.room_id ?? "",
    roomName: row.room_name ?? "",
    date: row.date,
    startTime: String(row.start_time).slice(0, 5),
    endTime: String(row.end_time).slice(0, 5),
    status: row.status,
    type: row.type,
    expectedRevenue: Number(row.expected_revenue),
    // Nulo continua nulo: é o que distingue "não confirmado" de "foi de graça".
    actualRevenue: row.actual_revenue === null || row.actual_revenue === undefined
      ? null
      : Number(row.actual_revenue),
    notes: row.notes ?? undefined,
    generateFinancial: row.generate_financial,
    notifications,
  };
}

function mapBlockedTime(row: any): BlockedTime {
  return {
    id: row.id,
    professionalId: row.professional_id ?? "",
    roomId: row.room_id ?? "",
    date: row.date,
    startTime: String(row.start_time).slice(0, 5),
    endTime: String(row.end_time).slice(0, 5),
    reason: row.reason ?? "",
  };
}

function mapWaitingListItem(row: any): WaitingListItem {
  const created = new Date(row.created_at);
  const daysWaiting = Math.max(0, Math.floor((Date.now() - created.getTime()) / 86_400_000));
  return {
    id: row.id,
    patientName: row.patient_name,
    procedureName: row.procedure_name,
    daysWaiting,
  };
}

export const getAgendaOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AgendaOverview> => {
    const supabase = context.supabase;
    const [apptRes, blockRes, waitRes, notifRes] = await Promise.all([
      supabase
        .from("appointments")
        .select("*")
        .eq("owner_id", context.userId)
        .order("date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(2000),
      supabase
        .from("blocked_times")
        .select("*")
        .eq("owner_id", context.userId)
        .order("date", { ascending: true })
        .limit(1000),
      supabase
        .from("waiting_list")
        .select("*")
        .eq("owner_id", context.userId)
        .order("created_at", { ascending: true })
        .limit(200),
      supabase
        .from("appointment_notifications")
        .select("appointment_id, kind, channel, status, sent_at")
        .eq("owner_id", context.userId)
        .limit(5000),
    ]);
    if (apptRes.error) throw new Error(apptRes.error.message);
    if (blockRes.error) throw new Error(blockRes.error.message);
    if (waitRes.error) throw new Error(waitRes.error.message);
    if (notifRes.error) throw new Error(notifRes.error.message);

    const notifByAppt = new Map<string, AppointmentNotification[]>();
    for (const row of (notifRes.data ?? []) as any[]) {
      const list = notifByAppt.get(row.appointment_id) ?? [];
      list.push({
        kind: row.kind,
        channel: row.channel,
        status: row.status,
        sentAt: row.sent_at,
      });
      notifByAppt.set(row.appointment_id, list);
    }

    return {
      appointments: (apptRes.data ?? []).map((row: any) =>
        mapAppointment(row, notifByAppt.get(row.id) ?? []),
      ),
      blockedTimes: (blockRes.data ?? []).map(mapBlockedTime),
      waitingList: (waitRes.data ?? []).map(mapWaitingListItem),
    };
  });

// ---------- appointments: mutations ----------

/**
 * Um atendimento só é dado como realizado com o valor cobrado junto.
 *
 * Zero é aceito de propósito — atendimento de cortesia existe. O que não passa
 * é nulo, que significa "ninguém preencheu". Essa distinção só é possível
 * porque `actual_revenue` é anulável, diferente de `expected_revenue`, que é
 * NOT NULL DEFAULT 0 e por isso não consegue diferenciar as duas coisas.
 */
function assertValorAoConcluir(
  status: AppointmentStatus | undefined,
  actualRevenue: number | null | undefined,
): void {
  if (status !== "completed") return;
  if (actualRevenue === null || actualRevenue === undefined || Number.isNaN(actualRevenue)) {
    throw new Error("Informe o valor cobrado para confirmar o atendimento.");
  }
  if (actualRevenue < 0) throw new Error("O valor cobrado não pode ser negativo.");
}

const appointmentInput = (input: {
  id?: string;
  patientId?: string | null;
  patientName: string;
  procedureName: string;
  professionalId?: string | null;
  professionalName: string;
  roomId?: string | null;
  roomName?: string | null;
  date: string;
  startTime: string;
  endTime: string;
  status?: AppointmentStatus;
  type?: AppointmentType;
  expectedRevenue?: number;
  actualRevenue?: number | null;
  notes?: string | null;
  generateFinancial?: boolean;
}) => {
  if (!input.patientName?.trim()) throw new Error("Informe o nome do paciente");
  if (!input.date) throw new Error("Informe a data");
  if (!input.startTime || !input.endTime) throw new Error("Informe o horário");
  // A regra vive aqui, e não só na tela, porque são quatro caminhos de
  // interface que chegam a "concluído" — o botão do celular, e o formulário
  // em três telas — mais o caso de um agendamento já NASCER concluído, já que
  // o mesmo validador serve create e update. Validar no cliente cobriria um.
  assertValorAoConcluir(input.status, input.actualRevenue);
  return {
    id: input.id,
    patient_id: input.patientId || null,
    patient_name: input.patientName.trim(),
    procedure_name: input.procedureName?.trim() || "Consulta",
    professional_id: input.professionalId || null,
    professional_name: input.professionalName?.trim() || "",
    room_id: input.roomId || null,
    room_name: input.roomName?.trim() || null,
    date: input.date,
    start_time: input.startTime,
    end_time: input.endTime,
    status: input.status ?? "pending",
    type: input.type ?? "consultation",
    expected_revenue: input.expectedRevenue ?? 0,
    // `undefined` vira `null` só quando veio explicitamente nulo; sem a chave,
    // preserva o que já está gravado no update.
    actual_revenue: input.actualRevenue ?? null,
    notes: input.notes?.trim() || null,
    generate_financial: input.generateFinancial ?? true,
  };
};

export const createAppointment = createServerFn({ method: "POST" })
  .inputValidator(appointmentInput)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { id: _ignored, ...row } = data;
    // types.ts é gerado pelo Lovable a partir do banco e só passa a conhecer
    // actual_revenue depois que a migration rodar lá. Mesmo escape que
    // patients.functions.ts já usa, até a regeneração.
    const supabase: any = context.supabase;
    const { data: inserted, error } = await supabase
      .from("appointments")
      .insert({ ...row, owner_id: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const { triggerAppointmentNotification } = await import("@/lib/agenda/notifications.server");
    await triggerAppointmentNotification(inserted.id, "confirmation");
    const { dispatchMetaCapiEvent } = await import("@/lib/integrations/meta-capi.server");
    await dispatchMetaCapiEvent(context.userId, "appointment.created", {
      entityId: inserted.id,
      patientId: row.patient_id,
      contactName: row.patient_name,
      amount: row.expected_revenue,
    });
    return { id: inserted.id };
  });

/**
 * Avisa a Meta de uma mudança de status — **só quando ela de fato aconteceu**.
 *
 * O `event_id` é `<evento>:<id>:<status>`, e a tabela de eventos não tem
 * unique nessa coluna: reenviar depende inteiramente da deduplicação da Meta,
 * que só vale por uma janela. Sem esta guarda, corrigir o valor de um
 * atendimento já confirmado e salvar de novo mandaria uma segunda conversão —
 * ou seja, receita contada em dobro.
 *
 * O valor da conversão é o cobrado; o previsto só entra enquanto não há
 * cobrado, para os outros status.
 */
async function onStatusTransition(
  supabase: any,
  ownerId: string,
  id: string,
  statusAnterior: string | null | undefined,
  row: {
    status: string;
    patient_id: string | null;
    patient_name: string;
    procedure_name?: string | null;
    professional_id?: string | null;
    date?: string | null;
    actual_revenue: number | null;
    expected_revenue: number | null;
    generate_financial?: boolean | null;
  },
): Promise<void> {
  if (statusAnterior === row.status) return;

  const { dispatchMetaCapiEvent } = await import("@/lib/integrations/meta-capi.server");
  await dispatchMetaCapiEvent(ownerId, "appointment.status_changed", {
    entityId: `${id}:${row.status}`,
    status: row.status,
    patientId: row.patient_id,
    contactName: row.patient_name,
    amount: row.actual_revenue ?? row.expected_revenue ?? null,
  });

  // Cumpre o que o interruptor "Gerar cobrança ao concluir" sempre prometeu.
  // Dentro da guarda de transição: reconfirmar ou reeditar não gera segunda
  // cobrança. Best-effort como o resto — uma falha no financeiro não pode
  // desfazer a conclusão do atendimento, que já aconteceu no mundo real.
  if (row.status === "completed" && row.generate_financial) {
    try {
      const { createAppointmentReceivable } = await import("@/lib/finance/receivables.functions");
      await createAppointmentReceivable(supabase, {
        amount: row.actual_revenue ?? 0,
        description: `${row.procedure_name || "Atendimento"} · ${row.patient_name}`,
        dueDate: row.date ?? new Date().toISOString().slice(0, 10),
        patientId: row.patient_id,
        professionalId: row.professional_id ?? null,
      });
    } catch (e) {
      console.error("[agenda] recebimento do atendimento concluído", e);
    }
  }
}

export const updateAppointment = createServerFn({ method: "POST" })
  .inputValidator(appointmentInput)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    if (!data.id) throw new Error("Agendamento inválido");
    const { id, ...row } = data;
    const supabase: any = context.supabase;

    // Lido antes do update: é a única forma de saber que ESTE save foi o que
    // concluiu o atendimento. Antes, salvar o formulário com status concluído
    // não avisava a Meta de nada.
    const { data: antes } = await supabase
      .from("appointments")
      .select("status")
      .eq("id", id)
      .eq("owner_id", context.userId)
      .maybeSingle();

    const { data: updated, error } = await supabase
      .from("appointments")
      .update(row)
      .eq("id", id)
      .eq("owner_id", context.userId)
      .select("status, patient_id, patient_name, procedure_name, professional_id, date, actual_revenue, expected_revenue, generate_financial")
      .single();
    if (error) throw new Error(error.message);

    await onStatusTransition(supabase, context.userId, id, antes?.status, updated);
    return { ok: true };
  });

export const updateAppointmentStatus = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; status: AppointmentStatus; actualRevenue?: number | null }) => {
    assertValorAoConcluir(input.status, input.actualRevenue);
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { data: antes } = await supabase
      .from("appointments")
      .select("status")
      .eq("id", data.id)
      .eq("owner_id", context.userId)
      .maybeSingle();

    // O valor só é gravado ao concluir; os outros status não mexem nele.
    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "completed") patch.actual_revenue = data.actualRevenue;

    const { data: updated, error } = await supabase
      .from("appointments")
      .update(patch)
      .eq("id", data.id)
      .eq("owner_id", context.userId)
      .select("status, patient_id, patient_name, procedure_name, professional_id, date, actual_revenue, expected_revenue, generate_financial")
      .single();
    if (error) throw new Error(error.message);

    await onStatusTransition(supabase, context.userId, data.id, antes?.status, updated);
    return { ok: true };
  });

export const deleteAppointment = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => input)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("appointments")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- blocked times: mutations ----------

const blockedTimeInput = (input: {
  professionalId: string;
  roomId?: string | null;
  date: string;
  startTime: string;
  endTime: string;
  reason?: string | null;
}) => {
  if (!input.professionalId) throw new Error("Selecione o profissional");
  if (!input.date) throw new Error("Informe a data");
  if (!input.startTime || !input.endTime) throw new Error("Informe o horário");
  return {
    professional_id: input.professionalId,
    room_id: input.roomId || null,
    date: input.date,
    start_time: input.startTime,
    end_time: input.endTime,
    reason: input.reason?.trim() || null,
  };
};

export const createBlockedTime = createServerFn({ method: "POST" })
  .inputValidator(blockedTimeInput)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: inserted, error } = await context.supabase
      .from("blocked_times")
      .insert({ ...data, owner_id: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });
