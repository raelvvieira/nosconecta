/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { exigeAgenteIa } from "@/lib/auth/area.middleware";
import { localDateStr } from "@/lib/date";
import { variantesDoNumero } from "@/lib/atendimentos/phone";
import {
  CONFIG_PADRAO,
  bloqueiosDaCobranca,
  configDoModulo,
  diaCurto,
  diaDaSemana,
  edicaoVigente,
  horariosDaPratica,
  vagasRestantes,
  avisoDaChavePix,
  type ConfigDoModulo,
  type EdicaoDoModulo,
  type EstadoDoModulo as EstadoLigado,
  type StatusDaEdicao,
} from "../../../supabase/functions/_shared/modulo-paciente-modelo.ts";

// Os módulos da Luna, do lado da tela: o que está ligado, as edições com
// práticas e ofertas, as reservas e a confirmação do sinal. A regra de como
// isso entra na instrução mora em `_shared/modulo-paciente-modelo.ts`.

export type Modulo = "paciente_modelo" | "mentoria";
export const MODULOS: { id: Modulo; nome: string; resumo: string }[] = [
  {
    id: "paciente_modelo",
    nome: "Paciente Modelo HOF",
    resumo: "Captação, venda e reserva de vagas",
  },
  {
    id: "mentoria",
    nome: "Mentoria para Profissionais",
    resumo: "Informações do curso e matrículas",
  },
];

export { CONFIG_PADRAO, avisoDaChavePix, horariosDaPratica };
export type { ConfigDoModulo, EdicaoDoModulo, StatusDaEdicao, EstadoLigado };

export const STATUS_DA_EDICAO: { id: StatusDaEdicao; rotulo: string }[] = [
  { id: "rascunho", rotulo: "Rascunho" },
  { id: "publicada", rotulo: "Publicada (sem reservas)" },
  { id: "inscricoes_abertas", rotulo: "Inscrições abertas" },
  { id: "esgotada", rotulo: "Vagas esgotadas" },
  { id: "encerrada", rotulo: "Encerrada" },
  { id: "cancelada", rotulo: "Cancelada" },
];

export type StatusDaReserva =
  | "interesse"
  | "dia_escolhido"
  | "sinal_pendente"
  | "pagamento_em_analise"
  | "confirmada"
  | "cancelada"
  | "compareceu"
  | "faltou";
export const STATUS_DA_RESERVA: { id: StatusDaReserva; rotulo: string }[] = [
  { id: "interesse", rotulo: "Interesse" },
  { id: "dia_escolhido", rotulo: "Dia escolhido" },
  { id: "sinal_pendente", rotulo: "Sinal pendente" },
  { id: "pagamento_em_analise", rotulo: "Pagamento em análise" },
  { id: "confirmada", rotulo: "Confirmada" },
  { id: "compareceu", rotulo: "Compareceu" },
  { id: "faltou", rotulo: "Faltou" },
  { id: "cancelada", rotulo: "Cancelada" },
];

function ausente(error: any): boolean {
  return (
    !!error && (error.code === "42P01" || /does not exist/i.test(String(error?.message ?? "")))
  );
}

async function agenteDaClinica(supabase: any, ownerId: string): Promise<{ id: string }> {
  const { data } = await supabase
    .from("ai_agents")
    .select("id")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!data) throw new Error("O agente ainda não existe. Abra a página do agente uma vez.");
  return { id: String(data.id) };
}

// ── O estado dos módulos ───────────────────────────────────────────────────

export interface EstadoDoModulo {
  modulo: Modulo;
  estado: EstadoLigado;
  config: ConfigDoModulo;
  manual: string;
  manualVersao: string;
  manualEm: string | null;
  /** O que falta para a Luna poder mandar a cobrança. */
  bloqueios: string[];
}

export interface EstadoDosModulos {
  /** `true` enquanto a migration não foi aplicada. */
  indisponivel: boolean;
  modulos: EstadoDoModulo[];
  /** A edição aberta hoje, para o cartão. */
  edicaoAberta: {
    id: string;
    nome: string;
    cidade: string | null;
    dias: string[];
    vagasRestantes: number;
  } | null;
  proximaEdicao: { id: string; nome: string; inicio: string | null } | null;
  /** Duas edições vendendo ao mesmo tempo: a venda automática fica bloqueada. */
  conflito: string[];
  sinaisPendentes: number;
  emAnalise: number;
  confirmadas: number;
}

export const getModulos = createServerFn({ method: "GET" })
  .middleware([exigeAgenteIa])
  .handler(async ({ context }): Promise<EstadoDosModulos> => {
    const supabase: any = context.supabase;
    const vazio: EstadoDosModulos = {
      indisponivel: false,
      modulos: MODULOS.map((m) => ({
        modulo: m.id,
        estado: "desligado" as const,
        config: configDoModulo({}),
        manual: "",
        manualVersao: "",
        manualEm: null,
        bloqueios: bloqueiosDaCobranca(configDoModulo({})),
      })),
      edicaoAberta: null,
      proximaEdicao: null,
      conflito: [],
      sinaisPendentes: 0,
      emAnalise: 0,
      confirmadas: 0,
    };
    const { data: mods, error } = await supabase
      .from("agente_modulos")
      .select("modulo, estado, config, manual, manual_versao, manual_em")
      .eq("owner_id", context.ownerId);
    if (error) {
      if (ausente(error)) return { ...vazio, indisponivel: true };
      throw new Error(error.message);
    }
    const modulos = MODULOS.map((m) => {
      const l = (mods ?? []).find((x: any) => x.modulo === m.id);
      const config = configDoModulo(l?.config);
      return {
        modulo: m.id,
        estado: (l?.estado === "ligado" || l?.estado === "teste"
          ? l.estado
          : "desligado") as EstadoLigado,
        config,
        manual: String(l?.manual ?? ""),
        manualVersao: String(l?.manual_versao ?? ""),
        manualEm: l?.manual_em ?? null,
        bloqueios: bloqueiosDaCobranca(config),
      };
    });
    const edicoes = await lerEdicoes(supabase, context.ownerId);
    const hoje = localDateStr();
    const vigente = edicaoVigente(edicoes, hoje);
    const aberta = vigente.aberta;
    const proxima = vigente.publicada;
    const { data: reservas } = await supabase
      .from("mentoria_reservas")
      .select("status")
      .eq("owner_id", context.ownerId)
      .in("status", ["sinal_pendente", "pagamento_em_analise", "confirmada"]);
    return {
      indisponivel: false,
      modulos,
      edicaoAberta: aberta
        ? {
            id: aberta.id,
            nome: aberta.nome,
            cidade: aberta.cidade,
            dias: aberta.praticas.map((p) => p.data),
            vagasRestantes: aberta.praticas.reduce((s, p) => s + vagasRestantes(p), 0),
          }
        : null,
      proximaEdicao: proxima
        ? { id: proxima.id, nome: proxima.nome, inicio: proxima.inicio }
        : null,
      conflito: vigente.conflito.map((e) => e.nome),
      sinaisPendentes: (reservas ?? []).filter((r: any) => r.status === "sinal_pendente").length,
      emAnalise: (reservas ?? []).filter((r: any) => r.status === "pagamento_em_analise").length,
      confirmadas: (reservas ?? []).filter((r: any) => r.status === "confirmada").length,
    };
  });

export const ligarModulo = createServerFn({ method: "POST" })
  .middleware([exigeAgenteIa])
  .inputValidator((input: { modulo: Modulo; estado: EstadoLigado }) => {
    if (!MODULOS.some((m) => m.id === input.modulo)) throw new Error("Módulo inválido.");
    if (!["desligado", "teste", "ligado"].includes(input.estado))
      throw new Error("Estado inválido.");
    return { modulo: input.modulo, estado: input.estado };
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const supabase: any = context.supabase;
    const agente = await agenteDaClinica(supabase, context.ownerId);
    const { error } = await supabase.from("agente_modulos").upsert(
      {
        owner_id: context.ownerId,
        agent_id: agente.id,
        modulo: data.modulo,
        estado: data.estado,
        ativo: data.estado === "ligado",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "agent_id,modulo" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const salvarConfigDoModulo = createServerFn({ method: "POST" })
  .middleware([exigeAgenteIa])
  .inputValidator(
    (input: { modulo: Modulo; config?: unknown; manual?: string; manualVersao?: string }) => {
      if (!MODULOS.some((m) => m.id === input.modulo)) throw new Error("Módulo inválido.");
      return {
        modulo: input.modulo,
        config: input.config === undefined ? undefined : configDoModulo(input.config),
        // A MD especializada inteira cabe: as seções de comportamento passam de 70 mil
        // caracteres.
        manual:
          input.manual === undefined ? undefined : String(input.manual).trim().slice(0, 200_000),
        manualVersao: input.manualVersao?.trim().slice(0, 40),
      };
    },
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const supabase: any = context.supabase;
    const agente = await agenteDaClinica(supabase, context.ownerId);
    const campos: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.config !== undefined) campos.config = data.config;
    if (data.manual !== undefined) {
      campos.manual = data.manual || null;
      campos.manual_em = new Date().toISOString();
      if (data.manualVersao !== undefined) campos.manual_versao = data.manualVersao || null;
    }
    const { error } = await supabase
      .from("agente_modulos")
      .upsert(
        { owner_id: context.ownerId, agent_id: agente.id, modulo: data.modulo, ...campos },
        { onConflict: "agent_id,modulo" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── As edições ─────────────────────────────────────────────────────────────

async function lerEdicoes(supabase: any, ownerId: string): Promise<EdicaoDoModulo[]> {
  const { data: edicoes, error } = await supabase
    .from("mentoria_edicoes")
    .select(
      "id, nome, cidade, endereco, inicio, fim, status, observacoes, orientacoes_chegada, unit_id",
    )
    .eq("owner_id", ownerId)
    .order("inicio", { ascending: false, nullsFirst: false });
  if (error) {
    if (ausente(error)) return [];
    throw new Error(error.message);
  }
  const ids = (edicoes ?? []).map((e: any) => String(e.id));
  if (!ids.length) return [];
  const [{ data: praticas }, { data: ofertas }, { data: reservas }] = await Promise.all([
    supabase.from("mentoria_praticas").select("*").in("edicao_id", ids).order("data"),
    supabase.from("mentoria_ofertas").select("*").in("edicao_id", ids).order("ordem"),
    supabase
      .from("mentoria_reservas")
      .select("pratica_id, hora, status")
      .in("edicao_id", ids)
      .in("status", ["sinal_pendente", "pagamento_em_analise", "confirmada"]),
  ]);
  const ocupadas = new Map<string, Record<string, number>>();
  for (const r of reservas ?? []) {
    if (!r.pratica_id) continue;
    const mapa = ocupadas.get(String(r.pratica_id)) ?? {};
    const hora = r.hora ? String(r.hora).slice(0, 5) : "";
    mapa[hora] = (mapa[hora] ?? 0) + 1;
    ocupadas.set(String(r.pratica_id), mapa);
  }
  return (edicoes ?? []).map((e: any) => ({
    id: String(e.id),
    nome: String(e.nome ?? ""),
    cidade: e.cidade ?? null,
    endereco: e.endereco ?? null,
    inicio: e.inicio ?? null,
    fim: e.fim ?? null,
    status: e.status as StatusDaEdicao,
    observacoes: e.observacoes ?? null,
    orientacoesChegada: e.orientacoes_chegada ?? null,
    unitId: e.unit_id ? String(e.unit_id) : null,
    praticas: (praticas ?? [])
      .filter((p: any) => String(p.edicao_id) === String(e.id))
      .map((p: any) => ({
        id: String(p.id),
        data: String(p.data),
        horaInicio: p.hora_inicio ? String(p.hora_inicio).slice(0, 5) : null,
        horaFim: p.hora_fim ? String(p.hora_fim).slice(0, 5) : null,
        duracaoMin: Number(p.duracao_min ?? 60),
        vagas: Number(p.vagas ?? 0),
        ocupadas: ocupadas.get(String(p.id)) ?? {},
        observacao: p.observacao ?? null,
      })),
    ofertas: (ofertas ?? [])
      .filter((o: any) => String(o.edicao_id) === String(e.id) && o.ativo !== false)
      .map((o: any) => ({
        id: String(o.id),
        nome: String(o.nome ?? ""),
        descricao: o.descricao ?? null,
        ml: o.ml === null ? null : Number(o.ml),
        precoVista: Number(o.preco_vista ?? 0),
        precoParcelado: o.preco_parcelado === null ? null : Number(o.preco_parcelado),
        parcelasMax: o.parcelas_max ?? null,
        tipo: o.tipo === "combo" ? "combo" : "procedimento",
        destaque: o.destaque === true,
      })),
  })) as EdicaoDoModulo[];
}

export type EdicaoDaTela = EdicaoDoModulo & { unitId: string | null };

export const getEdicoes = createServerFn({ method: "GET" })
  .middleware([exigeAgenteIa])
  .handler(async ({ context }): Promise<EdicaoDaTela[]> => {
    return (await lerEdicoes(context.supabase, context.ownerId)) as EdicaoDaTela[];
  });

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^\d{2}:\d{2}$/;

export const salvarEdicao = createServerFn({ method: "POST" })
  .middleware([exigeAgenteIa])
  .inputValidator(
    (input: {
      id?: string | null;
      nome: string;
      cidade?: string | null;
      unitId?: string | null;
      endereco?: string | null;
      inicio?: string | null;
      fim?: string | null;
      status: StatusDaEdicao;
      observacoes?: string | null;
      orientacoesChegada?: string | null;
      praticas: {
        id?: string | null;
        data: string;
        horaInicio?: string | null;
        horaFim?: string | null;
        duracaoMin?: number;
        vagas: number;
        observacao?: string | null;
      }[];
    }) => {
      if (!input.nome?.trim()) throw new Error("Dê um nome à edição.");
      if (!STATUS_DA_EDICAO.some((s) => s.id === input.status)) throw new Error("Status inválido.");
      for (const d of [input.inicio, input.fim])
        if (d && !DIA.test(d)) throw new Error("Data inválida.");
      const praticas = (input.praticas ?? []).map((p) => {
        if (!DIA.test(p.data)) throw new Error("Dia de prática inválido.");
        if (p.horaInicio && !HORA.test(p.horaInicio)) throw new Error("Hora inválida.");
        if (p.horaFim && !HORA.test(p.horaFim)) throw new Error("Hora inválida.");
        return {
          id: p.id || null,
          data: p.data,
          horaInicio: p.horaInicio || null,
          horaFim: p.horaFim || null,
          duracaoMin: Math.min(480, Math.max(10, Math.trunc(Number(p.duracaoMin) || 60))),
          vagas: Math.max(0, Math.trunc(Number(p.vagas) || 0)),
          observacao: p.observacao?.trim() || null,
        };
      });
      return {
        id: input.id || null,
        nome: input.nome.trim().slice(0, 120),
        cidade: input.cidade?.trim() || null,
        unitId: input.unitId || null,
        endereco: input.endereco?.trim() || null,
        inicio: input.inicio || null,
        fim: input.fim || null,
        status: input.status,
        observacoes: input.observacoes?.trim() || null,
        orientacoesChegada: input.orientacoesChegada?.trim() || null,
        praticas,
      };
    },
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const supabase: any = context.supabase;
    const linha = {
      owner_id: context.ownerId,
      nome: data.nome,
      cidade: data.cidade,
      unit_id: data.unitId,
      endereco: data.endereco,
      inicio: data.inicio,
      fim: data.fim,
      status: data.status,
      observacoes: data.observacoes,
      orientacoes_chegada: data.orientacoesChegada,
      updated_at: new Date().toISOString(),
    };
    let id = data.id;
    if (id) {
      const { error } = await supabase
        .from("mentoria_edicoes")
        .update(linha)
        .eq("id", id)
        .eq("owner_id", context.ownerId);
      if (error) throw new Error(error.message);
    } else {
      const { data: nova, error } = await supabase
        .from("mentoria_edicoes")
        .insert(linha)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      id = String(nova.id);
    }

    // As práticas: o conjunto enviado é o conjunto que fica. Dia com reserva
    // viva não some: a tela impede, e aqui a trava é o banco (SET NULL).
    const { data: atuais } = await supabase
      .from("mentoria_praticas")
      .select("id")
      .eq("edicao_id", id);
    const manter = new Set(data.praticas.map((p) => p.id).filter(Boolean));
    const apagar = (atuais ?? [])
      .map((p: any) => String(p.id))
      .filter((x: string) => !manter.has(x));
    if (apagar.length) await supabase.from("mentoria_praticas").delete().in("id", apagar);
    for (const p of data.praticas) {
      const campos = {
        owner_id: context.ownerId,
        edicao_id: id,
        data: p.data,
        hora_inicio: p.horaInicio,
        hora_fim: p.horaFim,
        duracao_min: p.duracaoMin,
        vagas: p.vagas,
        observacao: p.observacao,
      };
      const { error } = p.id
        ? await supabase.from("mentoria_praticas").update(campos).eq("id", p.id)
        : await supabase.from("mentoria_praticas").insert(campos);
      if (error) throw new Error(error.message);
    }
    return { id };
  });

export const excluirEdicao = createServerFn({ method: "POST" })
  .middleware([exigeAgenteIa])
  .inputValidator((input: { id: string }) => {
    if (!input.id) throw new Error("Edição inválida.");
    return input;
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const supabase: any = context.supabase;
    const { count } = await supabase
      .from("mentoria_reservas")
      .select("id", { count: "exact", head: true })
      .eq("edicao_id", data.id)
      .in("status", ["sinal_pendente", "confirmada", "compareceu"]);
    if ((count ?? 0) > 0) throw new Error("Esta edição tem reservas. Encerre-a em vez de excluir.");
    const { error } = await supabase
      .from("mentoria_edicoes")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const salvarOfertas = createServerFn({ method: "POST" })
  .middleware([exigeAgenteIa])
  .inputValidator(
    (input: {
      edicaoId: string;
      ofertas: {
        id?: string | null;
        nome: string;
        descricao?: string | null;
        ml?: number | null;
        precoVista: number;
        precoParcelado?: number | null;
        parcelasMax?: number | null;
        tipo: "procedimento" | "combo";
        destaque?: boolean;
      }[];
    }) => {
      if (!input.edicaoId) throw new Error("Edição inválida.");
      const ofertas = (input.ofertas ?? []).map((o, i) => {
        if (!o.nome?.trim()) throw new Error("Toda oferta precisa de nome.");
        if (!(Number(o.precoVista) > 0)) throw new Error(`"${o.nome}" precisa de valor à vista.`);
        return {
          id: o.id || null,
          nome: o.nome.trim().slice(0, 120),
          descricao: o.descricao?.trim() || null,
          ml: o.ml === null || o.ml === undefined || o.ml === ("" as unknown) ? null : Number(o.ml),
          precoVista: Number(o.precoVista),
          precoParcelado: o.precoParcelado ? Number(o.precoParcelado) : null,
          parcelasMax: o.parcelasMax ? Math.trunc(Number(o.parcelasMax)) : null,
          tipo: o.tipo === "combo" ? "combo" : "procedimento",
          destaque: o.destaque === true,
          ordem: i + 1,
        };
      });
      return { edicaoId: input.edicaoId, ofertas };
    },
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const supabase: any = context.supabase;
    const { data: atuais } = await supabase
      .from("mentoria_ofertas")
      .select("id")
      .eq("edicao_id", data.edicaoId);
    const manter = new Set(data.ofertas.map((o) => o.id).filter(Boolean));
    const sumiram = (atuais ?? [])
      .map((o: any) => String(o.id))
      .filter((x: string) => !manter.has(x));
    // Oferta com reserva apontando para ela não é apagada: é desativada.
    if (sumiram.length)
      await supabase.from("mentoria_ofertas").update({ ativo: false }).in("id", sumiram);
    for (const o of data.ofertas) {
      const campos = {
        owner_id: context.ownerId,
        edicao_id: data.edicaoId,
        nome: o.nome,
        descricao: o.descricao,
        ml: o.ml,
        preco_vista: o.precoVista,
        preco_parcelado: o.precoParcelado,
        parcelas_max: o.parcelasMax,
        tipo: o.tipo,
        destaque: o.destaque,
        ordem: o.ordem,
        ativo: true,
      };
      const { error } = o.id
        ? await supabase.from("mentoria_ofertas").update(campos).eq("id", o.id)
        : await supabase.from("mentoria_ofertas").insert(campos);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/** Copia ofertas e observações de uma edição para uma nova, em rascunho. */
export const duplicarEdicao = createServerFn({ method: "POST" })
  .middleware([exigeAgenteIa])
  .inputValidator((input: { id: string }) => {
    if (!input.id) throw new Error("Edição inválida.");
    return input;
  })
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const supabase: any = context.supabase;
    const origem = (await lerEdicoes(supabase, context.ownerId)).find((e) => e.id === data.id) as
      | EdicaoDaTela
      | undefined;
    if (!origem) throw new Error("Edição não encontrada.");
    const { data: nova, error } = await supabase
      .from("mentoria_edicoes")
      .insert({
        owner_id: context.ownerId,
        nome: `${origem.nome} (cópia)`,
        cidade: origem.cidade,
        unit_id: origem.unitId,
        endereco: origem.endereco,
        status: "rascunho",
        observacoes: origem.observacoes,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    if (origem.ofertas.length) {
      const { error: e2 } = await supabase.from("mentoria_ofertas").insert(
        origem.ofertas.map((o, i) => ({
          owner_id: context.ownerId,
          edicao_id: nova.id,
          nome: o.nome,
          descricao: o.descricao,
          ml: o.ml,
          preco_vista: o.precoVista,
          preco_parcelado: o.precoParcelado,
          parcelas_max: o.parcelasMax,
          tipo: o.tipo,
          destaque: o.destaque,
          ordem: i + 1,
        })),
      );
      if (e2) throw new Error(e2.message);
    }
    return { id: String(nova.id) };
  });

// ── As reservas ────────────────────────────────────────────────────────────

export interface ReservaDaTela {
  id: string;
  edicaoId: string;
  edicaoNome: string;
  fone: string;
  crmContactId: string | null;
  conversationId: string | null;
  nome: string;
  status: StatusDaReserva;
  dia: string | null;
  /** "HH:MM" do atendimento escolhido. */
  hora: string | null;
  pagamentoInformadoEm: string | null;
  oferta: string | null;
  ofertaValor: number | null;
  sinalValor: number | null;
  sinalPagoEm: string | null;
  appointmentId: string | null;
  criadoPor: "luna" | "equipe";
  criadoEm: string;
  atualizadoEm: string;
}

export const getReservas = createServerFn({ method: "GET" })
  .middleware([exigeAgenteIa])
  .handler(async ({ context }): Promise<ReservaDaTela[]> => {
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("mentoria_reservas")
      .select(
        "id, edicao_id, fone, crm_contact_id, conversation_id, nome_completo, status, hora, pagamento_informado_em, sinal_valor, sinal_pago_em, appointment_id, criado_por, created_at, updated_at, mentoria_edicoes(nome), mentoria_praticas(data), mentoria_ofertas(nome, preco_vista)",
      )
      .eq("owner_id", context.ownerId)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) {
      if (ausente(error)) return [];
      throw new Error(error.message);
    }
    return (data ?? []).map((r: any) => ({
      id: String(r.id),
      edicaoId: String(r.edicao_id),
      edicaoNome: String(r.mentoria_edicoes?.nome ?? ""),
      fone: String(r.fone ?? ""),
      crmContactId: r.crm_contact_id ?? null,
      conversationId: r.conversation_id ?? null,
      nome: String(r.nome_completo ?? ""),
      status: r.status as StatusDaReserva,
      dia: r.mentoria_praticas?.data ?? null,
      hora: r.hora ? String(r.hora).slice(0, 5) : null,
      pagamentoInformadoEm: r.pagamento_informado_em ?? null,
      oferta: r.mentoria_ofertas?.nome ?? null,
      ofertaValor:
        r.mentoria_ofertas?.preco_vista === undefined || r.mentoria_ofertas?.preco_vista === null
          ? null
          : Number(r.mentoria_ofertas.preco_vista),
      sinalValor: r.sinal_valor === null ? null : Number(r.sinal_valor),
      sinalPagoEm: r.sinal_pago_em ?? null,
      appointmentId: r.appointment_id ?? null,
      criadoPor: r.criado_por === "equipe" ? "equipe" : "luna",
      criadoEm: String(r.created_at),
      atualizadoEm: String(r.updated_at),
    }));
  });

/** Soma minutos a "HH:MM". */
function somar(hora: string, minutos: number): string {
  const [h, m] = hora.split(":").map(Number);
  const t = (h * 60 + m + minutos) % (24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/**
 * Confirmar o sinal: a reserva vira confirmada, ganha um horário na Agenda
 * no dia da prática e um recebimento pago no Financeiro. Quem clica viu o
 * comprovante; o sistema não vê a conta Pix.
 */
export const confirmarSinal = createServerFn({ method: "POST" })
  .middleware([exigeAgenteIa])
  .inputValidator((input: { reservaId: string; avisar?: boolean }) => {
    if (!input.reservaId) throw new Error("Reserva inválida.");
    return { reservaId: input.reservaId, avisar: input.avisar !== false };
  })
  .handler(async ({ data, context }): Promise<{ ok: true; avisou: boolean }> => {
    const supabase: any = context.supabase;
    const { data: r, error } = await supabase
      .from("mentoria_reservas")
      .select(
        "*, mentoria_edicoes(nome, unit_id, endereco, orientacoes_chegada, clinic_units(address)), mentoria_praticas(data, hora_inicio, hora_fim, duracao_min), mentoria_ofertas(nome, preco_vista)",
      )
      .eq("id", data.reservaId)
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!r) throw new Error("Reserva não encontrada.");
    if (r.status === "confirmada") return { ok: true, avisou: false };
    if (!r.mentoria_praticas?.data) throw new Error("Escolha o dia da prática antes de confirmar.");

    const hoje = localDateStr();
    const nome = String(r.nome_completo ?? "").trim() || "Paciente modelo";

    // A unidade: a da edição, ou a principal.
    let unitId = r.mentoria_edicoes?.unit_id ? String(r.mentoria_edicoes.unit_id) : null;
    if (!unitId) {
      const { data: u } = await supabase
        .from("clinic_units")
        .select("id")
        .eq("owner_id", context.ownerId)
        .eq("active", true)
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle();
      unitId = u?.id ? String(u.id) : null;
    }
    if (!unitId) throw new Error("Cadastre uma unidade antes de confirmar.");

    // A ficha, pelo telefone (as mesmas variantes da caixa de entrada).
    let patientId: string | null = r.patient_id ? String(r.patient_id) : null;
    if (!patientId) {
      const { data: p } = await supabase
        .from("patients")
        .select("id")
        .eq("owner_id", context.ownerId)
        .in("phone", variantesDoNumero(r.fone))
        .limit(1)
        .maybeSingle();
      patientId = p?.id ? String(p.id) : null;
    }
    // Quem supervisiona: a responsável cadastrada da clínica (a Dra.), pelo nome.
    const { data: clinica } = await supabase
      .from("clinicas")
      .select("responsavel_avaliacao")
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    const chave = String(clinica?.responsavel_avaliacao ?? "")
      .replace(/^(dra?\.?|dr\.?)\s+/i, "")
      .trim()
      .split(/\s+/)[0];
    const { data: profs } = await supabase
      .from("professionals")
      .select("id, name")
      .eq("owner_id", context.ownerId)
      .eq("active", true)
      .ilike("name", chave ? `%${chave}%` : "%")
      .limit(2);
    const unico = (profs ?? []).length === 1 ? profs[0] : null;

    const inicio = r.hora
      ? String(r.hora).slice(0, 5)
      : r.mentoria_praticas.hora_inicio
        ? String(r.mentoria_praticas.hora_inicio).slice(0, 5)
        : "09:00";
    const duracao = Number(r.mentoria_praticas.duracao_min ?? 60);
    const procedimento = r.mentoria_ofertas?.nome
      ? `Paciente modelo · ${r.mentoria_ofertas.nome}`
      : "Paciente modelo";
    let appointmentId: string | null = r.appointment_id ? String(r.appointment_id) : null;
    if (!appointmentId) {
      const { data: ap, error: e1 } = await supabase
        .from("appointments")
        .insert({
          owner_id: context.ownerId,
          unit_id: unitId,
          patient_id: patientId,
          patient_name: nome,
          procedure_name: procedimento,
          professional_id: unico?.id ?? null,
          professional_name: unico?.name ?? null,
          date: r.mentoria_praticas.data,
          start_time: inicio,
          end_time: somar(inicio, duracao),
          status: "confirmed",
          type: "procedure",
          expected_revenue: Number(r.mentoria_ofertas?.preco_vista ?? 0),
          generate_financial: false,
          notes: `Reserva de paciente modelo (${r.mentoria_edicoes?.nome ?? ""}). Sinal de R$ ${Number(r.sinal_valor ?? 0)} confirmado em ${hoje}.`,
          reserva_id: r.id,
        })
        .select("id")
        .single();
      if (e1) throw new Error(e1.message);
      appointmentId = String(ap.id);
    }

    let transactionId: string | null = r.transaction_id ? String(r.transaction_id) : null;
    if (!transactionId && Number(r.sinal_valor ?? 0) > 0) {
      const { data: tx, error: e2 } = await supabase
        .from("financial_transactions")
        .insert({
          owner_id: context.ownerId,
          unit_id: unitId,
          type: "receivable",
          status: "paid",
          description: `Sinal paciente modelo · ${nome}`,
          amount: Number(r.sinal_valor),
          due_date: hoje,
          paid_date: hoje,
          patient_id: patientId,
          payment_method: "pix",
          notes: `Reserva ${r.id} · ${r.mentoria_edicoes?.nome ?? ""}`,
        })
        .select("id")
        .single();
      if (e2) throw new Error(e2.message);
      transactionId = String(tx.id);
    }

    const { error: e3 } = await supabase
      .from("mentoria_reservas")
      .update({
        status: "confirmada",
        sinal_pago_em: new Date().toISOString(),
        appointment_id: appointmentId,
        transaction_id: transactionId,
        patient_id: patientId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", r.id);
    if (e3) throw new Error(e3.message);

    // A reserva virou consulta: nenhuma retomada automática por cima dela
    // (MD, 16.5). Mesmas colunas de `cancelarRecuperacao`.
    if (r.conversation_id) {
      await supabase
        .from("ai_agent_sessions")
        .update({
          recovery_status: "cancelada",
          recovery_motivo: "reserva de paciente modelo confirmada",
          recovery_proximo_em: null,
          recovery_enviando_desde: null,
        })
        .eq("owner_id", context.ownerId)
        .eq("conversation_id", r.conversation_id)
        .in("recovery_status", ["ativa", "enviando"]);
    }

    // A confirmação para a pessoa, pelo WhatsApp (MD, 12.7). Só depois de
    // tudo gravado: uma falha aqui não desfaz a reserva, só não avisa.
    let avisou = false;
    if (data.avisar && r.conversation_id) {
      const dia = String(r.mentoria_praticas.data);
      const endereco =
        (r.mentoria_edicoes?.endereco && String(r.mentoria_edicoes.endereco).trim()) ||
        r.mentoria_edicoes?.clinic_units?.address ||
        "";
      const texto = [
        "Sua reserva de paciente modelo foi confirmada 😊",
        `Ficou para ${diaDaSemana(dia)}, ${diaCurto(dia)}, às ${inicio.replace(":00", "h").replace(":", "h")}${endereco ? `, em ${endereco}` : ""}.`,
        "Antes da prática, a equipe avalia o seu caso e confirma o que pode ser realizado.",
        r.mentoria_edicoes?.orientacoes_chegada
          ? String(r.mentoria_edicoes.orientacoes_chegada)
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      try {
        const { callEdgeFunction } = await import("@/lib/atendimentos/atendimentos.functions");
        const json = await callEdgeFunction("wa-enviar", {
          ownerId: context.ownerId,
          conversationId: r.conversation_id,
          content: texto,
          isPrivate: false,
          attachments: [],
        });
        avisou = !!json?.ok;
      } catch (e) {
        console.warn("[modulos] confirmação não enviada:", e instanceof Error ? e.message : e);
      }
    }
    return { ok: true, avisou };
  });

export const mudarStatusDaReserva = createServerFn({ method: "POST" })
  .middleware([exigeAgenteIa])
  .inputValidator(
    (input: {
      reservaId: string;
      status: StatusDaReserva;
      praticaId?: string | null;
      ofertaId?: string | null;
      nome?: string | null;
    }) => {
      if (!input.reservaId) throw new Error("Reserva inválida.");
      if (!STATUS_DA_RESERVA.some((s) => s.id === input.status))
        throw new Error("Status inválido.");
      if (input.status === "confirmada") throw new Error("Use Confirmar sinal.");
      return input;
    },
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const supabase: any = context.supabase;
    const campos: Record<string, unknown> = {
      status: data.status,
      updated_at: new Date().toISOString(),
    };
    if (data.praticaId !== undefined) campos.pratica_id = data.praticaId;
    if (data.ofertaId !== undefined) campos.oferta_id = data.ofertaId;
    if (data.nome !== undefined) campos.nome_completo = data.nome?.trim() || null;
    const { data: r, error } = await supabase
      .from("mentoria_reservas")
      .update(campos)
      .eq("id", data.reservaId)
      .eq("owner_id", context.ownerId)
      .select("appointment_id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    // Cancelar a reserva cancela o horário; comparecer/faltar marca na agenda.
    if (r?.appointment_id) {
      const statusDaAgenda =
        data.status === "cancelada"
          ? "cancelled"
          : data.status === "compareceu"
            ? "completed"
            : data.status === "faltou"
              ? "missed"
              : null;
      if (statusDaAgenda) {
        await supabase
          .from("appointments")
          .update({ status: statusDaAgenda })
          .eq("id", r.appointment_id);
      }
    }
    return { ok: true };
  });

export const criarReservaManual = createServerFn({ method: "POST" })
  .middleware([exigeAgenteIa])
  .inputValidator(
    (input: {
      edicaoId: string;
      fone: string;
      nome: string;
      praticaId?: string | null;
      hora?: string | null;
      ofertaId?: string | null;
    }) => {
      if (!input.edicaoId) throw new Error("Edição inválida.");
      const fone = String(input.fone ?? "").replace(/\D/g, "");
      if (fone.length < 10) throw new Error("Telefone inválido.");
      if (!input.nome?.trim()) throw new Error("Nome obrigatório.");
      return { ...input, fone, nome: input.nome.trim() };
    },
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const supabase: any = context.supabase;
    const { data: mod } = await supabase
      .from("agente_modulos")
      .select("config")
      .eq("owner_id", context.ownerId)
      .eq("modulo", "paciente_modelo")
      .maybeSingle();
    const config = configDoModulo(mod?.config);
    const { data: nova, error } = await supabase
      .from("mentoria_reservas")
      .insert({
        owner_id: context.ownerId,
        edicao_id: data.edicaoId,
        pratica_id: data.praticaId ?? null,
        hora: data.hora || null,
        oferta_id: data.ofertaId ?? null,
        fone: data.fone.length <= 11 ? `55${data.fone}` : data.fone,
        nome_completo: data.nome,
        status: data.praticaId ? "sinal_pendente" : "interesse",
        sinal_valor: config.sinal.valor,
        criado_por: "equipe",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: String(nova.id) };
  });

/** As unidades ativas, para escolher onde a edição acontece. */
export const getUnidadesParaEdicao = createServerFn({ method: "GET" })
  .middleware([exigeAgenteIa])
  .handler(
    async ({ context }): Promise<{ id: string; nome: string; endereco: string | null }[]> => {
      const supabase: any = context.supabase;
      const { data, error } = await supabase
        .from("clinic_units")
        .select("id, name, address")
        .eq("owner_id", context.ownerId)
        .eq("active", true)
        .order("is_default", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map((u: any) => ({
        id: String(u.id),
        nome: String(u.name ?? ""),
        endereco: u.address ?? null,
      }));
    },
  );

/** A seção que a Luna vai ler, para a pessoa conferir antes de abrir a edição. */
export const getPreviaDaSecao = createServerFn({ method: "GET" })
  .middleware([exigeAgenteIa])
  .handler(async ({ context }): Promise<string> => {
    const supabase: any = context.supabase;
    const { secaoDoModuloPacienteModelo, catalogoDaEdicao } =
      await import("../../../supabase/functions/_shared/modulo-paciente-modelo.ts");
    const { data: mod } = await supabase
      .from("agente_modulos")
      .select("config, manual")
      .eq("owner_id", context.ownerId)
      .eq("modulo", "paciente_modelo")
      .maybeSingle();
    const edicoes = (await lerEdicoes(supabase, context.ownerId)).filter(
      (e) => !["rascunho", "encerrada", "cancelada"].includes(e.status),
    );
    const hoje = localDateStr();
    const vigente = edicaoVigente(edicoes, hoje);
    const { data: clinica } = await supabase
      .from("clinicas")
      .select("responsavel_avaliacao")
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    const quem = clinica?.responsavel_avaliacao
      ? String(clinica.responsavel_avaliacao)
      : "a equipe";
    const manual = String(mod?.manual ?? "");
    // A prévia mostra a MD só pelo começo: o que interessa conferir aqui são
    // os dados do CRM, que vêm depois dela.
    const resumoDoManual = manual
      ? `[Manual do módulo: ${manual.length.toLocaleString("pt-BR")} caracteres. Começa com: ${manual.slice(0, 200).replace(/\s+/g, " ")}…]`
      : "[Sem manual do módulo]";
    return secaoDoModuloPacienteModelo({
      vigente,
      config: configDoModulo(mod?.config),
      manual: resumoDoManual,
      hoje,
      quem,
      catalogo: catalogoDaEdicao(vigente.aberta, hoje),
    });
  });
