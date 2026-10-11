// O mês, como unidade de leitura do financeiro.
//
// ── Por que isto existe ─────────────────────────────────────────────────────
//
// O período padrão das telas financeiras era "os últimos 30 dias corridos":
// abrindo no dia 11 de outubro, o painel mostrava de 12/09 a 11/10. Metade de
// um mês, metade do outro.
//
// Nenhuma conta da clínica fecha nessa janela. O aluguel vence no dia 31, o
// condomínio no dia 10, a fatura do cartão fecha e vence em dias fixos, o DAS é
// mensal e o pró-labore é mensal. Uma janela deslizante responde "quanto entrou
// nos últimos 30 dias", que é uma pergunta que ninguém faz, e NÃO responde
// "setembro fechou como", que é a única que importa na hora de decidir.
//
// ── Por que sem `Date` ──────────────────────────────────────────────────────
//
// Mês é conta de calendário, não de relógio. `new Date("2026-10-01")` é
// meia-noite em UTC, que no Brasil ainda é 30 de setembro — e o primeiro dia do
// mês viraria o último do anterior, calado. Aqui tudo é aritmética de inteiros
// sobre "AAAA-MM", e o fuso não tem por onde entrar.

/** Um mês identificado por "AAAA-MM". */
export type ChaveDoMes = string;

export interface MesParaEscolher {
  /** "2026-10" */
  chave: ChaveDoMes;
  /** Primeiro dia, "AAAA-MM-DD". */
  de: string;
  /** Último dia, "AAAA-MM-DD". */
  ate: string;
  /** "outubro", ou "outubro de 2025" quando não é o ano corrente. */
  rotulo: string;
  /** É o mês em que estamos? */
  atual: boolean;
}

const NOMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const FORMATO_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
const FORMATO_MES = /^(\d{4})-(\d{2})$/;

function partes(chave: ChaveDoMes): { ano: number; mes: number } | null {
  const m = FORMATO_MES.exec(String(chave ?? "").trim());
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  if (!Number.isInteger(ano) || mes < 1 || mes > 12) return null;
  return { ano, mes };
}

const doisDigitos = (n: number) => String(n).padStart(2, "0");

/** Ano bissexto pela regra completa: fevereiro de 2100 tem 28 dias, não 29. */
function bissexto(ano: number): boolean {
  return ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0);
}

/** Quantos dias tem o mês. É isto que define o último dia do intervalo. */
export function diasNoMes(ano: number, mes: number): number {
  if (mes === 2) return bissexto(ano) ? 29 : 28;
  return [4, 6, 9, 11].includes(mes) ? 30 : 31;
}

/** "2026-10-11" → "2026-10". Devolve "" para o que não for um dia válido. */
export function mesDoDia(dia: string): ChaveDoMes {
  const m = FORMATO_DIA.exec(String(dia ?? "").trim());
  return m ? `${m[1]}-${m[2]}` : "";
}

/**
 * O primeiro e o último dia do mês.
 *
 * Devolve `null` para chave inválida em vez de um intervalo chutado: um
 * intervalo errado vira uma tela cheia de números errados, e ninguém
 * desconfiaria do filtro.
 */
export function intervaloDoMes(chave: ChaveDoMes): { de: string; ate: string } | null {
  const p = partes(chave);
  if (!p) return null;
  const mm = doisDigitos(p.mes);
  return {
    de: `${p.ano}-${mm}-01`,
    ate: `${p.ano}-${mm}-${doisDigitos(diasNoMes(p.ano, p.mes))}`,
  };
}

/** "2026-10" mais 3 meses → "2027-01". Aceita negativo. */
export function somarMeses(chave: ChaveDoMes, quantos: number): ChaveDoMes {
  const p = partes(chave);
  if (!p || !Number.isFinite(quantos)) return "";
  // Conta em meses absolutos desde o ano 0 e volta — evita o `if (mes > 12)`
  // encadeado, que é onde esse tipo de função costuma errar na virada do ano.
  const total = p.ano * 12 + (p.mes - 1) + Math.trunc(quantos);
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  return `${ano}-${doisDigitos(mes)}`;
}

/**
 * "outubro" quando é do ano corrente, "outubro de 2025" quando não é.
 *
 * O ano só aparece quando muda a resposta. Escrever "outubro de 2026" numa
 * barra em que todos os meses são de 2026 é ruído que empurra os outros meses
 * para fora da tela no celular.
 */
export function rotuloDoMes(chave: ChaveDoMes, hoje: string): string {
  const p = partes(chave);
  if (!p) return "";
  const anoDeHoje = partes(mesDoDia(hoje))?.ano;
  const nome = NOMES[p.mes - 1];
  return p.ano === anoDeHoje ? nome : `${nome} de ${p.ano}`;
}

/**
 * Este intervalo é exatamente um mês cheio?
 *
 * Serve para o seletor saber qual pílula acender quando o período veio da URL.
 * Sem isto, abrir um link com `from`/`to` de um mês deixaria todas as pílulas
 * apagadas — a tela mostrando outubro e nada dizendo que é outubro.
 */
export function mesCheioDe(de?: string | null, ate?: string | null): ChaveDoMes | null {
  const chave = mesDoDia(String(de ?? ""));
  if (!chave) return null;
  const intervalo = intervaloDoMes(chave);
  if (!intervalo) return null;
  return intervalo.de === de && intervalo.ate === ate ? chave : null;
}

/**
 * Os meses que a barra oferece: alguns atrás, alguns à frente, e o de hoje.
 *
 * Para frente também, e não só para trás, porque metade das perguntas da
 * clínica é sobre o que ainda vai acontecer — "o que vence em novembro" é tão
 * frequente quanto "como fechou setembro". As telas de pagamentos e de
 * planejamento só servem olhando para a frente.
 */
export function mesesEmVolta(hoje: string, atras = 2, frente = 1): MesParaEscolher[] {
  const agora = mesDoDia(hoje);
  if (!agora) return [];
  const lista: MesParaEscolher[] = [];
  for (let i = -Math.abs(atras); i <= Math.abs(frente); i++) {
    const chave = somarMeses(agora, i);
    const intervalo = intervaloDoMes(chave);
    if (!intervalo) continue;
    lista.push({
      chave,
      de: intervalo.de,
      ate: intervalo.ate,
      rotulo: rotuloDoMes(chave, hoje),
      atual: i === 0,
    });
  }
  return lista;
}

/**
 * O intervalo que a tela deve usar quando a URL não traz nada.
 *
 * É o mês corrente inteiro, do dia 1 ao último — e não "os últimos 30 dias".
 * Inclui os dias que ainda não aconteceram de propósito: é o que faz "a pagar"
 * e "a receber" mostrarem o resto do mês, que é a parte acionável.
 */
export function mesCorrente(hoje: string): { de: string; ate: string } {
  const intervalo = intervaloDoMes(mesDoDia(hoje));
  // Dia inválido não deveria chegar aqui; se chegar, devolver o próprio dia é
  // melhor do que devolver um mês inventado de outro ano.
  return intervalo ?? { de: hoje, ate: hoje };
}
