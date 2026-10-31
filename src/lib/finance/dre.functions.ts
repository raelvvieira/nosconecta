/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { exigeFinanceiro } from "@/lib/auth/area.middleware";
import { somarMeses } from "@/lib/finance/mes";
import {
  GRUPOS_DRE,
  montarDre,
  type Dre,
  type GrupoDre,
  type LancamentoDoDre,
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
    const de = `${meses[0]}-01`;
    // Até o fim do último mês. No regime de caixa o pagamento pode cair
    // depois do vencimento, então a busca vai um pouco além e `montarDre`
    // descarta o que ficar fora dos meses pedidos.
    const ate = `${somarMeses(data.ate, 1)}-01`;

    let categoriasRes = await supabase
      .from("financial_categories")
      .select("id, name, type, grupo_dre")
      .eq("owner_id", context.ownerId)
      .order("name");
    let semColunaDeGrupo = false;
    if (categoriasRes.error && faltaColuna(categoriasRes.error, "grupo_dre")) {
      semColunaDeGrupo = true;
      categoriasRes = await supabase
        .from("financial_categories")
        .select("id, name, type")
        .eq("owner_id", context.ownerId)
        .order("name");
    }
    if (categoriasRes.error) throw new Error(categoriasRes.error.message);

    const categorias: CategoriaDoDre[] = (categoriasRes.data ?? []).map((c: any) => ({
      id: String(c.id),
      nome: String(c.name ?? ""),
      tipo: c.type === "income" ? "income" : "expense",
      grupo: GRUPOS_DRE.some((g) => g.id === c.grupo_dre) ? (c.grupo_dre as GrupoDre) : null,
    }));
    const porId = new Map(categorias.map((c) => [c.id, c]));

    // Paginado: um ano de lançamentos passa de mil linhas, que é o teto por
    // ida ao PostgREST.
    const lancamentos: LancamentoDoDre[] = [];
    for (let pagina = 0; ; pagina++) {
      let q = supabase
        .from("financial_transactions")
        .select("type, status, amount, due_date, paid_date, category_id")
        .eq("owner_id", context.ownerId)
        .neq("status", "cancelled")
        // Qualquer uma das duas datas dentro do período: a competência olha o
        // vencimento, o caixa olha o pagamento.
        .or(
          `and(due_date.gte.${de},due_date.lt.${ate}),and(paid_date.gte.${de},paid_date.lt.${ate})`,
        )
        .range(pagina * 1000, (pagina + 1) * 1000 - 1);
      if (context.unitId) q = q.eq("unit_id", context.unitId);
      const { data: linhas, error } = await q;
      if (error) throw new Error(error.message);
      for (const t of linhas ?? []) {
        const cat = t.category_id ? porId.get(String(t.category_id)) : undefined;
        lancamentos.push({
          tipo: t.type === "receivable" ? "receivable" : "payable",
          status: String(t.status ?? ""),
          amount: Number(t.amount ?? 0),
          dueDate: String(t.due_date ?? ""),
          paidDate: t.paid_date ? String(t.paid_date) : null,
          categoriaId: cat?.id ?? null,
          categoriaNome: cat?.nome ?? null,
          grupo: cat?.grupo ?? null,
        });
      }
      if (!linhas || linhas.length < 1000) break;
    }

    return { dre: montarDre(lancamentos, meses, data.regime), categorias, semColunaDeGrupo };
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
