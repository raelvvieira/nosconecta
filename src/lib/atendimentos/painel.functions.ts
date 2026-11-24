import { createServerFn } from "@tanstack/react-start";
import { exigeAtendimentos } from "@/lib/auth/area.middleware";
import { podeVerArea } from "@/lib/auth/niveis-de-acesso";
import {
  montarPainelDoAtendimento,
  montarPicoDaSemana,
  type PainelDoAtendimento,
} from "@/lib/atendimentos/painel/montar";
import type { FiltroDePeriodo, PicoDaSemana } from "@/lib/atendimentos/painel/metricas";

export type { PainelDoAtendimento } from "@/lib/atendimentos/painel/montar";
export type { PicoDaSemana } from "@/lib/atendimentos/painel/metricas";

const FILTROS: FiltroDePeriodo[] = ["hoje", "ontem", "7d", "30d", "mes", "mes_passado", "90d"];

/** O painel do Dashboard de Atendimentos: números do período escolhido. */
export const getPainelDoAtendimento = createServerFn({ method: "GET" })
  .middleware([exigeAtendimentos])
  .inputValidator((input: { filtro?: FiltroDePeriodo }) => ({
    filtro: FILTROS.includes(input?.filtro as FiltroDePeriodo)
      ? (input.filtro as FiltroDePeriodo)
      : ("hoje" as FiltroDePeriodo),
  }))
  .handler(
    async ({ data, context }): Promise<PainelDoAtendimento> =>
      // A receita por dentista é dinheiro: só aparece para quem tem o financeiro.
      montarPainelDoAtendimento(
        context.supabase,
        context.ownerId,
        data.filtro,
        Date.now(),
        podeVerArea(context.memberRole, "financeiro"),
      ),
  );

/** O mapa de calor da semana: quatro semanas de mensagens, sempre. */
export const getPicoDaSemana = createServerFn({ method: "GET" })
  .middleware([exigeAtendimentos])
  .handler(
    async ({ context }): Promise<PicoDaSemana> =>
      montarPicoDaSemana(context.supabase, context.ownerId),
  );
