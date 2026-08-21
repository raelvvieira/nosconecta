/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { resolveUnitId } from "@/lib/auth/resolve-unit";
import { normalizeBrazilianPhone } from "@/lib/atendimentos/phone";
import { clinicTodayStr } from "@/lib/date";

// Empurra o paciente pro CRM (fonte da verdade é sempre o paciente, nunca o
// contrário). Best-effort: se o CRM estiver fora do ar ou a clínica ainda
// não tiver credenciais cadastradas, o cadastro do paciente NUNCA pode
// falhar por causa disso — só loga e segue.
async function pushContactToCrm(
  ownerId: string,
  patientId: string,
  name: string,
  phone: string | null,
): Promise<void> {
  try {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) return;
    const res = await fetch(`${url}/functions/v1/crm-contacts`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ ownerId, action: "upsert", patient: { patientId, name, phone } }),
    });
    if (!res.ok) {
      console.error("[pushContactToCrm] crm-contacts respondeu", res.status, await res.text().catch(() => ""));
    }
  } catch (e) {
    console.error("[pushContactToCrm]", e);
  }
}

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
  email: string | null;
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
  /** Contato correspondente no CRM, quando o paciente já foi vinculado.
   *  A coluna sempre veio no `select("*")` do detalhe; só não era exposta —
   *  e é ela que permite mostrar a conversa de WhatsApp dentro da ficha, sem
   *  nenhuma consulta nova. */
  crmContactId: string | null;
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
  const today = clinicTodayStr();
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
    email: row.email ?? null,
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

/**
 * `unitId` explícito: RLS já garante que ninguém enxerga fora da própria
 * unidade (nem que este filtro fosse esquecido), mas é ele quem decide o que
 * pedir de fato. `null` = sem filtro — admin vendo "todas as unidades" — só
 * possível pra quem é admin, RLS bloqueia o mesmo pedido pra qualquer outro
 * papel de qualquer forma.
 */
async function fetchBase(supabase: any, ownerId: string, unitId: string | null) {
  let patientsQuery = supabase.from("patients").select("*").eq("owner_id", ownerId).order("name").limit(10000);
  if (unitId) patientsQuery = patientsQuery.eq("unit_id", unitId);
  const [patientsRes, transactionsRes] = await Promise.all([
    patientsQuery,
    supabase
      .from("financial_transactions")
      .select("id,patient_id,description,amount,due_date,paid_date,status")
      .eq("type", "receivable"),
  ]);
  if (patientsRes.error) throw new Error(patientsRes.error.message);
  return { rows: patientsRes.data ?? [], transactions: transactionsRes.data ?? [] };
}

export const getPatientsOverview = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { q?: string; status?: PatientFilter; unitId?: string } | undefined) => ({
    q: input?.q?.trim().toLocaleLowerCase("pt-BR") ?? "",
    status: input?.status ?? "all",
    unitId: input?.unitId ?? null,
  }))
  .handler(async ({ data, context }): Promise<PatientsOverview> => {
    // Não-admin nunca escolhe: sempre a própria unidade, ignorando qualquer
    // coisa que viesse no payload.
    const unitFilter = context.isAdmin ? data.unitId : context.unitId;
    const base = await fetchBase(context.supabase, context.ownerId, unitFilter);
    const all = base.rows.map((row: any) => buildSummary(row, base.transactions));
    const patients = all.filter((patient: PatientSummary) => {
      const matchesQuery =
        !data.q ||
        `${patient.name} ${patient.phone ?? ""} ${patient.email ?? ""} ${patient.cpf ?? ""}`
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
  .middleware([requireClinicMembership])
  .inputValidator((input: { patientId: string }) => ({ patientId: input.patientId }))
  .handler(async ({ data, context }): Promise<PatientDetail> => {
    const supabase: any = context.supabase;
    // Busca direta pelo id: a lista paginada podia não conter o paciente
    // (limite de linhas), fazendo um paciente existente parecer inexistente.
    // A RLS decide sozinha se essa linha existe pra quem está pedindo.
    const patientRes = await supabase
      .from("patients")
      .select("*")
      .eq("id", data.patientId)
      .maybeSingle();
    if (patientRes.error) throw new Error(patientRes.error.message);
    const row = patientRes.data;
    if (!row) throw new Error("Paciente não encontrado.");
    const transactionsRes = await supabase
      .from("financial_transactions")
      .select("id,patient_id,description,amount,due_date,paid_date,status")
      .eq("type", "receivable")
      .eq("patient_id", data.patientId);
    const base = { transactions: transactionsRes.data ?? [] };
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
      crmContactId: row.crm_contact_id ?? null,
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
  email?: string;
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
  /**
   * Contato do CRM que originou este paciente, quando ele nasce de uma
   * conversa de WhatsApp em vez do cadastro manual.
   *
   * Gravar isto na criação importa por dois motivos. O `handleUpsert` do
   * crm-contacts lê esta coluna: com ela preenchida ele faz PATCH no contato
   * que já existe, sem ela cria um contato duplicado. E é por ela que o
   * `resolvePerson` da Meta CAPI acha o paciente quando o evento não traz
   * patientId.
   */
  crmContactId?: string;
  /** Só é lido de fato pra admin — quem não é admin sempre cai na própria
   *  unidade, carimbada pelo servidor. */
  unitId?: string;
}) => ({
  id: input.id,
  name: input.name.trim(),
  crmContactId: input.crmContactId?.trim() || null,
  unitId: input.unitId?.trim() || null,
  // Completa o "55" quando falta — telefone sem código do país faz o CRM
  // interpretar o DDD como de outro país e criar um contato pro qual o
  // WhatsApp nunca entrega (ver normalizeBrazilianPhone).
  phone: input.phone?.trim() ? normalizeBrazilianPhone(input.phone) : null,
  email: input.email?.trim().toLowerCase() || null,
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

// Caminho inverso do pushContactToCrm: dado um contato do CRM, acha o
// paciente local correspondente. Até agora esse lookup só existia dentro da
// Edge Function da Meta CAPI, que roda com service role.
export const getPatientByCrmContact = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { crmContactId: string }) => input)
  .handler(async ({ data, context }): Promise<{ id: string; name: string } | null> => {
    if (!data.crmContactId) return null;
    const supabase: any = context.supabase;
    const { data: row, error } = await supabase
      .from("patients")
      .select("id, name")
      .eq("crm_contact_id", data.crmContactId)
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ? { id: row.id, name: row.name } : null;
  });

/**
 * Garante um paciente de verdade por trás de um contato de WhatsApp.
 *
 * Sem uma linha em `patients`, a Edge Function da Meta não tem de onde tirar
 * telefone e e-mail: o `resolvePerson` busca **só** nessa tabela, por `id` ou
 * por `crm_contact_id`. Sem ela, a conversão sai com hash de nome e mais nada,
 * e o casamento na Meta se perde. Era o que acontecia com todo "Ganho" do
 * funil.
 *
 * É idempotente por `crm_contact_id`: reencontra em vez de duplicar, dos dois
 * lados — aqui e no `handleUpsert` do crm-contacts, que dá PATCH no contato
 * existente em vez de criar outro.
 *
 * O telefone é gravado no formato do `formatWhatsappNumber`, igual ao caminho
 * da Agenda. Duas convenções na mesma coluna seria pior que nenhuma; o
 * `normPhone` da Meta tira a pontuação e valida o E.164 depois.
 *
 * Versão de servidor da `resolvePatientId` de `useSaveAppointment.ts`, que
 * precisa viver no cliente por compor várias server functions numa mutation.
 */
export async function resolverPacienteDoContato(
  supabase: any,
  ownerId: string,
  contato: {
    patientId?: string | null;
    name?: string | null;
    phone?: string | null;
    crmContactId?: string | null;
  },
  // Obrigatório pra CRIAR paciente novo (unit_id é NOT NULL); pra reencontro
  // por id/crm_contact_id não é usado — a linha já tem a unidade dela.
  unitId: string,
): Promise<{ id: string; name: string; phone: string | null } | null> {
  const nome = contato.name?.trim();
  // Completa o "55" quando falta — mesmo cuidado do patientInput/PatientFormSheet,
  // aqui pro caminho de quem nasce de uma conversa (Agenda por chat, funil "Ganho").
  const telefone = contato.phone ? normalizeBrazilianPhone(contato.phone) : null;

  const ler = async (coluna: "id" | "crm_contact_id", valor: string) => {
    const { data } = await supabase
      .from("patients")
      .select("id, name, phone")
      .eq(coluna, valor)
      .eq("owner_id", ownerId)
      .maybeSingle();
    return data ?? null;
  };

  let paciente =
    (contato.patientId ? await ler("id", contato.patientId) : null) ??
    (contato.crmContactId ? await ler("crm_contact_id", contato.crmContactId) : null);

  if (paciente) {
    // Paciente antigo sem telefone: completar é o que faz a conversão passar a
    // casar. Nunca sobrescreve um número que já existe — quem digitou lá sabia
    // mais do que o CRM sabe.
    if (telefone && !paciente.phone) {
      await supabase
        .from("patients")
        .update({ phone: telefone, updated_at: new Date().toISOString() })
        .eq("id", paciente.id)
        .eq("owner_id", ownerId);
      paciente = { ...paciente, phone: telefone };
    }
    return { id: paciente.id, name: paciente.name, phone: paciente.phone ?? null };
  }

  // Sem nome não se inventa paciente — ficaria uma linha órfã sem serventia.
  if (!nome) return null;

  const { data: criado, error } = await supabase
    .from("patients")
    .insert({
      owner_id: ownerId,
      unit_id: unitId,
      name: nome,
      phone: telefone,
      crm_contact_id: contato.crmContactId || null,
      status: "active",
    })
    .select("id, name, phone")
    .single();
  if (error) throw new Error(error.message);

  // Mesmos efeitos do createPatient, pelos mesmos motivos (ver comentários lá).
  await pushContactToCrm(ownerId, criado.id, criado.name, criado.phone ?? null);
  const { dispatchMetaCapiEvent } = await import("@/lib/integrations/meta-capi.server");
  await dispatchMetaCapiEvent(ownerId, "patient.created", {
    entityId: criado.id,
    patientId: criado.id,
    contactName: criado.name,
  });
  const { dispatchAutomationEvent } = await import("@/lib/atendimentos/automations.server");
  await dispatchAutomationEvent(ownerId, "patient.created", {
    entityId: criado.id,
    patientId: criado.id,
    contactName: criado.name,
  });

  return { id: criado.id, name: criado.name, phone: criado.phone ?? null };
}

export const createPatient = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator(patientInput)
  .handler(async ({ data, context }) => {
    if (!data.name) throw new Error("Informe o nome do paciente.");
    // Não-admin: sempre a própria unidade, ignora qualquer unitId do payload.
    const unitId = await resolveUnitId(context, data.unitId);
    const supabase: any = context.supabase;
    const { data: created, error } = await supabase
      .from("patients")
      .insert({
        owner_id: context.ownerId,
        unit_id: unitId,
        name: data.name,
        phone: data.phone,
        email: data.email,
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
        crm_contact_id: data.crmContactId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    // Aguarda (mas nunca propaga erro) — em runtime serverless (Cloudflare
    // Workers) uma promise não aguardada pode ser cancelada assim que a
    // resposta é enviada, então "fire-and-forget" de verdade não é seguro
    // aqui.
    await pushContactToCrm(context.ownerId, created.id, data.name, data.phone);
    const { dispatchMetaCapiEvent } = await import("@/lib/integrations/meta-capi.server");
    await dispatchMetaCapiEvent(context.ownerId, "patient.created", {
      entityId: created.id,
      patientId: created.id,
    });
    const { dispatchAutomationEvent } = await import("@/lib/atendimentos/automations.server");
    await dispatchAutomationEvent(context.ownerId, "patient.created", {
      entityId: created.id,
      patientId: created.id,
      contactName: data.name,
    });
    return { id: created.id };
  });

export const updatePatient = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator(patientInput)
  .handler(async ({ data, context }) => {
    if (!data.id) throw new Error("Paciente inválido.");
    const supabase: any = context.supabase;
    const { error } = await supabase
      .from("patients")
      .update({
        name: data.name,
        phone: data.phone,
        email: data.email,
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
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    await pushContactToCrm(context.ownerId, data.id, data.name, data.phone);
    return { ok: true };
  });

export interface PatientSearchResult {
  id: string;
  name: string;
  phone: string | null;
}

export const searchPatients = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { q?: string } | undefined) => ({
    q: input?.q?.trim().toLocaleLowerCase("pt-BR") ?? "",
  }))
  .handler(async ({ data, context }): Promise<PatientSearchResult[]> => {
    const supabase: any = context.supabase;
    let query = supabase
      .from("patients")
      .select("id,name,phone")
      .eq("owner_id", context.ownerId)
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
  .middleware([requireClinicMembership])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { error } = await supabase
      .from("patients")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const formatPatientWhatsApp = (phone: string | null) => {
  const digits = cleanDigits(phone);
  return digits ? `https://wa.me/${digits.startsWith("55") ? digits : `55${digits}`}` : null;
};

export interface PatientContact {
  id: string;
  name: string;
  phone: string;
}

/**
 * Pacientes da NÓS que nunca tiveram conversa de WhatsApp sincronizada — por
 * isso não aparecem na base de contatos do CRM (que só existe pra quem já
 * apareceu numa conversa daquele número).
 *
 * Existe pra que "Selecionar contatos" na campanha alcance também quem foi
 * cadastrado direto no sistema e nunca mandou mensagem — sem isso, essas
 * pessoas eram invisíveis pra qualquer disparo filtrado.
 */
export const getPatientContacts = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<PatientContact[]> => {
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("patients")
      .select("id, name, phone")
      .eq("owner_id", context.ownerId)
      .is("crm_contact_id", null)
      .not("phone", "is", null);
    if (error) throw new Error(error.message);
    return (data ?? [])
      .filter((p: any) => p.phone)
      .map((p: any) => ({ id: p.id, name: p.name ?? "Sem nome", phone: p.phone }));
  });

/**
 * Cria (ou acha) o contato no CRM pra um paciente que ainda não tinha um —
 * é o que torna um paciente "sem conversa" disparável de verdade: o motor de
 * envio (whatsapp-broadcast) só sabe falar com um `contactId` do CRM, nunca
 * com um id de paciente.
 *
 * Ao contrário de `pushContactToCrm` (best-effort, silencioso, chamado no
 * salvar do cadastro), esta é síncrona e propaga erro: no disparo, não dar
 * pra vincular precisa impedir o envio, não ser engolido.
 */
export const garantirContatoCrm = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { patientId: string; name: string; phone: string }) => input)
  .handler(async ({ data, context }): Promise<{ contactId: string | null }> => {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");
    // Timeout do CRM é lentidão momentânea do outro lado: uma segunda
    // tentativa costuma resolver, e só então viramos erro para o usuário.
    let ultimoErro = "Falha ao vincular contato no CRM";
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      try {
        const res = await fetch(`${url}/functions/v1/crm-contacts`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({
            ownerId: context.ownerId,
            action: "upsert",
            patient: { patientId: data.patientId, name: data.name, phone: data.phone },
          }),
          signal: AbortSignal.timeout(55_000),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok) return { contactId: json.contactId ? String(json.contactId) : null };
        ultimoErro = json?.error ?? `Falha ao vincular contato no CRM (${res.status})`;
        // Erro de regra (4xx que não seja timeout) não melhora repetindo.
        if (res.status < 500 && !/demorou|timeout|timed out/i.test(String(ultimoErro))) break;
      } catch {
        ultimoErro = "O CRM demorou demais para responder ao cadastrar o contato. Tente novamente em instantes.";
      }
    }
    throw new Error(ultimoErro);
  });

/**
 * Vincula de uma vez toda a base de pacientes sem `crm_contact_id` cujo
 * telefone já é um contato no CRM — o caso comum numa clínica cujo WhatsApp
 * já vinha recebendo mensagem dessas pessoas antes deste sistema existir.
 * Sem isto, cada disparo pra um paciente "sem conversa" nessa situação bate
 * no caminho lento de `garantirContatoCrm` (cria, toma 422 de telefone
 * duplicado, varre a base procurando) — rodar isto uma vez evita repetir
 * essa varredura a cada disparo.
 */
export const backfillCrmContactLinks = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .handler(
    async ({ context }): Promise<{ pacientesSemVinculo: number; linkados: number; baseTruncada: boolean }> => {
      if (!context.isAdmin) throw new Error("Apenas administradores podem rodar isto.");
      const url = process.env.SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !serviceKey) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");
      const res = await fetch(`${url}/functions/v1/crm-contacts`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ ownerId: context.ownerId, action: "backfill-links" }),
        // A varredura completa da base de contatos pode levar até os 45s que
        // handleList já se dá — sem uma margem por cima disso, uma base
        // grande derrubava a chamada por timeout do lado de cá antes da
        // Edge Function terminar.
        signal: AbortSignal.timeout(55_000),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `Falha ao vincular pacientes (${res.status})`);
      return {
        pacientesSemVinculo: Number(json.pacientesSemVinculo ?? 0),
        linkados: Number(json.linkados ?? 0),
        baseTruncada: Boolean(json.baseTruncada),
      };
    },
  );

/**
 * Corrige telefone de paciente salvo sem o "55" do Brasil (ex.:
 * "51993351821" — DDD 51, faltando o código do país) — confirmado pelo time
 * do CRM (15/08): esse formato faz o CRM interpretar o DDD como código de
 * outro país (Peru/Argentina) e criar um contato pro qual o WhatsApp nunca
 * entrega. Só corrige o padrão exato do bug relatado — 10 ou 11 dígitos,
 * sem "55" na frente — nunca telefones já certos ou claramente de outro
 * formato, pra não inventar código de país por cima de algo que já é válido.
 *
 * Zera `crm_contact_id` de quem corrige: o contato que já existe no CRM pra
 * esse paciente é o errado (o brasileiro virou peruano/argentino), então o
 * vínculo antigo precisa ser esquecido — o próximo disparo (ou rodar
 * "Vincular pacientes ao CRM" de novo) resolve o contato certo do zero,
 * agora com o telefone corrigido.
 */
export const fixMissingCountryCodePhones = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<{ corrigidos: number }> => {
    if (!context.isAdmin) throw new Error("Apenas administradores podem rodar isto.");
    const supabase: any = context.supabase;
    const { data: pacientes, error } = await supabase
      .from("patients")
      .select("id, phone")
      .eq("owner_id", context.ownerId)
      .not("phone", "is", null);
    if (error) throw new Error(error.message);

    let corrigidos = 0;
    for (const p of (pacientes ?? []) as any[]) {
      const digitos = String(p.phone).replace(/\D/g, "");
      if (digitos.length !== 10 && digitos.length !== 11) continue;
      if (digitos.startsWith("55")) continue;
      const { error: updError } = await supabase
        .from("patients")
        .update({ phone: `55${digitos}`, crm_contact_id: null })
        .eq("id", p.id)
        .eq("owner_id", context.ownerId);
      if (!updError) corrigidos++;
    }
    return { corrigidos };
  });
