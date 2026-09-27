// Casar um número que chegou com a ficha do paciente.
//
// `patients.phone` é texto formatado ("+55 (51) 99999-9999"), nunca E.164 —
// então nada aqui pode comparar texto com texto direto.
//
// A comparação de verdade acontece no BANCO, em
// `public.agendamento_por_telefone`, que normaliza com
// `public.telefone_br_normalizado`. O que sai daqui são as FORMAS a procurar.
// Ler a tabela inteira e comparar em memória era o que o caminho antigo fazia,
// e o PostgREST corta em 1000 linhas caladas: com 3.248 fichas, dois terços
// dos pacientes nunca casavam e ninguém via erro nenhum.
import { normalizeBrazilianPhone } from "./phone.ts";
export function onlyDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

// Compares by the last 10 digits so formatting differences (with/without
// country code, leading 9, etc.) don't cause false negatives.
export function phoneMatches(a: string, b: string): boolean {
  if (!a || !b) return false;
  const tailLen = 10;
  return a.slice(-tailLen) === b.slice(-tailLen);
}

/**
 * As formas em que o MESMO celular brasileiro pode estar guardado.
 *
 * ── O nono dígito ───────────────────────────────────────────────────────
 *
 * O mesmo número aparece nesta base de dois jeitos: 13 dígitos com o 9
 * ("5548991838082") e 12 sem ele ("554891838082"). É herança de cadastro
 * antigo, e não dá para saber qual forma a ficha usou sem olhar.
 *
 * Por isso a comparação não é "o número é igual a", é "o número está entre
 * estas formas". `phoneMatches` acima compara os 10 últimos dígitos e parece
 * resolver isso — **não resolve**: com o 9, os 10 últimos de
 * "5548991838082" são "8991838082"; sem ele, os de "554891838082" são
 * "4891838082". Dois textos diferentes, mesmo telefone.
 *
 * Gêmea de `variantesDoNumero` em `src/lib/atendimentos/phone.ts`. A
 * duplicação é a mesma de sempre neste projeto: aquele roda no navegador e no
 * Worker, este no Deno, e não há import entre os dois mundos.
 */
export function variantesDoNumero(raw: string | null | undefined): string[] {
  const completo = normalizeBrazilianPhone(String(raw ?? ""));
  if (!completo.startsWith("55") || completo.length < 12) return completo ? [completo] : [];

  const ddd = completo.slice(2, 4);
  const resto = completo.slice(4);
  const formas = new Set<string>([completo]);

  if (resto.length === 9 && resto.startsWith("9")) {
    // Com o 9 → acrescenta a forma sem ele.
    formas.add(`55${ddd}${resto.slice(1)}`);
  } else if (resto.length === 8 && /^[6-9]/.test(resto)) {
    // Celular antigo, sem o 9 → acrescenta a forma com ele.
    formas.add(`55${ddd}9${resto}`);
  }

  return [...formas];
}
