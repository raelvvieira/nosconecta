/* eslint-disable @typescript-eslint/no-explicit-any -- tabelas novas, fora do types.ts do Lovable */
import { createServerFn } from "@tanstack/react-start";
import { exigeAgenteIa } from "@/lib/auth/area.middleware";
import { localDateStr } from "@/lib/date";
import {
  LIMITE_DAS_INSTRUCOES,
  LIMITE_DO_BLOCO,
  LIMITE_DO_RESUMO,
  conhecimentoDoBanco,
  ofertaDoBanco,
  secaoDeConhecimento,
  secaoOQueEstaValendo,
  termometroDaOferta,
  type Conhecimento,
  type EstadoDaOferta,
  type Oferta,
  type ParaQuem,
  type Termometro,
} from "../../../supabase/functions/_shared/mapa-de-ofertas.ts";
import type { ItemDeCampanha } from "../../../supabase/functions/_shared/condicoes-do-consultorio.ts";

/**
 * Ofertas, do lado da tela do Agente de IA: a lista, a ficha de cada uma e o
 * que a assistente sabe dela (resumo, conhecimento, materiais). A regra de
 * como isso chega à conversa mora em `_shared/mapa-de-ofertas.ts`.
 *
 * Tudo por `owner_id`. Uma oferta de edição (Paciente Modelo, Mentoria) tem o
 * liga e desliga no módulo dela (`agente_modulos`), que é onde a instrução o
 * lê; a linha em `ofertas` só espelha o estado.
 */

export { LIMITE_DAS_INSTRUCOES, LIMITE_DO_BLOCO, LIMITE_DO_RESUMO };
export type { Conhecimento, EstadoDaOferta, ItemDeCampanha, Oferta, ParaQuem, Termometro };

/** As três posições do liga e desliga, iguais às dos módulos. */
export type PosicaoDaOferta = "desligado" | "teste" | "ligado";

function ausente(error: any): boolean {
  return (
    !!error &&
    (error.code === "42P01" ||
      error.code === "42703" ||
      /does not exist/i.test(String(error?.message ?? "")))
  );
}

function posicaoDe(o: Oferta, moduloEstado: PosicaoDaOferta | null): PosicaoDaOferta | "encerrada" {
  if (o.estado === "encerrada") return "encerrada";
  if (moduloEstado) return moduloEstado;
  return o.estado === "ligado" ? "ligado" : o.estado === "teste" ? "teste" : "desligado";
}

export interface OfertaDaLista extends Oferta {
  /** Blocos de conhecimento ativos. */
  blocos: number;
  /** Casos da biblioteca ligados a ela. */
  materiais: number;
  /** A posição que vale (a do módulo, nas ofertas de edição). */
  posicao: PosicaoDaOferta | "encerrada";
  termometro: Termometro;
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

async function contagens(supabase: any, ownerId: string) {
  const blocos = new Map<string, number>();
  const materiais = new Map<string, number>();
  const a = await supabase
    .from("oferta_conhecimento")
    .select("oferta_id")
    .eq("owner_id", ownerId)
    .eq("ativo", true);
  if (!a.error)
    for (const r of a.data ?? []) blocos.set(r.oferta_id, (blocos.get(r.oferta_id) ?? 0) + 1);
  const b = await supabase
    .from("ai_agent_casos")
    .select("oferta_id")
    .eq("owner_id", ownerId)
    .eq("ativo", true)
    .not("oferta_id", "is", null);
  if (!b.error)
    for (const r of b.data ?? []) materiais.set(r.oferta_id, (materiais.get(r.oferta_id) ?? 0) + 1);
  return { blocos, materiais };
}

async function estadosDosModulos(supabase: any, ownerId: string) {
  const { data } = await supabase
    .from("agente_modulos")
    .select("modulo, estado")
    .eq("owner_id", ownerId);
  return new Map<string, PosicaoDaOferta>(
    (data ?? []).map((m: any) => [String(m.modulo), (m.estado ?? "desligado") as PosicaoDaOferta]),
  );
}

async function edicoesAbertas(supabase: any, ownerId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("mentoria_edicoes")
    .select("id")
    .eq("owner_id", ownerId)
    .in("status", ["publicada", "inscricoes_abertas", "esgotada"])
    .limit(1);
  return !error && (data ?? []).length > 0;
}

function montarDaLista(
  o: Oferta,
  c: { blocos: Map<string, number>; materiais: Map<string, number> },
  modulos: Map<string, PosicaoDaOferta>,
  temEdicao: boolean,
): OfertaDaLista {
  const blocos = c.blocos.get(o.id) ?? 0;
  const materiais = c.materiais.get(o.id) ?? 0;
  const moduloEstado = o.modulo ? (modulos.get(o.modulo) ?? "desligado") : null;
  return {
    ...o,
    blocos,
    materiais,
    posicao: posicaoDe(o, moduloEstado),
    termometro: termometroDaOferta(o, {
      blocos,
      materiais,
      temEdicao: o.modulo ? temEdicao : false,
    }),
  };
}

export const listarOfertasDoAgente = createServerFn({ method: "GET" })
  .middleware([exigeAgenteIa])
  .handler(async ({ context }): Promise<OfertaDaLista[]> => {
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("ofertas")
      .select("*")
      .eq("owner_id", context.ownerId)
      .order("tipo", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      // Migration ainda não rodou: nada a listar.
      if (ausente(error)) return [];
      throw new Error(error.message);
    }
    const [c, modulos, temEdicao] = await Promise.all([
      contagens(supabase, context.ownerId),
      estadosDosModulos(supabase, context.ownerId),
      edicoesAbertas(supabase, context.ownerId),
    ]);
    return (data ?? []).map((r: any) => montarDaLista(ofertaDoBanco(r), c, modulos, temEdicao));
  });

export interface CasoParaLigar {
  id: string;
  titulo: string;
  ofertaId: string | null;
  ativo: boolean;
}

export interface FichaDaOferta {
  oferta: OfertaDaLista;
  conhecimento: Conhecimento[];
  /** Todos os casos da biblioteca, para ligar a esta oferta. */
  casos: CasoParaLigar[];
}

export const getOfertaDoAgente = createServerFn({ method: "GET" })
  .middleware([exigeAgenteIa])
  .inputValidator((input: { id: string }) => {
    if (!input.id) throw new Error("Oferta inválida.");
    return input;
  })
  .handler(async ({ data, context }): Promise<FichaDaOferta> => {
    const supabase: any = context.supabase;
    const { data: linha, error } = await supabase
      .from("ofertas")
      .select("*")
      .eq("id", data.id)
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!linha) throw new Error("Oferta não encontrada.");
    const [c, modulos, temEdicao, blocos, casos] = await Promise.all([
      contagens(supabase, context.ownerId),
      estadosDosModulos(supabase, context.ownerId),
      edicoesAbertas(supabase, context.ownerId),
      supabase
        .from("oferta_conhecimento")
        .select("*")
        .eq("owner_id", context.ownerId)
        .eq("oferta_id", data.id)
        .order("ordem", { ascending: true }),
      supabase
        .from("ai_agent_casos")
        .select("id, titulo, oferta_id, ativo")
        .eq("owner_id", context.ownerId)
        .order("created_at", { ascending: false }),
    ]);
    return {
      oferta: montarDaLista(ofertaDoBanco(linha), c, modulos, temEdicao),
      conhecimento: blocos.error ? [] : (blocos.data ?? []).map((r: any) => conhecimentoDoBanco(r)),
      casos: casos.error
        ? []
        : (casos.data ?? []).map((r: any) => ({
            id: String(r.id),
            titulo: String(r.titulo ?? ""),
            ofertaId: r.oferta_id ? String(r.oferta_id) : null,
            ativo: r.ativo !== false,
          })),
    };
  });

export type EntradaDaOferta = {
  id?: string | null;
  nome: string;
  inicio: string | null;
  fim: string | null;
  paraQuem: ParaQuem;
  resumo: string | null;
  comoReconhecer: string | null;
  instrucoes: string | null;
  itens: ItemDeCampanha[];
  observacoes: string | null;
};

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const texto = (v: unknown, teto: number): string | null =>
  String(v ?? "")
    .trim()
    .slice(0, teto) || null;

/**
 * Cria uma promoção ou salva os campos de uma oferta. O tipo e o módulo de uma
 * oferta existente não mudam por aqui, e uma oferta nova pela tela é sempre uma
 * promoção: as edições nascem do cadastro do módulo.
 */
export const salvarOfertaDoAgente = createServerFn({ method: "POST" })
  .middleware([exigeAgenteIa])
  .inputValidator((input: EntradaDaOferta) => {
    const nome = String(input.nome ?? "")
      .trim()
      .slice(0, 80);
    if (!nome) throw new Error("Dê um nome à oferta.");
    const paraQuem: ParaQuem = ["paciente", "profissional", "todos"].includes(input.paraQuem)
      ? input.paraQuem
      : "todos";
    const dia = /^\d{4}-\d{2}-\d{2}$/;
    const inicio = input.inicio && dia.test(input.inicio) ? input.inicio : null;
    const fim = input.fim && dia.test(input.fim) ? input.fim : null;
    if (inicio && fim && fim < inicio) throw new Error("O fim vem antes do início.");
    const itens = (input.itens ?? [])
      .map((i) => ({
        nome: String(i.nome ?? "")
          .trim()
          .slice(0, 120),
        precoVista: num(i.precoVista),
        parcelas: num(i.parcelas),
        valorParcela: num(i.valorParcela),
      }))
      .filter((i) => i.nome);
    return {
      id: input.id || null,
      nome,
      inicio,
      fim,
      paraQuem,
      resumo: texto(input.resumo, LIMITE_DO_RESUMO),
      comoReconhecer: texto(input.comoReconhecer, 400),
      instrucoes: texto(input.instrucoes, LIMITE_DAS_INSTRUCOES),
      itens,
      observacoes: texto(input.observacoes, 600),
    };
  })
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const supabase: any = context.supabase;
    const row = {
      nome: data.nome,
      inicio: data.inicio,
      fim: data.fim,
      para_quem: data.paraQuem,
      resumo: data.resumo,
      como_reconhecer: data.comoReconhecer,
      instrucoes_comerciais: data.instrucoes,
      itens: data.itens,
      observacoes: data.observacoes,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { data: atual } = await supabase
        .from("ofertas")
        .select("tipo")
        .eq("id", data.id)
        .eq("owner_id", context.ownerId)
        .maybeSingle();
      if (!atual) throw new Error("Oferta não encontrada.");
      if (atual.tipo === "promocao") {
        if (!data.inicio || !data.fim) throw new Error("Uma promoção precisa de início e fim.");
        if (!data.itens.length) throw new Error("Coloque ao menos um procedimento com preço.");
      }
      // Uma edição não tem itens nem período próprio: só os textos.
      const campos =
        atual.tipo === "promocao"
          ? row
          : {
              nome: row.nome,
              para_quem: row.para_quem,
              resumo: row.resumo,
              como_reconhecer: row.como_reconhecer,
              instrucoes_comerciais: row.instrucoes_comerciais,
              observacoes: row.observacoes,
              updated_at: row.updated_at,
            };
      const { error } = await supabase
        .from("ofertas")
        .update(campos)
        .eq("id", data.id)
        .eq("owner_id", context.ownerId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    if (!data.inicio || !data.fim) throw new Error("Uma promoção precisa de início e fim.");
    if (!data.itens.length) throw new Error("Coloque ao menos um procedimento com preço.");
    const { data: nova, error } = await supabase
      .from("ofertas")
      .insert({ ...row, tipo: "promocao", estado: "rascunho", owner_id: context.ownerId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: String(nova.id) };
  });

export const excluirOfertaDoAgente = createServerFn({ method: "POST" })
  .middleware([exigeAgenteIa])
  .inputValidator((input: { id: string }) => {
    if (!input.id) throw new Error("Oferta inválida.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    // Só promoção sai daqui: Paciente Modelo e Mentoria têm cadastro próprio.
    const { error } = await supabase
      .from("ofertas")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.ownerId)
      .eq("tipo", "promocao");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Liga, desliga ou põe em teste. Numa oferta de edição quem manda é o módulo
 * (`agente_modulos`, que é onde a instrução lê o estado); a linha da oferta
 * só espelha. Uma oferta encerrada se reabre por aqui.
 */
export const definirPosicaoDaOferta = createServerFn({ method: "POST" })
  .middleware([exigeAgenteIa])
  .inputValidator((input: { id: string; posicao: PosicaoDaOferta }) => {
    if (!input.id) throw new Error("Oferta inválida.");
    if (!["desligado", "teste", "ligado"].includes(input.posicao))
      throw new Error("Posição inválida.");
    return input;
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const supabase: any = context.supabase;
    const { data: o } = await supabase
      .from("ofertas")
      .select("id, modulo")
      .eq("id", data.id)
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    if (!o) throw new Error("Oferta não encontrada.");
    const estado: EstadoDaOferta =
      data.posicao === "ligado" ? "ligado" : data.posicao === "teste" ? "teste" : "rascunho";
    if (o.modulo) {
      const agente = await agenteDaClinica(supabase, context.ownerId);
      const { error } = await supabase.from("agente_modulos").upsert(
        {
          owner_id: context.ownerId,
          agent_id: agente.id,
          modulo: o.modulo,
          estado: data.posicao,
          ativo: data.posicao === "ligado",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "agent_id,modulo" },
      );
      if (error) throw new Error(error.message);
    }
    const { error } = await supabase
      .from("ofertas")
      .update({ estado, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const encerrarOferta = createServerFn({ method: "POST" })
  .middleware([exigeAgenteIa])
  .inputValidator((input: { id: string }) => {
    if (!input.id) throw new Error("Oferta inválida.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { error } = await supabase
      .from("ofertas")
      .update({ estado: "encerrada", updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("owner_id", context.ownerId)
      .eq("tipo", "promocao");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Conhecimento ───────────────────────────────────────────────────────────

export type EntradaDoConhecimento = {
  id?: string | null;
  ofertaId: string;
  titulo: string;
  quandoUsar: string | null;
  texto: string;
  ativo: boolean;
};

export const salvarConhecimento = createServerFn({ method: "POST" })
  .middleware([exigeAgenteIa])
  .inputValidator((input: EntradaDoConhecimento) => {
    const titulo = String(input.titulo ?? "")
      .trim()
      .slice(0, 80);
    if (!titulo) throw new Error("Dê um título ao texto.");
    const corpo = String(input.texto ?? "").trim();
    if (!corpo) throw new Error("Escreva o texto que a assistente deve consultar.");
    if (!input.ofertaId) throw new Error("Oferta inválida.");
    return {
      id: input.id || null,
      ofertaId: input.ofertaId,
      titulo,
      quandoUsar: texto(input.quandoUsar, 200),
      texto: corpo.slice(0, LIMITE_DO_BLOCO),
      ativo: input.ativo !== false,
    };
  })
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const supabase: any = context.supabase;
    const { data: oferta } = await supabase
      .from("ofertas")
      .select("id")
      .eq("id", data.ofertaId)
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    if (!oferta) throw new Error("Oferta não encontrada.");
    const campos = {
      titulo: data.titulo,
      quando_usar: data.quandoUsar,
      texto: data.texto,
      ativo: data.ativo,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await supabase
        .from("oferta_conhecimento")
        .update(campos)
        .eq("id", data.id)
        .eq("owner_id", context.ownerId)
        .eq("oferta_id", data.ofertaId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ultimo } = await supabase
      .from("oferta_conhecimento")
      .select("ordem")
      .eq("owner_id", context.ownerId)
      .eq("oferta_id", data.ofertaId)
      .order("ordem", { ascending: false })
      .limit(1);
    const ordem = ((ultimo ?? [])[0]?.ordem ?? -1) + 1;
    const { data: nova, error } = await supabase
      .from("oferta_conhecimento")
      .insert({ ...campos, owner_id: context.ownerId, oferta_id: data.ofertaId, ordem })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: String(nova.id) };
  });

export const excluirConhecimento = createServerFn({ method: "POST" })
  .middleware([exigeAgenteIa])
  .inputValidator((input: { id: string }) => {
    if (!input.id) throw new Error("Texto inválido.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { error } = await supabase
      .from("oferta_conhecimento")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Grava a ordem dos blocos: a lista de ids, na ordem em que devem ficar. */
export const reordenarConhecimento = createServerFn({ method: "POST" })
  .middleware([exigeAgenteIa])
  .inputValidator((input: { ofertaId: string; ids: string[] }) => {
    if (!input.ofertaId || !Array.isArray(input.ids)) throw new Error("Pedido inválido.");
    return { ofertaId: input.ofertaId, ids: input.ids.slice(0, 100) };
  })
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    for (let i = 0; i < data.ids.length; i++) {
      const { error } = await supabase
        .from("oferta_conhecimento")
        .update({ ordem: i })
        .eq("id", data.ids[i])
        .eq("owner_id", context.ownerId)
        .eq("oferta_id", data.ofertaId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ── Materiais ──────────────────────────────────────────────────────────────

/** Liga (ou desliga, com `ofertaId: null`) um caso da biblioteca a uma oferta. */
export const vincularCaso = createServerFn({ method: "POST" })
  .middleware([exigeAgenteIa])
  .inputValidator((input: { casoId: string; ofertaId: string | null }) => {
    if (!input.casoId) throw new Error("Caso inválido.");
    return { casoId: input.casoId, ofertaId: input.ofertaId || null };
  })
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    if (data.ofertaId) {
      const { data: o } = await supabase
        .from("ofertas")
        .select("id")
        .eq("id", data.ofertaId)
        .eq("owner_id", context.ownerId)
        .maybeSingle();
      if (!o) throw new Error("Oferta não encontrada.");
    }
    const { error } = await supabase
      .from("ai_agent_casos")
      .update({ oferta_id: data.ofertaId })
      .eq("id", data.casoId)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── O que a IA lê ──────────────────────────────────────────────────────────

/**
 * O bloco da oferta e o conhecimento dela, como a assistente os recebe numa
 * conversa em que a oferta está aberta e em foco. Mostra, mesmo para uma oferta
 * desligada, como ficaria.
 */
export const previaDaOferta = createServerFn({ method: "GET" })
  .middleware([exigeAgenteIa])
  .inputValidator((input: { id: string }) => {
    if (!input.id) throw new Error("Oferta inválida.");
    return input;
  })
  .handler(async ({ data, context }): Promise<{ bloco: string; conhecimento: string }> => {
    const supabase: any = context.supabase;
    const { data: linha } = await supabase
      .from("ofertas")
      .select("*")
      .eq("id", data.id)
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    if (!linha) throw new Error("Oferta não encontrada.");
    const oferta = ofertaDoBanco(linha);
    const { data: blocos } = await supabase
      .from("oferta_conhecimento")
      .select("*")
      .eq("owner_id", context.ownerId)
      .eq("oferta_id", data.id)
      .eq("ativo", true)
      .order("ordem", { ascending: true });
    // Como se estivesse valendo: ligada, no primeiro dia do período (uma promoção
    // futura ou encerrada também se confere) e com o módulo no ar.
    const dia = oferta.tipo === "promocao" && oferta.inicio ? oferta.inicio : localDateStr();
    const comoValendo: Oferta = { ...oferta, estado: "ligado" };
    return {
      bloco: secaoOQueEstaValendo([comoValendo], dia, {
        simulacao: true,
        moduloPacienteModeloVale: true,
      }).join("\n"),
      conhecimento: secaoDeConhecimento(
        oferta,
        (blocos ?? []).map((r: any) => conhecimentoDoBanco(r)),
      ).join("\n"),
    };
  });
