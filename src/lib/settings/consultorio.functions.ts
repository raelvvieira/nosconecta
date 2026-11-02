/* eslint-disable @typescript-eslint/no-explicit-any -- colunas novas, fora do types.ts do Lovable */
import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { exigeConfiguracoes } from "@/lib/auth/area.middleware";
import {
  FORMAS_DE_PAGAMENTO,
  campanhaDoBanco,
  type Campanha,
  type FormaDePagamento,
  type ItemDeCampanha,
} from "../../../supabase/functions/_shared/condicoes-do-consultorio.ts";
import type { AreaDeAtuacao } from "@/lib/settings/catalogo-modelo";

/**
 * O consultório como o próprio consultório configura: identidade, área,
 * como o paciente paga, avaliação e políticas, o andamento do onboarding e as
 * campanhas. É daqui que a assistente tira as condições comerciais (ver
 * `_shared/condicoes-do-consultorio.ts`).
 *
 * A gravação em `clinicas` passa pelo servidor com a chave de serviço: a
 * tabela não tem regra de escrita para quem está logado, porque plano, teste
 * e franquia moram nela e são da plataforma.
 */

async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export { FORMAS_DE_PAGAMENTO };
export type { Campanha, FormaDePagamento, ItemDeCampanha };

export interface ConfigDoConsultorio {
  nome: string;
  cidade: string;
  whatsapp: string;
  responsavelAvaliacao: string;
  logoPath: string | null;
  area: AreaDeAtuacao;
  formas: FormaDePagamento[];
  parcelasMax: number | null;
  jurosAPartir: number | null;
  parcelaMinima: number | null;
  avaliacaoGratuita: boolean;
  avaliacaoValor: number | null;
  avaliacaoAbate: boolean;
  politicaFalta: string;
  politicaCancelamento: string;
  precoHarmonizacao: boolean;
  onboardingPasso: string | null;
  onboardingConcluido: boolean;
  plano: string;
}

const AREAS_VALIDAS = new Set(["odonto", "estetica", "odonto_estetica", "medica"]);
const num = (v: unknown) =>
  v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);

function daLinha(r: any): ConfigDoConsultorio {
  return {
    nome: String(r?.nome ?? ""),
    cidade: String(r?.cidade ?? ""),
    whatsapp: String(r?.whatsapp ?? ""),
    responsavelAvaliacao: String(r?.responsavel_avaliacao ?? ""),
    logoPath: r?.logo_path ?? null,
    area: AREAS_VALIDAS.has(r?.area_atuacao) ? r.area_atuacao : "odonto_estetica",
    formas: Array.isArray(r?.formas_pagamento) ? r.formas_pagamento : ["pix", "cartao", "dinheiro"],
    parcelasMax: num(r?.parcelas_max),
    jurosAPartir: num(r?.juros_a_partir),
    parcelaMinima: num(r?.parcela_minima),
    avaliacaoGratuita: r?.avaliacao_gratuita !== false,
    avaliacaoValor: num(r?.avaliacao_valor),
    avaliacaoAbate: r?.avaliacao_abate === true,
    politicaFalta: String(r?.politica_falta ?? ""),
    politicaCancelamento: String(r?.politica_cancelamento ?? ""),
    precoHarmonizacao: r?.preco_harmonizacao === true,
    onboardingPasso: r?.onboarding_passo ?? null,
    // Coluna ausente (antes da migration) = já configurado: não abre o
    // onboarding em cima de quem está usando.
    onboardingConcluido: r ? r.onboarding_concluido_em !== null : true,
    plano: String(r?.plano ?? "ia"),
  };
}

export const getConfigDoConsultorio = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<ConfigDoConsultorio & { isAdmin: boolean }> => {
    const { data } = await (await admin())
      .from("clinicas")
      .select("*")
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    return { ...daLinha(data), isAdmin: context.isAdmin };
  });

export type MudancaNoConsultorio = Partial<
  Omit<ConfigDoConsultorio, "onboardingConcluido" | "plano"> & { concluirOnboarding: boolean }
>;

export const salvarConfigDoConsultorio = createServerFn({ method: "POST" })
  .middleware([exigeConfiguracoes])
  .inputValidator((input: MudancaNoConsultorio) => {
    const c: Record<string, unknown> = {};
    const texto = (v: unknown, max: number) =>
      String(v ?? "")
        .trim()
        .slice(0, max);
    if (input.nome !== undefined) {
      const nome = texto(input.nome, 120);
      if (!nome) throw new Error("O consultório precisa de um nome.");
      c.nome = nome;
    }
    if (input.cidade !== undefined) c.cidade = texto(input.cidade, 80) || null;
    if (input.whatsapp !== undefined) c.whatsapp = texto(input.whatsapp, 30) || null;
    if (input.responsavelAvaliacao !== undefined)
      c.responsavel_avaliacao = texto(input.responsavelAvaliacao, 120) || null;
    if (input.logoPath !== undefined) c.logo_path = input.logoPath || null;
    if (input.area !== undefined) {
      if (!AREAS_VALIDAS.has(input.area)) throw new Error("Área inválida.");
      c.area_atuacao = input.area;
    }
    if (input.formas !== undefined) {
      const validas = new Set(FORMAS_DE_PAGAMENTO.map((f) => f.id));
      c.formas_pagamento = [...new Set(input.formas.filter((f) => validas.has(f)))];
    }
    if (input.parcelasMax !== undefined) {
      const n = num(input.parcelasMax);
      if (n !== null && (n < 1 || n > 24)) throw new Error("Parcelas: de 1 a 24.");
      c.parcelas_max = n;
    }
    if (input.jurosAPartir !== undefined) {
      const n = num(input.jurosAPartir);
      if (n !== null && (n < 2 || n > 24)) throw new Error("Juros: a partir de 2 a 24 parcelas.");
      c.juros_a_partir = n;
    }
    if (input.parcelaMinima !== undefined) c.parcela_minima = num(input.parcelaMinima);
    if (input.avaliacaoGratuita !== undefined) c.avaliacao_gratuita = input.avaliacaoGratuita;
    if (input.avaliacaoValor !== undefined) c.avaliacao_valor = num(input.avaliacaoValor);
    if (input.avaliacaoAbate !== undefined) c.avaliacao_abate = input.avaliacaoAbate;
    if (input.politicaFalta !== undefined)
      c.politica_falta = texto(input.politicaFalta, 600) || null;
    if (input.politicaCancelamento !== undefined)
      c.politica_cancelamento = texto(input.politicaCancelamento, 600) || null;
    if (input.precoHarmonizacao !== undefined) c.preco_harmonizacao = input.precoHarmonizacao;
    if (input.onboardingPasso !== undefined) c.onboarding_passo = input.onboardingPasso;
    if (input.concluirOnboarding) c.onboarding_concluido_em = new Date().toISOString();
    return c;
  })
  .handler(async ({ data, context }) => {
    if (!context.isAdmin) throw new Error("Apenas administradores mudam os dados do consultório.");
    if (!Object.keys(data).length) return { ok: true };
    const { error } = await (
      await admin()
    )
      .from("clinicas")
      .update({ ...data, atualizado_em: new Date().toISOString() })
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Procedimentos do catálogo-modelo ─────────────────────────────────────

export interface ProcedimentoParaImportar {
  nome: string;
  categoria: string;
  duracaoMin: number;
  preco: number;
  aPartirDe: boolean;
}

/**
 * Cria os procedimentos escolhidos e já os libera para a assistente citar.
 * Quem já tem um procedimento com o mesmo nome não ganha outro: muda o preço.
 */
export const importarProcedimentos = createServerFn({ method: "POST" })
  .middleware([exigeConfiguracoes])
  .inputValidator((input: { itens: ProcedimentoParaImportar[] }) => {
    const itens = (input.itens ?? [])
      .map((i) => ({
        nome: String(i.nome ?? "")
          .trim()
          .slice(0, 120),
        categoria: String(i.categoria ?? "")
          .trim()
          .slice(0, 60),
        duracaoMin: Math.min(480, Math.max(5, Number(i.duracaoMin) || 60)),
        preco: Math.max(0, Number(i.preco) || 0),
        aPartirDe: i.aPartirDe === true,
      }))
      .filter((i) => i.nome);
    if (!itens.length) throw new Error("Escolha ao menos um procedimento.");
    if (itens.length > 100) throw new Error("No máximo 100 de uma vez.");
    return { itens };
  })
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { data: existentes } = await supabase
      .from("clinic_procedures")
      .select("id, name")
      .eq("owner_id", context.ownerId);
    const porNome = new Map<string, string>(
      (existentes ?? []).map((r: any) => [String(r.name).toLowerCase(), String(r.id)]),
    );
    const ids: string[] = [];
    for (const i of data.itens) {
      const id = porNome.get(i.nome.toLowerCase()) ?? crypto.randomUUID();
      const { error } = await supabase.from("clinic_procedures").upsert({
        id,
        owner_id: context.ownerId,
        name: i.nome,
        category: i.categoria || null,
        duration_minutes: i.duracaoMin,
        price: i.preco,
        price_from: i.aPartirDe,
        active: true,
      });
      if (error) throw new Error(error.message);
      ids.push(id);
    }
    const { data: agente } = await supabase
      .from("ai_agents")
      .select("id")
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    if (agente) {
      for (const procedureId of ids) {
        const { error } = await supabase
          .from("ai_agent_procedures")
          .insert({ owner_id: context.ownerId, agent_id: agente.id, procedure_id: procedureId });
        if (error && error.code !== "23505") throw new Error(error.message);
      }
    }
    return { ok: true, criados: ids.length };
  });

// ── Campanhas ─────────────────────────────────────────────────────────────

export const listarCampanhas = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<Campanha[]> => {
    const supabase: any = context.supabase;
    const { data, error } = await supabase
      .from("campanhas")
      .select("*")
      .eq("owner_id", context.ownerId)
      .order("fim", { ascending: false });
    if (error) {
      if (/does not exist|42P01/.test(String(error.message) + error.code)) return [];
      throw new Error(error.message);
    }
    return (data ?? []).map(campanhaDoBanco);
  });

export const salvarCampanha = createServerFn({ method: "POST" })
  .middleware([exigeConfiguracoes])
  .inputValidator((input: Omit<Campanha, "id"> & { id?: string | null }) => {
    const nome = String(input.nome ?? "")
      .trim()
      .slice(0, 80);
    if (!nome) throw new Error("Dê um nome à campanha.");
    const dia = /^\d{4}-\d{2}-\d{2}$/;
    if (!dia.test(input.inicio) || !dia.test(input.fim)) throw new Error("Datas inválidas.");
    if (input.fim < input.inicio) throw new Error("O fim vem antes do início.");
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
    if (!itens.length) throw new Error("Coloque ao menos um procedimento com preço.");
    return {
      id: input.id || null,
      nome,
      inicio: input.inicio,
      fim: input.fim,
      ativo: input.ativo !== false,
      itens,
      observacoes:
        String(input.observacoes ?? "")
          .trim()
          .slice(0, 600) || null,
    };
  })
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const row = {
      owner_id: context.ownerId,
      nome: data.nome,
      inicio: data.inicio,
      fim: data.fim,
      ativo: data.ativo,
      itens: data.itens,
      observacoes: data.observacoes,
      updated_at: new Date().toISOString(),
    };
    const { error } = data.id
      ? await supabase
          .from("campanhas")
          .update(row)
          .eq("id", data.id)
          .eq("owner_id", context.ownerId)
      : await supabase.from("campanhas").insert(row);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const excluirCampanha = createServerFn({ method: "POST" })
  .middleware([exigeConfiguracoes])
  .inputValidator((input: { id: string }) => {
    if (!input.id) throw new Error("Campanha inválida.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { error } = await supabase
      .from("campanhas")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
