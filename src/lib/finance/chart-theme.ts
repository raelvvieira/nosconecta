// Tema único dos gráficos.
//
// Antes cada gráfico trazia a própria paleta: `CashFlowChart` em oklch,
// `RevenueByProcedure` em outro oklch, `ProjectionSummaryCard` misturando hsl
// e oklch, `recebimentos` e `pipeline` em hex. Cinco paletas na mesma tela do
// mesmo produto — e os tokens `--chart-1..5`, que existem desde sempre, quase
// sem uso.
//
// Aqui as séries têm PAPEL, não número: quem lê "entrada" escolhe a cor de
// entrada, e não `chart-2`. Isso é o que impede a mesma grandeza de aparecer
// verde num gráfico e roxa no de baixo.
//
// Só o coral da marca é primário. A regra do padrão é explícita: a cor da
// marca marca a série principal, não todas — se tudo é laranja, nada é.

/** Séries por papel. Valores em token: mudar a paleta é mudar `styles.css`. */
export const CHART_SERIES = {
  /** Receita, entrada, o número que a clínica quer ver subir. É a série da marca. */
  entrada: "var(--chart-1)",
  /** Despesa, saída. Vermelho de perigo, o mesmo do resto do app. */
  saida: "var(--danger)",
  /** O que ainda vai entrar — previsto, não realizado. */
  previsto: "var(--chart-4)",
  /** Saldo, projeção acumulada. */
  saldo: "var(--chart-2)",
  /** Meta cadastrada pela clínica. Neutra de propósito: meta não é resultado. */
  meta: "var(--muted-foreground)",
} as const;

/** Paleta categórica, para fatias sem papel fixo (procedimento, profissional).
 *  A ordem importa: a primeira é a de maior valor, e é a da marca. */
export const CHART_CATEGORICAL = [
  "var(--chart-1)",
  "var(--chart-4)",
  "var(--chart-2)",
  "var(--chart-5)",
  "var(--chart-3)",
  "var(--info)",
] as const;

export function corCategorica(indice: number): string {
  return CHART_CATEGORICAL[indice % CHART_CATEGORICAL.length];
}

/** Cromo do gráfico: grade, eixo e linha de referência. Discreto de propósito —
 *  a grade orienta, não compete com o dado. */
export const CHART_AXIS = {
  grid: "var(--border)",
  tick: "var(--muted-foreground)",
  zero: "var(--divider)",
} as const;

/** Tamanho do rótulo de eixo, igual em todos os gráficos. */
export const CHART_TICK_FONT_SIZE = "0.6875rem";
