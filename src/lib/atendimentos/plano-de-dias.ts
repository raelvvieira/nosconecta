// Em quantos dias uma campanha cabe, e quantos contatos vão em cada um.
//
// ── O laço que a clínica fazia na mão ──────────────────────────────────────
//
// O limite é de 200 contatos por dia e a base é maior. Até aqui alguém mandava
// 200, voltava no dia seguinte, mandava mais 200 — `calcularLote`
// (`loteDeDisparo.ts`) existe para calcular "quantos cabem agora" e a tela
// dizia "Cota de hoje esgotada". Esta função é esse mesmo laço, feito uma vez
// na criação em vez de à mão, dia após dia.
//
// ── Por que o que já está reservado entra na conta ─────────────────────────
//
// Programar a campanha B para o dia 20 não pode atropelar a campanha A que já
// estava marcada para o dia 20. O plano enxerga o que cada dia já deve e usa
// só a sobra — senão as duas sairiam juntas, estourariam o limite, e metade
// das mensagens falharia no dia, que é o pior momento para descobrir.
//
// ── Por que sem `Date` ─────────────────────────────────────────────────────
//
// Dia é calendário, não relógio. `new Date("2026-10-20")` é meia-noite em UTC,
// que no Brasil ainda é dia 19 — e o plano inteiro andaria um dia para trás,
// calado. Mesma razão de `src/lib/finance/mes.ts`.
//
// ── O gêmeo ────────────────────────────────────────────────────────────────
//
// `supabase/functions/_shared/plano-de-dias.ts` é a cópia que roda em Deno.
// Deno e `src/` não se importam entre si, e as duas precisam responder igual:
// a tela MOSTRA o plano antes de confirmar, e a Edge Function GRAVA por ele.
// Divergindo, a clínica aprova uma divisão e o sistema executa outra. É cópia
// consciente, como `cota.ts` já é.

export interface DiaDoPlano {
  /** "AAAA-MM-DD", no calendário da clínica. */
  dia: string;
  /** Quantos contatos saem neste dia. Nunca zero. */
  quantos: number;
}

export interface PlanoDeDias {
  dias: DiaDoPlano[];
  /** A lista inteira coube. `false` quando o teto de dias foi alcançado antes. */
  cobreTudo: boolean;
  /** Quantos ficaram de fora. Zero quando `cobreTudo`. */
  sobraram: number;
}

/**
 * Teto de dias que um plano pode ocupar.
 *
 * Não é só defesa contra laço infinito — é uma decisão: uma campanha que
 * levaria quatro meses para sair não é uma campanha, é outra coisa, e quem
 * está criando precisa saber disso antes de confirmar em vez de descobrir
 * numa lista com 120 linhas.
 */
export const MAX_DIAS = 60;

const FORMATO = /^(\d{4})-(\d{2})-(\d{2})$/;

function bissexto(ano: number): boolean {
  return ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0);
}

function diasNoMes(ano: number, mes: number): number {
  if (mes === 2) return bissexto(ano) ? 29 : 28;
  return [4, 6, 9, 11].includes(mes) ? 30 : 31;
}

/** "2026-10-31" → "2026-11-01". Devolve "" para o que não for um dia. */
export function proximoDia(dia: string): string {
  const m = FORMATO.exec(String(dia ?? "").trim());
  if (!m) return "";
  let [ano, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mes < 1 || mes > 12 || d < 1 || d > diasNoMes(ano, mes)) return "";
  d += 1;
  if (d > diasNoMes(ano, mes)) {
    d = 1;
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * O plano: quantos contatos em cada dia, respeitando o limite e o que já está
 * reservado.
 *
 * Um dia sem sobra nenhuma é PULADO, não aparece com zero: zero não é um dia
 * de envio, e mostrá-lo na tela faria a clínica contar dias que não existem.
 * Mas ele consome o teto de `MAX_DIAS` do mesmo jeito, porque o calendário
 * andou.
 */
export function planoDeDias({
  total,
  limitePorDia,
  reservadoPorDia = {},
  diaInicial,
  maxDias = MAX_DIAS,
}: {
  total: number;
  limitePorDia: number;
  /** O que cada dia JÁ deve, por outras campanhas. Chave "AAAA-MM-DD". */
  reservadoPorDia?: Record<string, number>;
  diaInicial: string;
  maxDias?: number;
}): PlanoDeDias {
  const vazio = (sobraram: number): PlanoDeDias => ({
    dias: [],
    cobreTudo: sobraram <= 0,
    sobraram: Math.max(0, sobraram),
  });

  const quanto = Math.trunc(Number(total));
  if (!Number.isFinite(quanto) || quanto <= 0) return vazio(0);

  const limite = Math.trunc(Number(limitePorDia));
  // Limite zero ou negativo não divide em dia nenhum. Sem esta saída, o laço
  // andaria até `maxDias` emitindo nada e devolveria um plano vazio depois de
  // 60 voltas — mesmo resultado, com a aparência de bug.
  if (!Number.isFinite(limite) || limite <= 0) return vazio(quanto);

  if (!proximoDia(diaInicial)) return vazio(quanto);

  const dias: DiaDoPlano[] = [];
  let restante = quanto;
  let dia = diaInicial;

  for (let i = 0; i < Math.max(1, Math.trunc(maxDias)) && restante > 0; i++) {
    const jaDeve = Math.max(0, Math.trunc(Number(reservadoPorDia[dia] ?? 0)) || 0);
    const sobra = limite - jaDeve;
    if (sobra > 0) {
      const quantos = Math.min(sobra, restante);
      dias.push({ dia, quantos });
      restante -= quantos;
    }
    if (restante > 0) dia = proximoDia(dia);
  }

  return { dias, cobreTudo: restante === 0, sobraram: restante };
}

/** "dia 20: 200 · dia 21: 200 · dia 22: 100" — o plano em uma linha. */
export function resumoDoPlano(plano: PlanoDeDias): string {
  return plano.dias
    .map((d) => {
      const [, , dd] = d.dia.split("-");
      return `dia ${dd}: ${d.quantos}`;
    })
    .join(" · ");
}
