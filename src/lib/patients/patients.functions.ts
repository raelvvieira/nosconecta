/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

export type PatientGender = "M" | "F";

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
  gender: PatientGender | null;
  neighborhood: string | null;
  zipCode: string | null;
  city: string | null;
  address: string | null;
  state: string | null;
  addressComplement: string | null;
  guardianName: string | null;
  guardianCpf: string | null;
  legacyPatientId: string | null;
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

function buildSummary(row: any, transactions: any[]): PatientSummary {
  const patientTransactions = transactions.filter((item) => item.patient_id === row.id);
  const today = new Date().toISOString().slice(0, 10);
  const overdueAmount = patientTransactions
    .filter(
      (item) =>
        item.status === "overdue" ||
        (item.status === "pending" && item.due_date < today),
    )
    .reduce((sum, item) => sum + money(item.amount), 0);
  const pendingAmount = patientTransactions
    .filter((item) => item.status === "pending")
    .reduce((sum, item) => sum + money(item.amount), 0);
  return {
    id: row.id,
    name: row.name,
    initials: initialsOf(row.name),
    phone: row.phone ?? null,
    cpf: row.cpf ?? null,
    birthDate: row.birth_date ?? null,
    age: ageFromBirthDate(row.birth_date),
    status: effectiveStatus(row, overdueAmount),
    allergyNotes: row.allergy_notes ?? null,
    notes: row.notes ?? null,
    gender: row.gender ?? null,
    neighborhood: row.neighborhood ?? null,
    zipCode: row.zip_code ?? null,
    city: row.city ?? null,
    address: row.address ?? null,
    state: row.state ?? null,
    addressComplement: row.address_complement ?? null,
    guardianName: row.guardian_name ?? null,
    guardianCpf: row.guardian_cpf ?? null,
    legacyPatientId: row.legacy_patient_id ?? null,
    nextAppointment: null,
    lastAppointment: null,
    overdueAmount,
    pendingAmount,
    treatmentName: null,
    completedSessions: 0,
    totalSessions: 0,
  };
}

async function fetchBase(supabase: any, userId: string) {
  const [patientsRes, transactionsRes] = await Promise.all([
    supabase.from("patients").select("*").eq("owner_id", userId).order("name").limit(10000),
    supabase
      .from("financial_transactions")
      .select("id,patient_id,description,amount,due_date,paid_date,status")
      .eq("type", "receivable"),
  ]);
  if (patientsRes.error) throw new Error(patientsRes.error.message);
  return { rows: patientsRes.data ?? [], transactions: transactionsRes.data ?? [] };
}

export const getPatientsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { q?: string; status?: PatientFilter } | undefined) => ({
    q: input?.q?.trim().toLocaleLowerCase("pt-BR") ?? "",
    status: input?.status ?? "all",
  }))
  .handler(async ({ data, context }): Promise<PatientsOverview> => {
    const base = await fetchBase(context.supabase, context.userId);
    const all = base.rows.map((row: any) => buildSummary(row, base.transactions));
    const patients = all.filter((patient: PatientSummary) => {
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
        returns: all.filter((p: PatientSummary) => p.status === "return_pending").length,
        delinquent: all.filter((p: PatientSummary) => p.status === "delinquent").length,
      },
    };
  });

export const getPatientDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { patientId: string }) => ({ patientId: input.patientId }))
  .handler(async ({ data, context }): Promise<PatientDetail> => {
    const supabase: any = context.supabase;
    const base = await fetchBase(supabase, context.userId);
    const row = base.rows.find((item: any) => item.id === data.patientId);
    if (!row) throw new Error("Paciente não encontrado.");
    const summary = buildSummary(row, base.transactions);
    const professionalsRes = row.responsible_professional_id
      ? await supabase
          .from("professionals")
          .select("name")
          .eq("id", row.responsible_professional_id)
          .maybeSingle()
      : { data: null };
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
    return {
      ...summary,
      professionalName: professionalsRes.data?.name ?? null,
      treatmentId: null,
      timeline: [],
      appointments: [],
      finances,
      receivedAmount: finances
        .filter((item: PatientFinanceRow) => item.status === "paid")
        .reduce((sum: number, item: PatientFinanceRow) => sum + item.amount, 0),
    };
  });

const patientInput = (input: {
  id?: string;
  name: string;
  phone?: string;
  cpf?: string;
  birthDate?: string;
  status?: PatientStatus;
  allergyNotes?: string;
  notes?: string;
  gender?: PatientGender | "";
  neighborhood?: string;
  zipCode?: string;
  city?: string;
  address?: string;
  state?: string;
  addressComplement?: string;
  guardianName?: string;
  guardianCpf?: string;
}) => ({
  id: input.id,
  name: input.name.trim(),
  phone: input.phone?.trim() || null,
  cpf: input.cpf?.trim() || null,
  birthDate: input.birthDate || null,
  status: input.status ?? "active",
  allergyNotes: input.allergyNotes?.trim() || null,
  notes: input.notes?.trim() || null,
  gender: (input.gender || null) as PatientGender | null,
  neighborhood: input.neighborhood?.trim() || null,
  zipCode: input.zipCode?.trim() || null,
  city: input.city?.trim() || null,
  address: input.address?.trim() || null,
  state: input.state?.trim() || null,
  addressComplement: input.addressComplement?.trim() || null,
  guardianName: input.guardianName?.trim() || null,
  guardianCpf: input.guardianCpf?.trim() || null,
});

export const createPatient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(patientInput)
  .handler(async ({ data, context }) => {
    if (!data.name) throw new Error("Informe o nome do paciente.");
    const supabase: any = context.supabase;
    const { data: created, error } = await supabase
      .from("patients")
      .insert({
        owner_id: context.userId,
        name: data.name,
        phone: data.phone,
        cpf: data.cpf,
        birth_date: data.birthDate,
        status: data.status,
        allergy_notes: data.allergyNotes,
        notes: data.notes,
        gender: data.gender,
        neighborhood: data.neighborhood,
        zip_code: data.zipCode,
        city: data.city,
        address: data.address,
        state: data.state,
        address_complement: data.addressComplement,
        guardian_name: data.guardianName,
        guardian_cpf: data.guardianCpf,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

export const updatePatient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(patientInput)
  .handler(async ({ data, context }) => {
    if (!data.id) throw new Error("Paciente inválido.");
    const supabase: any = context.supabase;
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
        gender: data.gender,
        neighborhood: data.neighborhood,
        zip_code: data.zipCode,
        city: data.city,
        address: data.address,
        state: data.state,
        address_complement: data.addressComplement,
        guardian_name: data.guardianName,
        guardian_cpf: data.guardianCpf,
      })
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export interface PatientSearchResult {
  id: string;
  name: string;
  phone: string | null;
}

export const searchPatients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { q?: string } | undefined) => ({
    q: input?.q?.trim().toLocaleLowerCase("pt-BR") ?? "",
  }))
  .handler(async ({ data, context }): Promise<PatientSearchResult[]> => {
    const supabase: any = context.supabase;
    let query = supabase
      .from("patients")
      .select("id,name,phone")
      .eq("owner_id", context.userId)
      .order("name")
      .limit(20);
    if (data.q) query = query.ilike("name", `%${data.q}%`);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      phone: row.phone ?? null,
    }));
  });

export const deletePatient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { error } = await supabase
      .from("patients")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const formatPatientWhatsApp = (phone: string | null) => {
  const digits = cleanDigits(phone);
  return digits ? `https://wa.me/${digits.startsWith("55") ? digits : `55${digits}`}` : null;
};
