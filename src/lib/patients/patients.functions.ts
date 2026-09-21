/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { resolveUnitId } from "@/lib/auth/resolve-unit";
import { dividirNome, montarNome } from "./nome";
import { gravarTolerandoColunaAusente, semColuna } from "@/lib/schema-fallback";
import { normalizeBrazilianPhone } from "@/lib/atendimentos/phone";
import { clinicTodayStr } from "@/lib/date";

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
  /** Nome e sobrenome como o cadastro os separou — é o que a Meta recebe em
   *  `fn` e `ln`. Em ficha antiga vem da divisão automática do nome inteiro. */
  firstName: string;
  lastName: string;
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
  /** Quando a ficha foi criada. Já vinha no `select("*")` e era descartada —
   *  é o "paciente desde" que o painel do chat mostra. */
  createdAt: string | null;
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

/** As duas colunas que a migration 20260902120000 cria, juntas. */
const NOME_SEPARADO = ["first_name", "last_name"];

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
  // Enquanto a migration não roda, `first_name`/`last_name` nem existem na
  // linha e chegam `undefined`; `montarNome` cai na divisão automática do nome
  // inteiro, e o formulário de edição já abre com as duas partes preenchidas
  // em vez de um campo vazio.
  const nome = montarNome({
    name: row.name,
    firstName: row.first_name,
    lastName: row.last_name,
  });
  const patientTransactions = transactions.filter((item) => item.patient_id === row.id);
  const today = clinicTodayStr();
  const overdueAmount = patientTransactions
    .filter(
      (item) => item.status === "overdue" || (item.status === "pending" && item.due_date < today),
    )
    .reduce((sum, item) => sum + money(item.amount), 0);
  const pendingAmount = patientTransactions
    .filter((item) => item.status === "pending")
    .reduce((sum, item) => sum + money(item.amount), 0);
  return {
    id: row.id,
    name: row.name,
    firstName: nome.primeiro,
    lastName: nome.sobrenome,
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
  let patientsQuery = supabase
    .from("patients")
    .select("*")
    .eq("owner_id", ownerId)
    .order("name")
    .limit(10000);
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
      createdAt: row.created_at ?? null,
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
  /**
   * O nome inteiro numa linha. Continua aceito porque nem todo caminho tem os
   * dois campos: o painel do chat cria a ficha com o nome que veio do
   * WhatsApp, e ali não há o que separar. Quando `firstName` vem junto, ele
   * manda — ver `montarNome`.
   */
  name?: string;
  firstName?: string;
  lastName?: string;
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
}) => {
  // Um lugar só decide o nome: aqui. `createPatient` e `updatePatient`
  // gravam o que sair daqui, e o gatilho do banco é a rede embaixo — para a
  // escrita que não passa por esta função (importação, interface do Lovable).
  const nome = montarNome(input);
  return {
    id: input.id,
    name: nome.completo,
    firstName: nome.primeiro || null,
    lastName: nome.sobrenome || null,
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
  };
};

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
  const partes = dividirNome(contato.name);
  const nome = partes.completo;
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

  const linha = {
    owner_id: ownerId,
    unit_id: unitId,
    name: partes.completo,
    // Nome do WhatsApp não vem separado, então a divisão é a automática — a
    // mesma que a Meta já fazia sozinha. Gravar aqui em vez de deixar só pro
    // gatilho deixa a divisão visível e corrigível na ficha.
    first_name: partes.primeiro || null,
    last_name: partes.sobrenome || null,
    phone: telefone,
    crm_contact_id: contato.crmContactId || null,
    status: "active",
  };
  const { data: criado, error } = await gravarTolerandoColunaAusente({
    coluna: NOME_SEPARADO,
    // Nada se perde sem elas: `name` já leva o nome inteiro, e a Meta volta a
    // dividir sozinha, como fazia antes.
    exigida: false,
    motivo: "Nome e sobrenome separados.",
    tentar: (sem) =>
      supabase
        .from("patients")
        .insert(sem ? semColuna(linha, NOME_SEPARADO) : linha)
        .select("id, name, phone")
        .single(),
  });
  if (error) throw new Error(error.message);

  // Mesmos efeitos do createPatient, pelos mesmos motivos (ver comentários lá).
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
    const linha = {
      owner_id: context.ownerId,
      unit_id: unitId,
      name: data.name,
      first_name: data.firstName,
      last_name: data.lastName,
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
    };
    // Nome e sobrenome não podem impedir um cadastro: enquanto a migration não
    // roda, `name` sozinho já sustenta tudo que existia antes (ver
    // `schema-fallback`).
    const { data: created, error } = await gravarTolerandoColunaAusente({
      coluna: NOME_SEPARADO,
      exigida: false,
      motivo: "Nome e sobrenome separados.",
      tentar: (sem) =>
        supabase
          .from("patients")
          .insert(sem ? semColuna(linha, NOME_SEPARADO) : linha)
          .select("id")
          .single(),
    });
    if (error) throw new Error(error.message);
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
    const mudancas = {
      name: data.name,
      first_name: data.firstName,
      last_name: data.lastName,
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
    };
    const { error } = await gravarTolerandoColunaAusente({
      coluna: NOME_SEPARADO,
      exigida: false,
      motivo: "Nome e sobrenome separados.",
      tentar: (sem) =>
        supabase
          .from("patients")
          .update(sem ? semColuna(mudancas, NOME_SEPARADO) : mudancas)
          .eq("id", data.id!)
          .eq("owner_id", context.ownerId),
    });
    if (error) throw new Error(error.message);
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
 * Todo paciente com telefone, para "Selecionar contatos" na campanha.
 *
 * ── Por que deixou de filtrar ───────────────────────────────────────────
 *
 * Antes isto trazia só quem NÃO tinha contato no CRM, porque a outra fonte da
 * tela era a lista de contatos do CRM — quem tinha contato lá já vinha por
 * aquele caminho, e trazer de novo era duplicar.
 *
 * A outra fonte agora é o espelho do WhatsApp (`wa_contacts`), e os dois
 * recortes não são o mesmo: existe paciente com `crm_contact_id` preenchido
 * que nunca ganhou linha no espelho. Mantido o filtro, essa gente sumiria da
 * tela de disparo sem nada avisando.
 *
 * Duplicar não é risco: `pessoasUnicas` (`prepararAlvos.ts`) fecha a lista
 * pelo telefone normalizado antes de qualquer seleção, justamente porque um id
 * repetido já virou, uma vez, duas mensagens para a mesma pessoa.
 */
export const getPatientContacts = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<PatientContact[]> => {
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("patients")
      .select("id, name, phone")
      .eq("owner_id", context.ownerId)
      .not("phone", "is", null);
    if (error) throw new Error(error.message);
    return (data ?? [])
      .filter((p: any) => p.phone)
      .map((p: any) => ({ id: p.id, name: p.name ?? "Sem nome", phone: p.phone }));
  });

/**
 * Quais contatos do CRM já viraram ficha de paciente.
 *
 * Só a coluna do vínculo, sem nome nem telefone: o filtro "paciente ou lead" da
 * caixa de entrada precisa responder uma pergunta de sim/não sobre centenas de
 * conversas de uma vez, e é o oposto de `getPatientByCrmContact`, que responde
 * sobre UMA pessoa. Perguntar uma por uma seria uma ida ao servidor por linha
 * da lista.
 */
export const getContatosComPaciente = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<string[]> => {
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("patients")
      .select("crm_contact_id")
      .eq("owner_id", context.ownerId)
      .not("crm_contact_id", "is", null);
    if (error) throw new Error(error.message);
    return (data ?? []).map((p: any) => String(p.crm_contact_id)).filter(Boolean);
  });

/**
 * O contato do CRM: não existe mais.
 *
 * Aqui viviam `pushContactToCrm`, `garantirContatoCrm` e
 * `backfillCrmContactLinks` — três formas de empurrar paciente para a conta do
 * CRM, porque o envio de lá endereçava por id de contato e não por número.
 *
 * As duas primeiras falhavam em silêncio de propósito (o cadastro do paciente
 * nunca podia quebrar por causa disso), e a terceira era um botão de
 * manutenção para vincular a base inteira de uma vez. Nada disso é necessário
 * desde que o envio passou a endereçar pelo telefone.
 *
 * A coluna `patients.crm_contact_id` fica: é por ela que a Meta ainda acha o
 * paciente de uma conversão antiga.
 */

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
      // 10 ou 11 dígitos = falta o país, e ponto. Havia aqui um segundo
      // guarda, `digitos.startsWith("55") → continue`, que era redundante com
      // o teste de comprimento (com o país o número teria 12 ou 13) e ainda
      // por cima nocivo: ele pulava calado todo número de DDD 55 — Santa
      // Maria, Uruguaiana, Santana do Livramento —, que continuava sem
      // entregar sem aparecer em lugar nenhum.
      if (digitos.length !== 10 && digitos.length !== 11) continue;
      const { error: updError } = await supabase
        .from("patients")
        .update({ phone: `55${digitos}`, crm_contact_id: null })
        .eq("id", p.id)
        .eq("owner_id", context.ownerId);
      if (!updError) corrigidos++;
    }
    return { corrigidos };
  });
