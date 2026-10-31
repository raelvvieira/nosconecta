// O odontograma: regiões válidas, tipo e nome de cada dente.
//
// O que não pode acontecer: uma anotação gravada numa região que a tela não
// desenha (ela sumiria), ou um molar de leite chamado de pré-molar.
import {
  ARCADAS,
  descricaoDoDente,
  ehRegiaoValida,
  rotuloDaRegiao,
  tipoDoDente,
} from "../src/lib/patients/odontograma.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

conferir(
  "32 permanentes",
  [...ARCADAS.permanente.superior, ...ARCADAS.permanente.inferior].flat().length,
  32,
);
conferir("20 decíduos", [...ARCADAS.deciduo.superior, ...ARCADAS.deciduo.inferior].flat().length, 20);

conferir("dente permanente vale", ehRegiaoValida("24"), true);
conferir("dente de leite vale", ehRegiaoValida("65"), true);
conferir("região geral vale", ehRegiaoValida("maxila"), true);
conferir("dente inventado não vale", ehRegiaoValida("99"), false);
conferir("posição 9 não existe", ehRegiaoValida("19"), false);
conferir("texto livre não vale", ehRegiaoValida("boca"), false);
conferir("vazio não vale", ehRegiaoValida(""), false);
conferir("nulo não vale", ehRegiaoValida(null), false);

conferir("11 é incisivo", tipoDoDente("11"), "incisivo");
conferir("13 é canino", tipoDoDente("13"), "canino");
conferir("24 é pré-molar", tipoDoDente("24"), "pre-molar");
conferir("36 é molar", tipoDoDente("36"), "molar");
conferir("54 é molar de leite, não pré-molar", tipoDoDente("54"), "molar");

conferir("24 por extenso", descricaoDoDente("24"), "pré-molar superior esquerdo");
conferir("46 por extenso", descricaoDoDente("46"), "molar inferior direito");
conferir("65 por extenso", descricaoDoDente("65"), "molar de leite superior esquerdo");

conferir("rótulo do dente", rotuloDaRegiao("24"), "Dente 24");
conferir("rótulo da região", rotuloDaRegiao("arcada_superior"), "Arcada superior");
conferir("rótulo vazio", rotuloDaRegiao(null), "");

if (falhas.length) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
console.log(`odontograma: ${ok} checagens ok`);
