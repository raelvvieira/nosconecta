/**
 * Em qual fatura cai uma compra no cartão.
 *
 * ── Por que isto existe ───────────────────────────────────────────────────
 *
 * Compra no crédito não é saída de caixa no dia da compra. Ela entra numa
 * fatura e sai, somada com todas as outras, uma vez por mês, no vencimento.
 * Quem decide em qual fatura ela cai são dois dias configurados no cartão:
 *
 *   FECHAMENTO — o dia em que a fatura para de aceitar compras.
 *   VENCIMENTO — o dia em que a fatura fechada é paga.
 *
 * Fecha 25 e vence 5: as compras de 26/jan a 25/fev formam a fatura que fecha
 * em 25/fev e vence em 05/mar.
 *
 * ── Por que aritmética inteira de meses, e não `addMonths` ───────────────
 *
 * O `addMonths` de `@/lib/date` usa `Date.setMonth`, que transborda de
 * propósito: 31/01 + 1 mês = 03/03. Andar doze faturas a partir de um
 * fechamento no dia 31 derivaria permanentemente — 03/03, 03/04, 03/05 — e
 * cada parcela cairia num mês que não é o dela.
 *
 * Aqui o mês é um inteiro (`ano * 12 + mês`) e o DIA só é resolvido no final,
 * aparado ao último dia daquele mês. Fevereiro nunca contamina o mês seguinte.
 *
 * ── O que este módulo não faz ────────────────────────────────────────────
 *
 * Não conhece feriado nem fim de semana. Vencimento que cai num sábado fica no
 * sábado. Bancos costumam empurrar para o próximo dia útil; isso é uma decisão
 * à parte, e fazê-la aqui esconderia a regra de quem lê.
 */

/** Quantos dias tem o mês. `mes0` é base zero, como no `Date`. */
function diasNoMes(ano: number, mes0: number): number {
  return new Date(ano, mes0 + 1, 0).getDate();
}

/**
 * "YYYY-MM-DD" com o dia aparado ao último dia do mês.
 *
 * Dia 31 em fevereiro não existe, e deixar o `Date` resolver isso devolveria
 * 03/03 — a data escorregaria para o mês seguinte, que é justamente o erro que
 * este módulo evita.
 */
function comDiaAparado(ano: number, mes0: number, dia: number): string {
  const d = Math.min(Math.max(dia, 1), diasNoMes(ano, mes0));
  return `${ano}-${String(mes0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Competência (`ano * 12 + mês`) de volta em ano e mês base zero. */
function doIndice(t: number): { ano: number; mes0: number } {
  return { ano: Math.floor(t / 12), mes0: t % 12 };
}

export interface DatasDaFatura {
  /** Dia em que essa fatura fechou (ou fecha). */
  fechamento: string;
  /** Dia em que ela é paga — o único em que dinheiro sai da conta. */
  vencimento: string;
}

/**
 * As datas da fatura que recebe uma compra.
 *
 * `parcela` desloca a fatura: 0 é a primeira parcela (ou a compra à vista no
 * crédito), 1 é a segunda, e assim por diante.
 *
 * Convenção: compra feita **no** dia do fechamento entra **nessa** fatura.
 * Bancos divergem; para inverter, troque o `>` por `>=` na comparação marcada.
 */
export function faturaDaCompra(
  dataDaCompra: string,
  diaDeFechamento: number,
  diaDeVencimento: number,
  parcela = 0,
): DatasDaFatura {
  const [ano, mes, dia] = dataDaCompra.split("-").map(Number);

  let t = ano * 12 + (mes - 1);

  // O fechamento DESTE mês, já aparado — comprar dia 30 num mês que fecha 31
  // não pode empurrar para a fatura seguinte só porque fevereiro é curto.
  const fechamentoDoMes = Math.min(diaDeFechamento, diasNoMes(ano, mes - 1));
  if (dia > fechamentoDoMes) t += 1; // ← passou do fechamento: próxima fatura

  t += parcela;

  const f = doIndice(t);
  const fechamento = comDiaAparado(f.ano, f.mes0, diaDeFechamento);

  // Vence no mesmo mês quando o dia de vencimento vem DEPOIS do de fechamento;
  // no mês seguinte quando vem antes ou no mesmo dia.
  //
  // A comparação é entre os dias CONFIGURADOS, não entre os já aparados: em
  // fevereiro, "fecha 30 / vence 31" viraria 28 e 28, e comparar os aparados
  // faria o vencimento pular um mês só nesse mês.
  let tv = t + (diaDeVencimento <= diaDeFechamento ? 1 : 0);
  let v = doIndice(tv);
  let vencimento = comDiaAparado(v.ano, v.mes0, diaDeVencimento);

  // O aparo pode ter empurrado o vencimento para cima do fechamento — fecha 28,
  // vence 30, em fevereiro os dois caem em 28. Uma fatura não pode vencer no
  // dia em que fecha, nem antes.
  if (vencimento <= fechamento) {
    tv += 1;
    v = doIndice(tv);
    vencimento = comDiaAparado(v.ano, v.mes0, diaDeVencimento);
  }

  return { fechamento, vencimento };
}

/**
 * As faturas de uma compra parcelada, uma por parcela, em ordem.
 *
 * Cada parcela cai na fatura seguinte à da anterior — nunca "a data da compra
 * mais N meses", que é como o parcelamento à vista funciona e que aqui daria
 * a fatura errada sempre que a compra caísse depois do fechamento.
 */
export function faturasDasParcelas(
  dataDaCompra: string,
  diaDeFechamento: number,
  diaDeVencimento: number,
  parcelas: number,
): DatasDaFatura[] {
  const n = Math.max(1, Math.floor(parcelas));
  return Array.from({ length: n }, (_, i) =>
    faturaDaCompra(dataDaCompra, diaDeFechamento, diaDeVencimento, i),
  );
}

/**
 * O rateio de uma compra parcelada, em centavos exatos.
 *
 * A última parcela absorve a sobra do arredondamento — mesma regra que o
 * `createPayable` já usa, para que R$ 100,00 em 3x continue somando R$ 100,00
 * e não R$ 99,99.
 */
export function valorDasParcelas(total: number, parcelas: number): number[] {
  const n = Math.max(1, Math.floor(parcelas));
  const centavos = Math.round(total * 100);
  const base = Math.floor(centavos / n);
  const valores = Array.from({ length: n }, () => base / 100);
  valores[n - 1] = (centavos - base * (n - 1)) / 100;
  return valores;
}

/**
 * O estado da fatura, derivado — não existe coluna de status.
 *
 * Nada neste projeto roda em cron, então uma coluna `status` nunca sairia
 * sozinha de "aberta": ela nasceria mentindo. Aqui o estado é sempre calculado
 * do que é fato: a data de hoje e se a linha-fatura foi paga.
 */
export type EstadoDaFatura = "aberta" | "fechada" | "paga";

export function estadoDaFatura(
  fechamento: string,
  hoje: string,
  pagaEm: string | null | undefined,
): EstadoDaFatura {
  if (pagaEm) return "paga";
  return fechamento < hoje ? "fechada" : "aberta";
}

/**
 * A janela de compras de uma fatura: o dia seguinte ao fechamento anterior até
 * o fechamento dela.
 *
 * É o que a tela de cadastro do cartão mostra ao vivo — "compras de 26/set a
 * 25/out entram na fatura que vence em 05/nov" —, a frase que impede alguém de
 * digitar os dois dias trocados.
 */
export function janelaDaFatura(
  fechamento: string,
  diaDeFechamento: number,
): { de: string; ate: string } {
  const [ano, mes] = fechamento.split("-").map(Number);
  const anterior = doIndice(ano * 12 + (mes - 1) - 1);
  const fechamentoAnterior = comDiaAparado(anterior.ano, anterior.mes0, diaDeFechamento);

  const d = new Date(`${fechamentoAnterior}T00:00:00`);
  d.setDate(d.getDate() + 1);
  const de = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

  return { de, ate: fechamento };
}
