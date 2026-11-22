import { pessoaCasa, semAcento } from "../src/lib/pessoas/busca.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (obtido === esperado) ok++;
  else falhas.push(`${nome} — esperado ${esperado}, veio ${obtido}`);
}
const p = (name: string | null, phone: string | null) => ({ name, phone });

conferir("acento", pessoaCasa("marcia", p("Márcia Oliveira", null)), true);
conferir("acento inverso", pessoaCasa("Márcia", p("Marcia Oliveira", null)), true);
conferir("maiúscula", pessoaCasa("PATRICIA", p("Patrícia Medeiros", null)), true);
conferir(
  "palavras em outra ordem",
  pessoaCasa("sayuri paula", p("Paula Sayuri Pereira", null)),
  true,
);
conferir("palavra que não existe", pessoaCasa("paula carlos", p("Paula Sayuri", null)), false);
conferir("vazio casa", pessoaCasa("  ", p("Ana", null)), true);
conferir("pedaço do telefone", pessoaCasa("98419", p("x", "+55 (48) 98419-5309")), true);
conferir("com máscara", pessoaCasa("(48) 99626-6217", p("x", "5548996266217")), true);
conferir("sem o 9º dígito", pessoaCasa("4896266217", p("x", "5548996266217")), true);
conferir("com o 9º, guardado sem", pessoaCasa("48996266217", p("x", "554896266217")), true);
conferir("outro número", pessoaCasa("4899999999", p("x", "5548996266217")), false);
conferir("sem telefone", pessoaCasa("48996266217", p("Ana", null)), false);
conferir("nome vazio, acha pelo telefone", pessoaCasa("98419", p(null, "5548984195309")), true);
conferir("campo extra", pessoaCasa("123.456", p("Ana", null), ["123.456.789-00"]), true);
conferir("semAcento", semAcento("  Ação Ç "), "acao c");

if (falhas.length) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
console.log(`busca-de-pessoas: ${ok} checagens ok`);
