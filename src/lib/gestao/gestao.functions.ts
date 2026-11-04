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
