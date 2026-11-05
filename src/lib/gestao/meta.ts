// A conta da meta de faturamento do mês. Pura, como `indicadores.ts`.
import { diasUteisEntre, mesDe } from "@/lib/agenda/resumo-da-agenda";

export interface MetaDoMes {
  meta: number;
  faturado: number;
  /** Quanto da meta já foi, em %. Pode passar de 100. */
  pct: number;
  faltam: number;
  /** Quanto já deveria ter sido faturado até hoje, no ritmo dos dias úteis. */
  esperadoAteHoje: number;
  noRitmo: boolean;
  /** Onde o mês fecha se o ritmo de agora continuar. Só no mês em andamento. */
  projecao: number | null;
  /** Atendimentos que faltam ao ticket médio do mês. Nulo sem ticket. */
  atendimentosQueFaltam: number | null;
  emAndamento: boolean;
  atingida: boolean;
}

/**
 * `mes` é "AAAA-MM", `hoje` é "AAAA-MM-DD". Os dias úteis (segunda a sexta)
 * medem o ritmo: faturamento não cai igual todo dia corrido, e domingo não
 * atende.
 */
export function metaDoMes(entrada: {
  meta: number;
  faturado: number;
  ticketMedio: number | null;
  mes: string;
  hoje: string;
}): MetaDoMes {
  const { meta, faturado, ticketMedio, mes, hoje } = entrada;
  const { de, ate } = mesDe(`${mes}-01`);
  const emAndamento = hoje >= de && hoje <= ate;
  const totalUteis = diasUteisEntre(de, ate);
  const passados = hoje < de ? 0 : diasUteisEntre(de, hoje > ate ? ate : hoje);
  const esperadoAteHoje = totalUteis ? (meta * passados) / totalUteis : 0;
  const faltam = Math.max(0, meta - faturado);
  return {
    meta,
    faturado,
    pct: meta > 0 ? (faturado / meta) * 100 : 0,
    faltam,
    esperadoAteHoje,
    noRitmo: hoje > ate ? faturado >= meta : faturado >= esperadoAteHoje,
    projecao: emAndamento && passados > 0 ? (faturado / passados) * totalUteis : null,
    atendimentosQueFaltam: ticketMedio && ticketMedio > 0 ? Math.ceil(faltam / ticketMedio) : null,
    emAndamento,
    atingida: faturado >= meta,
  };
}
