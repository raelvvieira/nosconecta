/* eslint-disable @typescript-eslint/no-explicit-any -- tabelas novas, fora do types.ts do Lovable */
import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { exigePlataforma } from "@/lib/plataforma/plataforma.functions";

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

async function clienteDe(userId: string): Promise<Record<string, string | null>> {
  const { data } = await (await admin())
    .from("clinic_members")
    .select("name, email, phone")
    .eq("user_id", userId)
    .maybeSingle();
  return { nome: data?.name ?? null, email: data?.email ?? null, telefone: data?.phone ?? null };
}

/** Abre o checkout da assinatura e devolve o link do Asaas. */
export const assinarPlano = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { plano: Plano; ciclo: Ciclo }) => {
    if (input.plano !== "basico" && input.plano !== "ia") throw new Error("Plano inválido.");
    if (input.ciclo !== "mensal" && input.ciclo !== "anual") throw new Error("Ciclo inválido.");
    return { plano: input.plano, ciclo: input.ciclo };
  })
  .handler(async ({ data, context }): Promise<{ link: string }> => {
    soAdmin(context);
    const r = await chamarCheckout({
      action: "assinar",
      ownerId: context.ownerId,
      plano: data.plano,
      ciclo: data.ciclo,
      criadoPor: context.userId,
      cliente: await clienteDe(context.userId),
    });
    return { link: String(r.link) };
  });

/** Abre o checkout do pacote de conversas. */
export const comprarConversas = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<{ link: string }> => {
    soAdmin(context);
    const r = await chamarCheckout({
      action: "pacote",
      ownerId: context.ownerId,
      criadoPor: context.userId,
      cliente: await clienteDe(context.userId),
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
