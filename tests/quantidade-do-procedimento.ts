// A quantidade opcional por procedimento: leitura do que se digita e texto do recibo.
import { lerQuantidade, quantidadeEmTexto } from "../src/lib/agenda/procedimentos.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

conferir("inteiro", lerQuantidade("2"), 2);
conferir("vírgula", lerQuantidade("1,5"), 1.5);
conferir("ponto", lerQuantidade("0.75"), 0.75);
conferir("espaços", lerQuantidade("  3 "), 3);
conferir("vazio é nulo", lerQuantidade(""), null);
conferir("zero é nulo", lerQuantidade("0"), null);
conferir("negativo é nulo", lerQuantidade("-2"), null);
conferir("texto é nulo", lerQuantidade("abc"), null);
conferir("absurdo é nulo", lerQuantidade("999999"), null);
conferir("três casas no máximo", lerQuantidade("1,23456"), 1.235);

conferir("texto inteiro", quantidadeEmTexto(2, "ml"), "2 ml");
conferir("texto decimal", quantidadeEmTexto(1.5, "ml"), "1,5 ml");
conferir("sem unidade", quantidadeEmTexto(3, null), "3");
conferir("nulo vira vazio", quantidadeEmTexto(null, "ml"), "");
conferir("zero vira vazio", quantidadeEmTexto(0, "ml"), "");
conferir("undefined vira vazio", quantidadeEmTexto(undefined, undefined), "");

if (falhas.length) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
console.log(`quantidade-do-procedimento: ${ok} checagens ok`);
