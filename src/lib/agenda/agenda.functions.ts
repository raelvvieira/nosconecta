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
  notes?: string | null;
  generateFinancial?: boolean;
}) => {
  if (!input.patientName?.trim()) throw new Error("Informe o nome do paciente");
  if (!input.date) throw new Error("Informe a data");
  if (!input.startTime || !input.endTime) throw new Error("Informe o horário");
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
    notes: input.notes?.trim() || null,
    generate_financial: input.generateFinancial ?? true,
  };
};

export const createAppointment = createServerFn({ method: "POST" })
  .inputValidator(appointmentInput)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { id: _ignored, ...row } = data;
    const { data: inserted, error } = await context.supabase
      .from("appointments")
      .insert({ ...row, owner_id: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const { triggerAppointmentNotification } = await import("@/lib/agenda/notifications.server");
    await triggerAppointmentNotification(inserted.id, "confirmation");
    return { id: inserted.id };
  });

export const updateAppointment = createServerFn({ method: "POST" })
  .inputValidator(appointmentInput)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    if (!data.id) throw new Error("Agendamento inválido");
    const { id, ...row } = data;
    const { error } = await context.supabase
      .from("appointments")
      .update(row)
      .eq("id", id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateAppointmentStatus = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; status: AppointmentStatus }) => input)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("appointments")
      .update({ status: data.status })
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
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
