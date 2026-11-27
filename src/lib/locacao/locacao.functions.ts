/* eslint-disable @typescript-eslint/no-explicit-any --
   `locacoes` entra em types.ts só quando o Lovable regenerar. */
import { createServerFn } from "@tanstack/react-start";
import { clienteAdmin } from "@/lib/auth/cliente-admin";
import { exigeLocatario } from "@/lib/auth/locatario.middleware";
import { exigeArea } from "@/lib/auth/area.middleware";
import { clinicNowStamp } from "@/lib/date";
import {
  categoriaDaSala,
  horasEntre,
  podeCancelar,
  recusaDoPedido,
  sobrepoe,
  totalDaLocacao,
  VALOR_HORA_PADRAO,
  type CategoriaDaSala,
} from "./regras";

const exigeAgenda = exigeArea("agenda");

export interface SalaParaLocar {
  id: string;
  nome: string;
  categoria: CategoriaDaSala;
}

/** Um bloco de tempo ocupado. Só isto — nunca nome, procedimento ou paciente. */
export interface BlocoOcupado {
  roomId: string;
  inicio: string;
  fim: string;
  /** "mine" = reserva do próprio locatário; "other" = ocupado por outro motivo. */
  de: "mine" | "other";
}

export interface MinhaLocacao {
  id: string;
  roomId: string;
  sala: string;
  inicio: string;
  fim: string;
  status: "pending" | "approved" | "rejected" | "cancelled" | "completed";
  podeCancelar: boolean;
  paciente: string | null;
}

const dia = (s: string) => String(s ?? "").slice(0, 10);

/** Salas da unidade do locatário e preço da hora. */
export const salasDoLocatario = createServerFn({ method: "GET" })
  .middleware([exigeLocatario])
  .handler(
    async ({
      context,
    }): Promise<{ unidade: string; salas: SalaParaLocar[]; valorHora: number }> => {
      const adm = await clienteAdmin();
      const [{ data: salas }, { data: unidade }] = await Promise.all([
        adm
          .from("clinic_chairs")
          .select("id, name")
          .eq("owner_id", context.ownerId)
          .eq("unit_id", context.unitId)
          .eq("active", true)
          .order("name"),
        adm
          .from("clinic_units")
          .select("name, preco_hora_locacao")
          .eq("owner_id", context.ownerId)
          .eq("id", context.unitId)
          .maybeSingle(),
      ]);
      return {
        unidade: String(unidade?.name ?? ""),
        valorHora: Number(unidade?.preco_hora_locacao ?? VALOR_HORA_PADRAO),
        salas: ((salas ?? []) as any[]).map((s) => ({
          id: String(s.id),
          nome: String(s.name ?? "").trim(),
          categoria: categoriaDaSala(s.name),
        })),
      };
    },
  );

/**
 * Quando cada sala está ocupada, entre duas datas. Atendimentos da clínica
 * aparecem como bloco sem identificação: o locatário descobre que a sala está
 * ocupada, e só isso.
 */
export const ocupacaoDasSalas = createServerFn({ method: "GET" })
  .middleware([exigeLocatario])
  .inputValidator((input: { de: string; ate: string }) => {
    const ok = /^\d{4}-\d{2}-\d{2}$/;
    if (!ok.test(String(input?.de)) || !ok.test(String(input?.ate)))
      throw new Error("Período inválido.");
    return { de: input.de, ate: input.ate };
  })
  .handler(async ({ data, context }): Promise<BlocoOcupado[]> => {
    const adm = await clienteAdmin();
    const [{ data: consultas }, { data: locs }] = await Promise.all([
      adm
        .from("appointments")
        .select("room_id, date, start_time, end_time")
        .eq("owner_id", context.ownerId)
        .eq("unit_id", context.unitId)
        .gte("date", data.de)
        .lte("date", data.ate)
        .neq("status", "cancelled")
        .not("room_id", "is", null),
      adm
        .from("locacoes")
        .select("room_id, inicio, fim, tenant_user_id")
        .eq("owner_id", context.ownerId)
        .eq("unit_id", context.unitId)
        .in("status", ["pending", "approved"])
        .gte("inicio", `${data.de}T00:00:00`)
        .lt("inicio", `${data.ate}T23:59:59`),
    ]);
    const blocos: BlocoOcupado[] = [];
    for (const a of (consultas ?? []) as any[]) {
      blocos.push({
        roomId: String(a.room_id),
        inicio: `${a.date}T${String(a.start_time).slice(0, 5)}`,
        fim: `${a.date}T${String(a.end_time).slice(0, 5)}`,
        de: "other",
      });
    }
    for (const l of (locs ?? []) as any[]) {
      blocos.push({
        roomId: String(l.room_id),
        inicio: String(l.inicio).slice(0, 16).replace(" ", "T"),
        fim: String(l.fim).slice(0, 16).replace(" ", "T"),
        de: l.tenant_user_id === context.userId ? "mine" : "other",
      });
    }
    return blocos;
  });

export const pedirLocacao = createServerFn({ method: "POST" })
  .middleware([exigeLocatario])
  .inputValidator(
    (input: {
      roomId: string;
      inicio: string;
      fim: string;
      observacao?: string;
      pacienteId?: string | null;
    }) => ({
      pacienteId: input?.pacienteId ? String(input.pacienteId) : null,
      roomId: String(input?.roomId ?? ""),
      inicio: String(input?.inicio ?? ""),
      fim: String(input?.fim ?? ""),
      observacao: String(input?.observacao ?? "")
        .trim()
        .slice(0, 300),
    }),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const recusa = recusaDoPedido(data.inicio, data.fim, clinicNowStamp());
    if (recusa) throw new Error(recusa);
    const adm = await clienteAdmin();
    // A sala tem de ser da unidade DO LOCATÁRIO — o id vindo da tela não vale
    // por si só.
    const { data: sala } = await adm
      .from("clinic_chairs")
      .select("id")
      .eq("id", data.roomId)
      .eq("owner_id", context.ownerId)
      .eq("unit_id", context.unitId)
      .eq("active", true)
      .maybeSingle();
    if (!sala) throw new Error("Sala não encontrada.");
    // Consulta marcada nessa sala no mesmo horário? (Locação contra locação o
    // próprio banco barra.)
    const { data: consultas } = await adm
      .from("appointments")
      .select("start_time, end_time")
      .eq("owner_id", context.ownerId)
      .eq("room_id", data.roomId)
      .eq("date", dia(data.inicio))
      .neq("status", "cancelled");
    for (const a of (consultas ?? []) as any[]) {
      if (
        sobrepoe(
          { inicio: data.inicio, fim: data.fim },
          {
            inicio: `${dia(data.inicio)}T${String(a.start_time).slice(0, 5)}`,
            fim: `${dia(data.inicio)}T${String(a.end_time).slice(0, 5)}`,
          },
        )
      )
        throw new Error("Esse horário já está ocupado nessa sala.");
    }
    // O paciente, se vier, tem de ser DESTE locatário.
    if (data.pacienteId) {
      const { data: pac } = await adm
        .from("locatario_pacientes")
        .select("id")
        .eq("id", data.pacienteId)
        .eq("owner_id", context.ownerId)
        .eq("tenant_user_id", context.userId)
        .eq("arquivado", false)
        .maybeSingle();
      if (!pac) throw new Error("Paciente não encontrado.");
    }
    const { data: criada, error } = await adm
      .from("locacoes")
      .insert({
        paciente_id: data.pacienteId,
        owner_id: context.ownerId,
        unit_id: context.unitId,
        room_id: data.roomId,
        tenant_user_id: context.userId,
        tenant_nome: context.tenantNome,
        inicio: data.inicio,
        fim: data.fim,
        observacao: data.observacao || null,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23P01") throw new Error("Esse horário já está ocupado nessa sala.");
      throw new Error(error.message);
    }
    return { id: String(criada.id) };
  });

export const minhasLocacoes = createServerFn({ method: "GET" })
  .middleware([exigeLocatario])
  .handler(async ({ context }): Promise<MinhaLocacao[]> => {
    const adm = await clienteAdmin();
    const { data } = await adm
      .from("locacoes")
      .select("id, room_id, inicio, fim, status, clinic_chairs(name), locatario_pacientes(nome)")
      .eq("owner_id", context.ownerId)
      .eq("tenant_user_id", context.userId)
      .order("inicio", { ascending: false })
      .limit(100);
    const agora = clinicNowStamp();
    return ((data ?? []) as any[]).map((l) => {
      const inicio = String(l.inicio).slice(0, 16).replace(" ", "T");
      return {
        id: String(l.id),
        roomId: String(l.room_id),
        sala: String(l.clinic_chairs?.name ?? "").trim(),
        inicio,
        fim: String(l.fim).slice(0, 16).replace(" ", "T"),
        status: l.status,
        paciente: l.locatario_pacientes?.nome ?? null,
        podeCancelar:
          (l.status === "pending" || l.status === "approved") && podeCancelar(inicio, agora),
      };
    });
  });

export const cancelarMinhaLocacao = createServerFn({ method: "POST" })
  .middleware([exigeLocatario])
  .inputValidator((input: { id: string }) => ({ id: String(input?.id ?? "") }))
  .handler(async ({ data, context }) => {
    const adm = await clienteAdmin();
    const { data: l } = await adm
      .from("locacoes")
      .select("id, inicio, status")
      .eq("id", data.id)
      .eq("owner_id", context.ownerId)
      .eq("tenant_user_id", context.userId)
      .maybeSingle();
    if (!l || !["pending", "approved"].includes(l.status))
      throw new Error("Reserva não encontrada.");
    const inicio = String(l.inicio).slice(0, 16).replace(" ", "T");
    if (!podeCancelar(inicio, clinicNowStamp()))
      throw new Error("O cancelamento é possível até 24 horas antes. Fale com a clínica.");
    const { error } = await adm
      .from("locacoes")
      .update({ status: "cancelled" })
      .eq("id", l.id)
      .eq("owner_id", context.ownerId)
      .eq("tenant_user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ── Equipe ───────────────────────────────────────────────────────────────

export interface LocacaoDaEquipe {
  id: string;
  sala: string;
  inicio: string;
  fim: string;
  status: MinhaLocacao["status"];
  locatario: string;
  observacao: string | null;
  horasReais: number | null;
  valorHora: number | null;
  total: number | null;
  valorHoraPadrao: number;
  paciente: string | null;
}

export const listarLocacoes = createServerFn({ method: "GET" })
  .middleware([exigeAgenda])
  .handler(async ({ context }): Promise<LocacaoDaEquipe[]> => {
    const adm = await clienteAdmin();
    let q = adm
      .from("locacoes")
      .select(
        "id, unit_id, inicio, fim, status, tenant_nome, observacao, horas_reais, valor_hora, total, clinic_chairs(name), clinic_units(preco_hora_locacao), locatario_pacientes(nome)",
      )
      .eq("owner_id", context.ownerId)
      .order("inicio", { ascending: false })
      .limit(200);
    // Quem não é administrador só vê a própria unidade.
    if (!context.isAdmin && context.unitId) q = q.eq("unit_id", context.unitId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).map((l) => ({
      id: String(l.id),
      sala: String(l.clinic_chairs?.name ?? "").trim(),
      inicio: String(l.inicio).slice(0, 16).replace(" ", "T"),
      fim: String(l.fim).slice(0, 16).replace(" ", "T"),
      status: l.status,
      locatario: String(l.tenant_nome ?? ""),
      observacao: l.observacao ?? null,
      horasReais: l.horas_reais == null ? null : Number(l.horas_reais),
      valorHora: l.valor_hora == null ? null : Number(l.valor_hora),
      total: l.total == null ? null : Number(l.total),
      valorHoraPadrao: Number(l.clinic_units?.preco_hora_locacao ?? VALOR_HORA_PADRAO),
      paciente: l.locatario_pacientes?.nome ?? null,
    }));
  });

async function locacaoDaClinica(adm: any, context: any, id: string) {
  let q = adm.from("locacoes").select("*").eq("id", id).eq("owner_id", context.ownerId);
  if (!context.isAdmin && context.unitId) q = q.eq("unit_id", context.unitId);
  const { data } = await q.maybeSingle();
  if (!data) throw new Error("Locação não encontrada.");
  return data as any;
}

export const decidirLocacao = createServerFn({ method: "POST" })
  .middleware([exigeAgenda])
  .inputValidator((input: { id: string; aprovar: boolean }) => ({
    id: String(input?.id ?? ""),
    aprovar: !!input?.aprovar,
  }))
  .handler(async ({ data, context }) => {
    const adm = await clienteAdmin();
    const l = await locacaoDaClinica(adm, context, data.id);
    if (l.status !== "pending") throw new Error("Esta reserva já foi decidida.");
    const { error } = await adm
      .from("locacoes")
      .update({
        status: data.aprovar ? "approved" : "rejected",
        decidido_em: new Date().toISOString(),
        decidido_por: context.userId,
      })
      .eq("id", l.id)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * Confirma que a locação aconteceu: grava as horas realmente usadas e o valor
 * da hora pago, e lança a receita "Locação" no financeiro — paga, sem
 * paciente, sem evento para a Meta. Mesmo gesto de confirmar um atendimento.
 */
export const concluirLocacao = createServerFn({ method: "POST" })
  .middleware([exigeAgenda])
  .inputValidator((input: { id: string; horasReais: number; valorHora: number }) => {
    const horas = Number(input?.horasReais);
    const valor = Number(input?.valorHora);
    if (!(horas > 0) || horas > 24) throw new Error("Informe as horas que foram usadas.");
    if (!(valor >= 0)) throw new Error("Informe o valor da hora.");
    return { id: String(input.id ?? ""), horasReais: horas, valorHora: valor };
  })
  .handler(async ({ data, context }) => {
    const adm = await clienteAdmin();
    const l = await locacaoDaClinica(adm, context, data.id);
    if (l.status === "completed") throw new Error("Esta locação já foi confirmada.");
    if (l.status !== "approved") throw new Error("Só dá para confirmar uma locação aprovada.");
    const total = totalDaLocacao(data.horasReais, data.valorHora);

    // Categoria "Locação" (receita), criada na primeira vez.
    let { data: cat } = await adm
      .from("financial_categories")
      .select("id")
      .eq("owner_id", context.ownerId)
      .eq("type", "income")
      .eq("name", "Locação")
      .maybeSingle();
    if (!cat) {
      const { data: nova, error: ec } = await adm
        .from("financial_categories")
        .insert({ owner_id: context.ownerId, name: "Locação", type: "income" })
        .select("id")
        .single();
      if (ec) throw new Error(ec.message);
      cat = nova;
    }
    const hoje = clinicNowStamp().slice(0, 10);
    let transactionId: string | null = l.transaction_id ?? null;
    if (!transactionId && total > 0) {
      const { data: tx, error: et } = await adm
        .from("financial_transactions")
        .insert({
          owner_id: context.ownerId,
          unit_id: l.unit_id,
          type: "receivable",
          status: "paid",
          description: `Locação · ${l.tenant_nome || "Locatário"} · ${horasEntre(l.inicio.slice(0, 16).replace(" ", "T"), l.fim.slice(0, 16).replace(" ", "T"))}h reservadas, ${data.horasReais}h usadas`,
          amount: total,
          due_date: hoje,
          paid_date: hoje,
          patient_id: null,
          category_id: cat.id,
          source_type: "locacao",
          source_id: String(l.id),
        })
        .select("id")
        .single();
      if (et) throw new Error(et.message);
      transactionId = String(tx.id);
    }
    const { error } = await adm
      .from("locacoes")
      .update({
        status: "completed",
        horas_reais: data.horasReais,
        valor_hora: data.valorHora,
        total,
        transaction_id: transactionId,
        concluido_em: new Date().toISOString(),
      })
      .eq("id", l.id)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true as const, total };
  });

export const cancelarLocacaoDaEquipe = createServerFn({ method: "POST" })
  .middleware([exigeAgenda])
  .inputValidator((input: { id: string }) => ({ id: String(input?.id ?? "") }))
  .handler(async ({ data, context }) => {
    const adm = await clienteAdmin();
    const l = await locacaoDaClinica(adm, context, data.id);
    if (!["pending", "approved"].includes(l.status))
      throw new Error("Esta locação não pode mais ser cancelada.");
    const { error } = await adm
      .from("locacoes")
      .update({ status: "cancelled" })
      .eq("id", l.id)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ── Pacientes do locatário ───────────────────────────────────────────────

export interface PacienteDoLocatario {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  nascimento: string | null;
  observacao: string | null;
}

const limpa = (v: unknown, max: number) => {
  const t = String(v ?? "")
    .trim()
    .slice(0, max);
  return t || null;
};

/** Só os pacientes DESTE locatário: o filtro é pelo login dele, nunca pelo que
 *  veio da tela. */
export const listarMeusPacientes = createServerFn({ method: "GET" })
  .middleware([exigeLocatario])
  .handler(async ({ context }): Promise<PacienteDoLocatario[]> => {
    const adm = await clienteAdmin();
    const { data, error } = await adm
      .from("locatario_pacientes")
      .select("id, nome, telefone, email, nascimento, observacao")
      .eq("owner_id", context.ownerId)
      .eq("tenant_user_id", context.userId)
      .eq("arquivado", false)
      .order("nome")
      .limit(1000);
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).map((p) => ({
      id: String(p.id),
      nome: String(p.nome),
      telefone: p.telefone ?? null,
      email: p.email ?? null,
      nascimento: p.nascimento ?? null,
      observacao: p.observacao ?? null,
    }));
  });

const validaPaciente = (input: {
  id?: string;
  nome: string;
  telefone?: string | null;
  email?: string | null;
  nascimento?: string | null;
  observacao?: string | null;
}) => {
  const nome = limpa(input?.nome, 120);
  if (!nome) throw new Error("Informe o nome do paciente.");
  const nasc = limpa(input?.nascimento, 10);
  if (nasc && !/^\d{4}-\d{2}-\d{2}$/.test(nasc)) throw new Error("Data de nascimento inválida.");
  return {
    id: input?.id ? String(input.id) : null,
    nome,
    telefone: limpa(input?.telefone, 30),
    email: limpa(input?.email, 120),
    nascimento: nasc,
    observacao: limpa(input?.observacao, 500),
  };
};

export const salvarMeuPaciente = createServerFn({ method: "POST" })
  .middleware([exigeLocatario])
  .inputValidator(validaPaciente)
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const adm = await clienteAdmin();
    const campos = {
      nome: data.nome,
      telefone: data.telefone,
      email: data.email,
      nascimento: data.nascimento,
      observacao: data.observacao,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await adm
        .from("locatario_pacientes")
        .update(campos)
        .eq("id", data.id)
        .eq("owner_id", context.ownerId)
        .eq("tenant_user_id", context.userId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: criado, error } = await adm
      .from("locatario_pacientes")
      .insert({
        ...campos,
        owner_id: context.ownerId,
        unit_id: context.unitId,
        tenant_user_id: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: String(criado.id) };
  });

export const arquivarMeuPaciente = createServerFn({ method: "POST" })
  .middleware([exigeLocatario])
  .inputValidator((input: { id: string }) => ({ id: String(input?.id ?? "") }))
  .handler(async ({ data, context }) => {
    const adm = await clienteAdmin();
    const { error } = await adm
      .from("locatario_pacientes")
      .update({ arquivado: true, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("owner_id", context.ownerId)
      .eq("tenant_user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ── A clínica vê os pacientes dos locatários ─────────────────────────────

export interface PacienteDeLocatarioParaEquipe extends PacienteDoLocatario {
  locatario: string;
  /** Mesmo telefone de um paciente da clínica: provável mesma pessoa. */
  tambemDaClinica: boolean;
}

const soDigitos = (t: string | null | undefined) => String(t ?? "").replace(/\D/g, "");

export const listarPacientesDosLocatarios = createServerFn({ method: "GET" })
  .middleware([exigeAgenda])
  .handler(async ({ context }): Promise<PacienteDeLocatarioParaEquipe[]> => {
    const adm = await clienteAdmin();
    let q = adm
      .from("locatario_pacientes")
      .select("id, unit_id, tenant_user_id, nome, telefone, email, nascimento, observacao")
      .eq("owner_id", context.ownerId)
      .eq("arquivado", false)
      .order("nome")
      .limit(1000);
    if (!context.isAdmin && context.unitId) q = q.eq("unit_id", context.unitId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const linhas = (data ?? []) as any[];
    if (linhas.length === 0) return [];

    // Quem é o locatário de cada um.
    const ids = [...new Set(linhas.map((l) => l.tenant_user_id))];
    const { data: membros } = await adm
      .from("clinic_members")
      .select("user_id, name")
      .eq("owner_id", context.ownerId)
      .in("user_id", ids);
    const nomeDe = new Map<string, string>(
      ((membros ?? []) as any[]).map((m) => [String(m.user_id), String(m.name ?? "")]),
    );

    // Provável mesma pessoa: telefone igual ao de um paciente da clínica.
    const fones = new Set(
      linhas.map((l) => soDigitos(l.telefone).slice(-8)).filter((f) => f.length === 8),
    );
    const iguais = new Set<string>();
    if (fones.size > 0) {
      const { data: pac } = await adm
        .from("patients")
        .select("phone")
        .eq("owner_id", context.ownerId)
        .not("phone", "is", null)
        .limit(20000);
      for (const p of (pac ?? []) as any[]) {
        const f = soDigitos(p.phone).slice(-8);
        if (fones.has(f)) iguais.add(f);
      }
    }
    return linhas.map((l) => ({
      id: String(l.id),
      nome: String(l.nome),
      telefone: l.telefone ?? null,
      email: l.email ?? null,
      nascimento: l.nascimento ?? null,
      observacao: l.observacao ?? null,
      locatario: nomeDe.get(String(l.tenant_user_id)) || "Locatário",
      tambemDaClinica: iguais.has(soDigitos(l.telefone).slice(-8)),
    }));
  });
