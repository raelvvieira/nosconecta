/* eslint-disable @typescript-eslint/no-explicit-any -- the generated Supabase types are updated only after the new migration is applied */
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { appointments as agendaAppointments } from "@/components/agenda/mock-data";

export type PatientStatus =
  "active" | "in_treatment" | "return_pending" | "delinquent" | "inactive";
export type PatientFilter = "all" | PatientStatus;

export interface PatientAppointment {
  id: string;
  date: string;
  time: string;
  procedure: string;
  professional: string;
  status: string;
}

export interface PatientSummary {
  id: string;
  name: string;
  initials: string;
  phone: string | null;
  cpf: string | null;
  birthDate: string | null;
  age: number | null;
  status: PatientStatus;
  allergyNotes: string | null;
  notes: string | null;
  nextAppointment: PatientAppointment | null;
  lastAppointment: PatientAppointment | null;
  overdueAmount: number;
  pendingAmount: number;
  treatmentName: string | null;
  completedSessions: number;
  totalSessions: number;
}

export interface CareEvent {
  id: string;
  date: string;
  title: string;
  description: string | null;
  type: string;
  status: "completed" | "current" | "scheduled";
}

export interface PatientFinanceRow {
  id: string;
  description: string;
  amount: number;
  dueDate: string;
  paidDate: string | null;
  status: string;
}

export interface PatientDetail extends PatientSummary {
  professionalName: string | null;
  treatmentId: string | null;
  timeline: CareEvent[];
  appointments: PatientAppointment[];
  finances: PatientFinanceRow[];
  receivedAmount: number;
}

export interface PatientsOverview {
  patients: PatientSummary[];
  total: number;
  attention: { returns: number; delinquent: number };
}

function sb() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  }) as any;
}

const DEMO_IDS = {
  joao: "11111111-1111-4111-8111-111111111111",
  maria: "22222222-2222-4222-8222-222222222222",
  pedro: "33333333-3333-4333-8333-333333333333",
};

const DEMO_PATIENTS: any[] = [
  {
    id: DEMO_IDS.joao,
    company_id: "demo",
    name: "João Silva",
    phone: "(11) 98765-4321",
    cpf: "123.456.789-00",
    birth_date: "1992-03-18",
    status: "in_treatment",
    allergy_notes: "Alergia a dipirona",
    notes: "Prefere atendimentos no período da tarde.",
  },
  {
    id: DEMO_IDS.maria,
    company_id: "demo",
    name: "Maria Souza",
    phone: "(11) 97654-3210",
    cpf: "987.654.321-00",
    birth_date: "1987-09-05",
    status: "return_pending",
    allergy_notes: null,
    notes: "Retorno clínico pendente.",
  },
  {
    id: DEMO_IDS.pedro,
    company_id: "demo",
    name: "Pedro Lima",
    phone: "(11) 96543-2109",
    cpf: "456.789.123-00",
    birth_date: "1979-11-22",
    status: "delinquent",
    allergy_notes: null,
    notes: "Entrar em contato antes de confirmar novo procedimento.",
  },
];

const cleanDigits = (value?: string | null) => value?.replace(/\D/g, "") ?? "";
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
const money = (value: unknown) => Number(value ?? 0);

function ageFromBirthDate(value?: string | null) {
  if (!value) return null;
  const birth = new Date(`${value}T00:00:00`);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function toAppointment(row: (typeof agendaAppointments)[number]): PatientAppointment {
  return {
    id: row.id,
    date: row.date,
    time: row.startTime,
    procedure: row.procedureName,
    professional: row.professionalName,
    status: row.status,
  };
}

function demoEnhancement(name: string) {
  if (name === "João Silva")
    return {
      treatmentName: "Clareamento",
      completedSessions: 2,
      totalSessions: 4,
      next: {
        id: "demo-next-1",
        date: new Date().toISOString().slice(0, 10),
        time: "14:00",
        procedure: "Clareamento Dental",
        professional: "Dr. Carlos",
        status: "confirmed",
      } as PatientAppointment,
    };
  if (name === "Maria Souza")
    return {
      treatmentName: "Limpeza + Raspagem",
      completedSessions: 1,
      totalSessions: 2,
      next: null,
    };
  if (name === "Pedro Lima")
    return {
      treatmentName: "Avaliação Ortodôntica",
      completedSessions: 0,
      totalSessions: 1,
      next: null,
    };
  return { treatmentName: null, completedSessions: 0, totalSessions: 0, next: null };
}

function effectiveStatus(row: any, overdueAmount: number): PatientStatus {
  const allowed: PatientStatus[] = [
    "active",
    "in_treatment",
    "return_pending",
    "delinquent",
    "inactive",
  ];
  if (allowed.includes(row.status)) return row.status;
  return overdueAmount > 0 ? "delinquent" : "active";
}

function buildSummary(row: any, transactions: any[], treatments: any[]): PatientSummary {
  const demoProfile = DEMO_PATIENTS.find((item) => item.name === row.name);
  const patientTransactions = transactions.filter((item) => item.patient_id === row.id);
  const overdueAmount = patientTransactions
    .filter(
      (item) =>
        item.status === "overdue" ||
        (item.status === "pending" && item.due_date < new Date().toISOString().slice(0, 10)),
    )
    .reduce((sum, item) => sum + money(item.amount), 0);
  const pendingAmount = patientTransactions
    .filter((item) => item.status === "pending")
    .reduce((sum, item) => sum + money(item.amount), 0);
  const matchingAppointments = agendaAppointments
    .filter(
      (item) =>
        item.patientName.toLocaleLowerCase("pt-BR") === String(row.name).toLocaleLowerCase("pt-BR"),
    )
    .map(toAppointment)
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const today = new Date().toISOString().slice(0, 10);
  const treatment = treatments.find(
    (item) => item.patient_id === row.id && item.status !== "completed",
  );
  const demo = demoEnhancement(row.name);
  const nextAppointment = matchingAppointments.find((item) => item.date >= today) ?? demo.next;
  const lastAppointment =
    [...matchingAppointments].reverse().find((item) => item.date <= today) ?? null;
  return {
    id: row.id,
    name: row.name,
    initials: initialsOf(row.name),
    phone: row.phone ?? demoProfile?.phone ?? null,
    cpf: row.cpf ?? demoProfile?.cpf ?? null,
    birthDate: row.birth_date ?? demoProfile?.birth_date ?? null,
    age: ageFromBirthDate(row.birth_date ?? demoProfile?.birth_date),
    status: effectiveStatus({ ...row, status: row.status ?? demoProfile?.status }, overdueAmount),
    allergyNotes: row.allergy_notes ?? demoProfile?.allergy_notes ?? null,
    notes: row.notes ?? demoProfile?.notes ?? null,
    nextAppointment,
    lastAppointment,
    overdueAmount,
    pendingAmount,
    treatmentName: treatment?.name ?? demo.treatmentName,
    completedSessions: Number(treatment?.completed_sessions ?? demo.completedSessions),
    totalSessions: Number(treatment?.total_sessions ?? demo.totalSessions),
  };
}

async function fetchBase(companyId: string) {
  const supabase = sb();
  const [patientsRes, transactionsRes, treatmentsRes] = await Promise.all([
    supabase.from("patients").select("*").eq("company_id", companyId).order("name"),
    supabase
      .from("financial_transactions")
      .select("id,patient_id,description,amount,due_date,paid_date,status")
      .eq("company_id", companyId)
      .eq("type", "receivable"),
    supabase.from("patient_treatments").select("*").eq("company_id", companyId),
  ]);
  if (patientsRes.error) throw new Error(patientsRes.error.message);
  const rows = patientsRes.data?.length ? patientsRes.data : DEMO_PATIENTS;
  return { rows, transactions: transactionsRes.data ?? [], treatments: treatmentsRes.data ?? [] };
}

export const getPatientsOverview = createServerFn({ method: "GET" })
  .inputValidator((input: { companyId?: string; q?: string; status?: PatientFilter }) => ({
    companyId: input?.companyId ?? "demo",
    q: input?.q?.trim().toLocaleLowerCase("pt-BR") ?? "",
    status: input?.status ?? "all",
  }))
  .handler(async ({ data }): Promise<PatientsOverview> => {
    const base = await fetchBase(data.companyId);
    const all = base.rows.map((row: any) => buildSummary(row, base.transactions, base.treatments));
    const patients = all.filter((patient) => {
      const matchesQuery =
        !data.q ||
        `${patient.name} ${patient.phone ?? ""} ${patient.cpf ?? ""}`
          .toLocaleLowerCase("pt-BR")
          .includes(data.q);
      const matchesStatus = data.status === "all" || patient.status === data.status;
      return matchesQuery && matchesStatus;
    });
    return {
      patients,
      total: all.length,
      attention: {
        returns: all.filter((patient) => patient.status === "return_pending").length,
        delinquent: all.filter((patient) => patient.status === "delinquent").length,
      },
    };
  });

export const getPatientDetail = createServerFn({ method: "GET" })
  .inputValidator((input: { companyId?: string; patientId: string }) => ({
    companyId: input?.companyId ?? "demo",
    patientId: input.patientId,
  }))
  .handler(async ({ data }): Promise<PatientDetail> => {
    const supabase = sb();
    const base = await fetchBase(data.companyId);
    const row =
      base.rows.find((item: any) => item.id === data.patientId) ??
      DEMO_PATIENTS.find((item) => item.id === data.patientId);
    if (!row) throw new Error("Paciente não encontrado.");
    const summary = buildSummary(row, base.transactions, base.treatments);
    const [eventsRes, professionalsRes] = await Promise.all([
      supabase
        .from("patient_care_events")
        .select("*")
        .eq("company_id", data.companyId)
        .eq("patient_id", data.patientId)
        .order("event_at"),
      row.responsible_professional_id
        ? supabase
            .from("professionals")
            .select("name")
            .eq("id", row.responsible_professional_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const finances = base.transactions
      .filter((item: any) => item.patient_id === data.patientId)
      .map((item: any) => ({
        id: item.id,
        description: item.description,
        amount: money(item.amount),
        dueDate: item.due_date,
        paidDate: item.paid_date,
        status: item.status,
      }));
    const appointments = agendaAppointments
      .filter(
        (item) =>
          item.patientName.toLocaleLowerCase("pt-BR") === row.name.toLocaleLowerCase("pt-BR"),
      )
      .map(toAppointment);
    let timeline: CareEvent[] = (eventsRes.data ?? []).map((item: any) => ({
      id: item.id,
      date: item.event_at,
      title: item.title,
      description: item.description,
      type: item.event_type,
      status: item.status,
    }));
    if (!timeline.length && row.name === "João Silva") {
      const year = new Date().getFullYear();
      timeline = [
        {
          id: "demo-event-1",
          date: `${year}-06-12T10:00:00`,
          title: "Avaliação",
          description: "Avaliação inicial",
          type: "evaluation",
          status: "completed",
        },
        {
          id: "demo-event-2",
          date: `${year}-06-18T14:00:00`,
          title: "Clareamento",
          description: "Primeira sessão",
          type: "procedure",
          status: "completed",
        },
        {
          id: "demo-event-3",
          date: new Date().toISOString(),
          title: "Retorno",
          description: "Acompanhamento",
          type: "return",
          status: "current",
        },
        {
          id: "demo-event-4",
          date: `${year}-07-05T14:00:00`,
          title: "Próxima sessão",
          description: "Segunda etapa",
          type: "appointment",
          status: "scheduled",
        },
      ];
    }
    if (!timeline.length) {
      timeline = appointments.map((item) => ({
        id: `appointment-${item.id}`,
        date: `${item.date}T${item.time}:00`,
        title: item.procedure,
        description: item.professional,
        type: "appointment",
        status: item.date < new Date().toISOString().slice(0, 10) ? "completed" : "scheduled",
      }));
    }
    return {
      ...summary,
      professionalName:
        professionalsRes.data?.name ?? summary.nextAppointment?.professional ?? null,
      treatmentId:
        base.treatments.find(
          (item: any) => item.patient_id === data.patientId && item.status !== "completed",
        )?.id ?? null,
      timeline,
      appointments,
      finances,
      receivedAmount: finances
        .filter((item) => item.status === "paid")
        .reduce((sum, item) => sum + item.amount, 0),
    };
  });

const patientInput = (input: {
  companyId?: string;
  id?: string;
  name: string;
  phone?: string;
  cpf?: string;
  birthDate?: string;
  status?: PatientStatus;
  allergyNotes?: string;
  notes?: string;
}) => ({
  companyId: input.companyId ?? "demo",
  id: input.id,
  name: input.name.trim(),
  phone: input.phone?.trim() || null,
  cpf: input.cpf?.trim() || null,
  birthDate: input.birthDate || null,
  status: input.status ?? "active",
  allergyNotes: input.allergyNotes?.trim() || null,
  notes: input.notes?.trim() || null,
});

export const createPatient = createServerFn({ method: "POST" })
  .inputValidator(patientInput)
  .handler(async ({ data }) => {
    if (!data.name) throw new Error("Informe o nome do paciente.");
    const supabase = sb();
    const { data: created, error } = await supabase
      .from("patients")
      .insert({
        company_id: data.companyId,
        name: data.name,
        phone: data.phone,
        cpf: data.cpf,
        birth_date: data.birthDate,
        status: data.status,
        allergy_notes: data.allergyNotes,
        notes: data.notes,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

export const updatePatient = createServerFn({ method: "POST" })
  .inputValidator(patientInput)
  .handler(async ({ data }) => {
    if (!data.id) throw new Error("Paciente inválido.");
    const supabase = sb();
    const { error } = await supabase
      .from("patients")
      .update({
        name: data.name,
        phone: data.phone,
        cpf: data.cpf,
        birth_date: data.birthDate,
        status: data.status,
        allergy_notes: data.allergyNotes,
        notes: data.notes,
      })
      .eq("id", data.id)
      .eq("company_id", data.companyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const formatPatientWhatsApp = (phone: string | null) => {
  const digits = cleanDigits(phone);
  return digits ? `https://wa.me/${digits.startsWith("55") ? digits : `55${digits}`}` : null;
};
