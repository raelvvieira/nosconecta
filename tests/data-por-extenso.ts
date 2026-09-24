// A data por extenso do modo leitura do agendamento.
//
// Três armadilhas, todas já pagas por este projeto em outro lugar:
//
//   **O dia que volta.** `new Date("2026-09-24")` é meia-noite UTC, que no
//   Brasil é 21h do dia 23. Sem o `T00:00:00`, a consulta de quinta aparece
//   como quarta.
//
//   **O ano invisível.** Um retorno marcado para 2027 escrito como "24 de
//   março" parece desta semana.
//
//   **A maiúscula.** O `Intl` devolve "quinta-feira" em minúscula; como isto
//   abre o card, ficaria um título começando em letra baixa.
import { dataPorExtenso } from "../src/lib/date.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

conferir("o dia não volta", dataPorExtenso("2026-09-24", 2026), "Quinta-feira, 24 de setembro");
conferir("começa em maiúscula", dataPorExtenso("2026-09-24", 2026).charAt(0), "Q");
conferir(
  "outro ano leva o ano junto",
  dataPorExtenso("2027-03-24", 2026),
  "Quarta-feira, 24 de março de 2027",
);
conferir("o ano corrente não leva", dataPorExtenso("2026-03-24", 2026).includes("2026"), false);
// Primeiro dia do mês: o `getFullYear` é local, e o `T00:00:00` também — os
// dois no mesmo fuso é o que faz 1º de janeiro continuar sendo janeiro.
conferir("1º de janeiro continua em janeiro", dataPorExtenso("2026-01-01", 2026), "Quinta-feira, 1 de janeiro");
// Texto que não é data volta como veio, em vez de virar "Invalid Date".
conferir("lixo volta como veio", dataPorExtenso("", 2026), "");

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens da data por extenso`);
