/* eslint-disable @typescript-eslint/no-explicit-any -- tabelas novas, fora do types.ts do Lovable */
import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { exigePlataforma } from "@/lib/plataforma/plataforma.functions";
import {
  avaliarCupom,
  codigoDoCupom,
  cupomDaLinha,
} from "../../../supabase/functions/_shared/cupom";

/**
 * O plano do consultório e o pagamento pelo Asaas.
 *
 * Quem fala com o Asaas é a Edge Function `asaas-checkout` (a chave do Asaas
 * é segredo do Supabase); aqui o servidor do site confere quem pede e passa
 * adiante. Quem confirma que pagou é o webhook (`asaas-webhook`), nunca o
 * retorno da página de pagamento.
 *
 * Assinar, comprar e cancelar: só quem administra o consultório. Ver o plano:
 * qualquer pessoa da equipe com acesso (é a mesma ficha que ela já lê).
 */

async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function chamarCheckout(body: Record<string, unknown>): Promise<any> {
  const { callEdgeFunction } = await import("@/lib/atendimentos/atendimentos.functions");
  return callEdgeFunction("asaas-checkout", body);
}

export type Plano = "basico" | "ia";
export type Ciclo = "mensal" | "anual";

export interface PrecoDaPlataforma {
  chave: string;
  nome: string;
  valorCentavos: number;
  conversas: number | null;
}

export interface MeuPlano {
  plano: Plano;
  situacao: "teste" | "ativa" | "suspensa";
  ciclo: Ciclo | null;
  testeAte: string | null;
  pagoAte: string | null;
  temAssinatura: boolean;
  precos: PrecoDaPlataforma[];
  ultimos: { tipo: string; status: string; valorCentavos: number | null; criadoEm: string }[];
}

async function lerPrecos(): Promise<PrecoDaPlataforma[]> {
  const { data, error } = await (await admin())
    .from("plataforma_precos")
    .select("chave, nome, valor_centavos, conversas")
    .order("valor_centavos");
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((p) => ({
    chave: String(p.chave),
    nome: String(p.nome),
    valorCentavos: Number(p.valor_centavos),
    conversas: p.conversas === null ? null : Number(p.conversas),
  }));
}

export const getMeuPlano = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<MeuPlano | null> => {
    const db = await admin();
    const { data: ficha } = await db
      .from("clinicas")
      .select("plano, situacao, ciclo, teste_ate, pago_ate, asaas_subscription_id")
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    if (!ficha) return null;
    const [precos, pagamentos] = await Promise.all([
      lerPrecos(),
      db
        .from("asaas_pagamentos")
        .select("tipo, status, valor_centavos, criado_em")
        .eq("owner_id", context.ownerId)
        .neq("status", "aberto")
        .order("criado_em", { ascending: false })
        .limit(6),
    ]);
    return {
      plano: ficha.plano,
      situacao: ficha.situacao,
      ciclo: ficha.ciclo ?? null,
      testeAte: ficha.teste_ate ?? null,
      pagoAte: ficha.pago_ate ?? null,
      temAssinatura: !!ficha.asaas_subscription_id,
      precos,
      ultimos: ((pagamentos.data ?? []) as any[]).map((p) => ({
        tipo: String(p.tipo),
        status: String(p.status),
        valorCentavos: p.valor_centavos === null ? null : Number(p.valor_centavos),
        criadoEm: p.criado_em,
      })),
    };
  });

function soAdmin(context: { isAdmin: boolean }) {
  if (!context.isAdmin) throw new Error("Só quem administra o consultório cuida do pagamento.");
}

/** Abre o checkout da assinatura e devolve o link do Asaas. */
export const assinarPlano = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { plano: Plano; ciclo: Ciclo; cupom?: string | null }) => {
    if (input.plano !== "basico" && input.plano !== "ia") throw new Error("Plano inválido.");
    if (input.ciclo !== "mensal" && input.ciclo !== "anual") throw new Error("Ciclo inválido.");
    return { plano: input.plano, ciclo: input.ciclo, cupom: codigoDoCupom(input.cupom) || null };
  })
  .handler(async ({ data, context }): Promise<{ link: string }> => {
    soAdmin(context);
    const r = await chamarCheckout({
      action: "assinar",
      ownerId: context.ownerId,
      plano: data.plano,
      ciclo: data.ciclo,
      criadoPor: context.userId,
      cupom: data.cupom,
    });
    return { link: String(r.link) };
  });

/** Abre o checkout do pacote de conversas. */
export const comprarConversas = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { cupom?: string | null } | undefined) => ({
    cupom: codigoDoCupom(input?.cupom) || null,
  }))
  .handler(async ({ data, context }): Promise<{ link: string }> => {
    soAdmin(context);
    const r = await chamarCheckout({
      action: "pacote",
      ownerId: context.ownerId,
      criadoPor: context.userId,
      cupom: data.cupom,
    });
    return { link: String(r.link) };
  });

/** Cancela a renovação. O que já foi pago vale até o fim do período. */
export const cancelarAssinatura = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }) => {
    soAdmin(context);
    await chamarCheckout({ action: "cancelar", ownerId: context.ownerId });
    return { ok: true };
  });

// ── O lado da plataforma ────────────────────────────────────────────────

export const listarPrecos = createServerFn({ method: "GET" })
  .middleware([exigePlataforma])
  .handler(async () => lerPrecos());

export const salvarPreco = createServerFn({ method: "POST" })
  .middleware([exigePlataforma])
  .inputValidator((input: { chave: string; valorReais: number; conversas?: number | null }) => {
    const valor = Math.round(Number(input.valorReais) * 100);
    if (!Number.isFinite(valor) || valor <= 0) throw new Error("Valor inválido.");
    const conversas =
      input.conversas === undefined || input.conversas === null
        ? null
        : Math.floor(Number(input.conversas));
    if (conversas !== null && (!Number.isFinite(conversas) || conversas <= 0)) {
      throw new Error("Quantidade de conversas inválida.");
    }
    return { chave: String(input.chave), valor, conversas };
  })
  .handler(async ({ data }) => {
    const campos: Record<string, unknown> = {
      valor_centavos: data.valor,
      atualizado_em: new Date().toISOString(),
    };
    if (data.conversas !== null) campos.conversas = data.conversas;
    const { error } = await (await admin())
      .from("plataforma_precos")
      .update(campos)
      .eq("chave", data.chave);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export interface PagamentoRecente {
  ownerId: string;
  tipo: string;
  status: string;
  valorCentavos: number | null;
  conversas: number | null;
  plano: string | null;
  ciclo: string | null;
  criadoEm: string;
}

export const listarPagamentos = createServerFn({ method: "GET" })
  .middleware([exigePlataforma])
  .handler(async (): Promise<PagamentoRecente[]> => {
    const { data, error } = await (await admin())
      .from("asaas_pagamentos")
      .select("owner_id, tipo, status, valor_centavos, conversas, plano, ciclo, criado_em")
      .neq("status", "aberto")
      .order("criado_em", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).map((p) => ({
      ownerId: String(p.owner_id),
      tipo: String(p.tipo),
      status: String(p.status),
      valorCentavos: p.valor_centavos === null ? null : Number(p.valor_centavos),
      conversas: p.conversas === null ? null : Number(p.conversas),
      plano: p.plano ?? null,
      ciclo: p.ciclo ?? null,
      criadoEm: p.criado_em,
    }));
  });

// ── Cupons ──────────────────────────────────────────────────────────────

export interface PreviaDoCupom {
  ok: boolean;
  motivo?: string;
  /** Preço com desconto, por chave de preço ("ia_mensal", "pacote_conversas"…). */
  precos?: Record<string, number>;
  soPrimeira?: boolean;
  descricao?: string;
}

/**
 * O que o cupom faz com cada preço, para a tela mostrar antes de abrir o
 * checkout. Quem decide de verdade é o `asaas-checkout`, de novo, na hora de
 * abrir: esta prévia não vale como desconto.
 */
export const verCupom = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { cupom: string }) => ({ cupom: codigoDoCupom(input.cupom) }))
  .handler(async ({ data }): Promise<PreviaDoCupom> => {
    if (!data.cupom) return { ok: false, motivo: "Digite o cupom." };
    const db = await admin();
    const { data: linha } = await db
      .from("plataforma_cupons")
      .select("*")
      .eq("codigo", data.cupom)
      .maybeSingle();
    const cupom = cupomDaLinha(linha);
    const agora = new Date();
    const precos: Record<string, number> = {};
    let motivo = "Cupom não encontrado.";
    let soPrimeira = false;
    for (const p of await lerPrecos()) {
      const uso = p.chave === "pacote_conversas" ? "pacote" : "assinatura";
      const av = avaliarCupom(cupom, uso, p.valorCentavos, agora);
      if (av.ok) {
        precos[p.chave] = av.valorFinalCentavos;
        soPrimeira = soPrimeira || av.soPrimeira;
      } else motivo = av.motivo;
    }
    if (!Object.keys(precos).length) return { ok: false, motivo };
    return { ok: true, precos, soPrimeira, descricao: String(linha?.descricao ?? "") };
  });

export interface CupomDaPlataforma {
  codigo: string;
  descricao: string;
  tipo: "percentual" | "valor";
  valor: number;
  aplicaEm: "assinatura" | "pacote" | "tudo";
  soPrimeira: boolean;
  validoAte: string | null;
  maxUsos: number | null;
  usos: number;
  ativo: boolean;
}

export const listarCupons = createServerFn({ method: "GET" })
  .middleware([exigePlataforma])
  .handler(async (): Promise<CupomDaPlataforma[]> => {
    const { data, error } = await (await admin())
      .from("plataforma_cupons")
      .select("*")
      .order("criado_em", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).map((l) => ({
      ...cupomDaLinha(l)!,
      descricao: String(l.descricao ?? ""),
    }));
  });

export const criarCupom = createServerFn({ method: "POST" })
  .middleware([exigePlataforma])
  .inputValidator(
    (input: {
      codigo: string;
      descricao?: string;
      tipo: "percentual" | "valor";
      valor: number;
      aplicaEm: "assinatura" | "pacote" | "tudo";
      soPrimeira: boolean;
      validoAte?: string | null;
      maxUsos?: number | null;
    }) => {
      const codigo = codigoDoCupom(input.codigo);
      if (!/^[A-Z0-9_-]{3,30}$/.test(codigo)) {
        throw new Error("O código tem de 3 a 30 letras, números, - ou _.");
      }
      const tipo = input.tipo === "valor" ? "valor" : "percentual";
      // Percentual em %, valor em reais: guardado em centavos.
      const valor =
        tipo === "percentual"
          ? Math.round(Number(input.valor))
          : Math.round(Number(input.valor) * 100);
      if (tipo === "percentual" && (valor < 1 || valor > 99)) {
        throw new Error("O percentual vai de 1 a 99.");
      }
      if (tipo === "valor" && !(valor > 0)) throw new Error("Valor inválido.");
      const maxUsos =
        input.maxUsos === null || input.maxUsos === undefined || !Number(input.maxUsos)
          ? null
          : Math.floor(Number(input.maxUsos));
      const validoAte = input.validoAte ? new Date(input.validoAte) : null;
      if (validoAte && Number.isNaN(validoAte.getTime())) throw new Error("Data inválida.");
      return {
        codigo,
        descricao:
          String(input.descricao ?? "")
            .trim()
            .slice(0, 120) || null,
        tipo,
        valor,
        aplicaEm: ["assinatura", "pacote"].includes(input.aplicaEm) ? input.aplicaEm : "tudo",
        soPrimeira: !!input.soPrimeira,
        validoAte: validoAte ? validoAte.toISOString() : null,
        maxUsos,
      };
    },
  )
  .handler(async ({ data }) => {
    const { error } = await (await admin()).from("plataforma_cupons").insert({
      codigo: data.codigo,
      descricao: data.descricao,
      tipo: data.tipo,
      valor: data.valor,
      aplica_em: data.aplicaEm,
      so_primeira: data.soPrimeira,
      valido_ate: data.validoAte,
      max_usos: data.maxUsos,
    });
    if (error) {
      throw new Error(
        /duplicate|unique/i.test(error.message)
          ? "Já existe um cupom com esse código."
          : error.message,
      );
    }
    return { ok: true };
  });

export const ligarCupom = createServerFn({ method: "POST" })
  .middleware([exigePlataforma])
  .inputValidator((input: { codigo: string; ativo: boolean }) => ({
    codigo: codigoDoCupom(input.codigo),
    ativo: !!input.ativo,
  }))
  .handler(async ({ data }) => {
    const { error } = await (await admin())
      .from("plataforma_cupons")
      .update({ ativo: data.ativo })
      .eq("codigo", data.codigo);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
