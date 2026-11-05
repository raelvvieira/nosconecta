import { createServerFn } from "@tanstack/react-start";
import { exigeGestao } from "@/lib/auth/area.middleware";
import { montarVisaoDeGestao, type VisaoDeGestao } from "@/lib/gestao/visao";

export type { PontoDaEvolucao, UnidadeNoPainel, VisaoDeGestao } from "@/lib/gestao/visao";

// O painel de Gestão. Só o administrador chama (`exigeGestao`); a montagem
// está em `visao.ts`, que lê a mesma DRE do Financeiro.
export const getVisaoDeGestao = createServerFn({ method: "GET" })
  .middleware([exigeGestao])
  .inputValidator((input: { mes: string; unitId?: string | null }) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(input?.mes ?? ""))) throw new Error("Mês inválido.");
    return { mes: input.mes, unitId: input.unitId || null };
  })
  .handler(
    async ({ data, context }): Promise<VisaoDeGestao> =>
      montarVisaoDeGestao(context.supabase, context.ownerId, data),
  );

/** Cadastra (ou troca) a meta de faturamento mensal. Só o administrador: a
 *  regra também está no banco (`gestao_metas`). `valor` nulo apaga a meta. */
export const salvarMetaDeFaturamento = createServerFn({ method: "POST" })
  .middleware([exigeGestao])
  .inputValidator((input: { valor: number | null }) => {
    const valor = input?.valor;
    if (valor === null) return { valor: null };
    if (typeof valor !== "number" || !Number.isFinite(valor) || valor <= 0 || valor > 100_000_000)
      throw new Error("Informe um valor maior que zero.");
    return { valor: Math.round(valor * 100) / 100 };
  })
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    if (data.valor === null) {
      const { error } = await supabase
        .from("gestao_metas")
        .delete()
        .eq("owner_id", context.ownerId);
      if (error) throw new Error(error.message);
      return { valor: null };
    }
    const { error } = await supabase.from("gestao_metas").upsert({
      owner_id: context.ownerId,
      faturamento_mensal: data.valor,
      atualizado_em: new Date().toISOString(),
      atualizado_por: context.userId,
    });
    if (error) throw new Error(error.message);
    return { valor: data.valor };
  });
