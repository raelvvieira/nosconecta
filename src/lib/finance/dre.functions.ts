/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { exigeFinanceiro } from "@/lib/auth/area.middleware";
import { somarMeses } from "@/lib/finance/mes";
import { temColunasDeCartao } from "@/lib/finance/schema-cartao";
import {
  GRUPOS_DRE,
  gastosDoPeriodo,
  grupoDoLancamento,
  mesDoLancamento,
  montarDre,
  resolverFaturas,
  type Dre,
  type GastosDoPeriodo,
  type GrupoDre,
  type LancamentoBruto,
  type Regime,
} from "@/lib/finance/dre";

// O DRE, lido do banco. A conta inteira mora em `dre.ts`; aqui só a busca.

export interface CategoriaDoDre {
  id: string;
  nome: string;
  tipo: "income" | "expense";
  /** Nulo enquanto ninguém classificou: o DRE usa o palpite por nome. */
  grupo: GrupoDre | null;
}

export interface DreDoPeriodo {
  dre: Dre;
  categorias: CategoriaDoDre[];
  /** `true` enquanto a migration da coluna `grupo_dre` não foi aplicada. */
  semColunaDeGrupo: boolean;
}

/** A coluna `grupo_dre` ainda não existe (migration pendente)? */
function faltaColuna(error: any, coluna: string): boolean {
  return (
    !!error &&
    (error.code === "42703" ||
      new RegExp(`${coluna}.*does not exist`).test(String(error.message ?? "")))
  );
}

/** Até quantos meses para trás o relatório mostra. */
const MAXIMO_DE_MESES = 24;

interface Categoria {
  id: string;
  nome: string;
  tipo: "income" | "expense";
  grupo: GrupoDre | null;
}

async function lerCategorias(
  supabase: any,
  ownerId: string,
): Promise<{ categorias: Categoria[]; semColunaDeGrupo: boolean }> {
  let res = await supabase
    .from("financial_categories")
    .select("id, name, type, grupo_dre")
    .eq("owner_id", ownerId)
    .order("name");
  let semColunaDeGrupo = false;
  if (res.error && faltaColuna(res.error, "grupo_dre")) {
    semColunaDeGrupo = true;
    res = await supabase
      .from("financial_categories")
      .select("id, name, type")
      .eq("owner_id", ownerId)
      .order("name");
  }
  if (res.error) throw new Error(res.error.message);
  const categorias: Categoria[] = (res.data ?? []).map((c: any) => ({
    id: String(c.id),
    nome: String(c.name ?? ""),
    tipo: c.type === "income" ? "income" : "expense",
    grupo: GRUPOS_DRE.some((g) => g.id === c.grupo_dre) ? (c.grupo_dre as GrupoDre) : null,
  }));
  return { categorias, semColunaDeGrupo };
}

/** Um lançamento como o DRE o lê, com o que a lista de detalhe mostra. */
export interface LancamentoLido extends LancamentoBruto {
  id: string;
  descricao: string;
  fornecedor: string | null;
}

/**
 * Os lançamentos de um intervalo de dias, já com a regra do cartão aplicada
 * (`resolverFaturas`): a fatura some e as compras herdam o pagamento dela.
 *
 * A busca vai um mês além dos dois lados, porque a compra conta no dia em
 * que a FATURA foi paga, que pode cair fora do mês do vencimento. Quem
 * chama descarta o que ficar fora do que pediu.
 */
async function lerLancamentos(
  supabase: any,
  ownerId: string,
  unitId: string | null | undefined,
  de: string,
  ate: string,
  porId: Map<string, Categoria>,
): Promise<LancamentoLido[]> {
  const cartao = await temColunasDeCartao(supabase);
  const deLargo = `${somarMeses(de.slice(0, 7), -1)}-01`;
  const ateLargo = `${somarMeses(ate.slice(0, 7), 2)}-01`;
  const colunas =
    "id, type, status, amount, due_date, paid_date, category_id, description, supplier_name" +
    (cartao ? ", card_invoice_id, settles_card_invoice_id" : "");

  // Paginado: um ano de lançamentos passa de mil linhas, que é o teto por
  // ida ao PostgREST.
  const brutos: LancamentoLido[] = [];
  for (let pagina = 0; ; pagina++) {
    let q = supabase
      .from("financial_transactions")
      .select(colunas)
      .eq("owner_id", ownerId)
      .neq("status", "cancelled")
      // Qualquer uma das duas datas dentro da janela: a competência olha o
      // vencimento, o caixa olha o pagamento.
      .or(
        `and(due_date.gte.${deLargo},due_date.lt.${ateLargo}),and(paid_date.gte.${deLargo},paid_date.lt.${ateLargo})`,
      )
      .range(pagina * 1000, (pagina + 1) * 1000 - 1);
    if (unitId) q = q.eq("unit_id", unitId);
    const { data: linhas, error } = await q;
    if (error) throw new Error(error.message);
    for (const t of linhas ?? []) {
      const cat = t.category_id ? porId.get(String(t.category_id)) : undefined;
      brutos.push({
        id: String(t.id),
        descricao: String(t.description ?? ""),
        fornecedor: t.supplier_name ? String(t.supplier_name) : null,
        tipo: t.type === "receivable" ? "receivable" : "payable",
        status: String(t.status ?? ""),
        amount: Number(t.amount ?? 0),
        dueDate: String(t.due_date ?? ""),
        paidDate: t.paid_date ? String(t.paid_date) : null,
        categoriaId: cat?.id ?? null,
        categoriaNome: cat?.nome ?? null,
        grupo: cat?.grupo ?? null,
        faturaId: t.card_invoice_id ? String(t.card_invoice_id) : null,
        quitaFaturaId: t.settles_card_invoice_id ? String(t.settles_card_invoice_id) : null,
      });
    }
    if (!linhas || linhas.length < 1000) break;
  }
  return resolverFaturas(brutos);
}

export const getDre = createServerFn({ method: "GET" })
  .middleware([exigeFinanceiro])
  .inputValidator((input: { ate: string; meses: number; regime: Regime }) => {
    if (!/^\d{4}-\d{2}$/.test(input.ate)) throw new Error("Mês inválido.");
    const meses = Math.min(MAXIMO_DE_MESES, Math.max(1, Math.trunc(Number(input.meses) || 6)));
    const regime: Regime = input.regime === "competencia" ? "competencia" : "caixa";
    return { ate: input.ate, meses, regime };
  })
  .handler(async ({ data, context }): Promise<DreDoPeriodo> => {
    const supabase: any = context.supabase;
    const meses: string[] = [];
    for (let i = data.meses - 1; i >= 0; i--) meses.push(somarMeses(data.ate, -i));
    const { categorias, semColunaDeGrupo } = await lerCategorias(supabase, context.ownerId);
    const porId = new Map(categorias.map((c) => [c.id, c]));
    const lancamentos = await lerLancamentos(
      supabase,
      context.ownerId,
      context.unitId,
      `${meses[0]}-01`,
      `${data.ate}-01`,
      porId,
    );
    return { dre: montarDre(lancamentos, meses, data.regime), categorias, semColunaDeGrupo };
  });

export interface LancamentoDaCelula {
  id: string;
  descricao: string;
  /** O dia que contou no regime pedido (pagamento no caixa, vencimento na competência). */
  dia: string;
  valor: number;
  status: string;
  fornecedor: string | null;
}

/**
 * O que compõe uma célula do DRE: os lançamentos de um grupo (ou de uma
 * categoria dele) num mês, no mesmo regime. É a "setinha" da tabela.
 */
export const getLancamentosDaCelula = createServerFn({ method: "GET" })
  .middleware([exigeFinanceiro])
  .inputValidator(
    (input: { mes: string; regime: Regime; grupo: GrupoDre; categoriaId?: string | null }) => {
      if (!/^\d{4}-\d{2}$/.test(input.mes)) throw new Error("Mês inválido.");
      if (!GRUPOS_DRE.some((g) => g.id === input.grupo)) throw new Error("Grupo inválido.");
      const regime: Regime = input.regime === "competencia" ? "competencia" : "caixa";
      return {
        mes: input.mes,
        regime,
        grupo: input.grupo,
        categoriaId: input.categoriaId === undefined ? undefined : (input.categoriaId ?? null),
      };
    },
  )
  .handler(async ({ data, context }): Promise<LancamentoDaCelula[]> => {
    const supabase: any = context.supabase;
    const { categorias } = await lerCategorias(supabase, context.ownerId);
    const porId = new Map(categorias.map((c) => [c.id, c]));
    const lancamentos = await lerLancamentos(
      supabase,
      context.ownerId,
      context.unitId,
      `${data.mes}-01`,
      `${data.mes}-01`,
      porId,
    );
    const saida: LancamentoDaCelula[] = [];
    for (const l of lancamentos) {
      // A mesma régua de `montarDre`: mês e grupo têm de bater com a célula.
      if (mesDoLancamento(l, data.regime) !== data.mes) continue;
      if (grupoDoLancamento(l) !== data.grupo) continue;
      if (data.categoriaId !== undefined && l.categoriaId !== data.categoriaId) continue;
      saida.push({
        id: l.id,
        descricao: l.descricao,
        dia: data.regime === "caixa" ? (l.paidDate ?? l.dueDate) : l.dueDate,
        valor: Math.round(l.amount * 100) / 100,
        status: l.status,
        fornecedor: l.fornecedor,
      });
    }
    saida.sort((a, b) => b.valor - a.valor);
    return saida;
  });

export interface GastosComparados {
  de: string;
  ate: string;
  atual: GastosDoPeriodo;
  /** O intervalo anterior, do mesmo tamanho. */
  anterior: GastosDoPeriodo;
}

/**
 * Para onde foi o dinheiro num intervalo de dias, e no intervalo anterior do
 * mesmo tamanho. Segue o período escolhido na tela do Financeiro.
 */
export const getGastosDoPeriodo = createServerFn({ method: "GET" })
  .middleware([exigeFinanceiro])
  .inputValidator((input: { de: string; ate: string }) => {
    const dia = /^\d{4}-\d{2}-\d{2}$/;
    if (!dia.test(input.de) || !dia.test(input.ate) || input.de > input.ate)
      throw new Error("Período inválido.");
    return { de: input.de, ate: input.ate };
  })
  .handler(async ({ data, context }): Promise<GastosComparados> => {
    const supabase: any = context.supabase;
    const { categorias } = await lerCategorias(supabase, context.ownerId);
    const porId = new Map(categorias.map((c) => [c.id, c]));
    // O intervalo anterior: a mesma quantidade de dias, terminando na véspera.
    const dias = Math.round((Date.parse(data.ate) - Date.parse(data.de)) / 86_400_000) + 1;
    const diaAntes = (iso: string, n: number) =>
      new Date(Date.parse(iso) - n * 86_400_000).toISOString().slice(0, 10);
    const anteriorAte = diaAntes(data.de, 1);
    const anteriorDe = diaAntes(data.de, dias);
    const lancamentos = await lerLancamentos(
      supabase,
      context.ownerId,
      context.unitId,
      anteriorDe,
      data.ate,
      porId,
    );
    return {
      de: data.de,
      ate: data.ate,
      atual: gastosDoPeriodo(lancamentos, data.de, data.ate),
      anterior: gastosDoPeriodo(lancamentos, anteriorDe, anteriorAte),
    };
  });

export const definirGrupoDaCategoria = createServerFn({ method: "POST" })
  .middleware([exigeFinanceiro])
  .inputValidator((input: { id: string; grupo: GrupoDre }) => {
    if (!input.id) throw new Error("Categoria inválida.");
    if (!GRUPOS_DRE.some((g) => g.id === input.grupo)) throw new Error("Grupo inválido.");
    return input;
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("financial_categories")
      .update({ grupo_dre: data.grupo } as any)
      .eq("id", data.id)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
