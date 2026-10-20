// A lista de especialidades, e o que ela recusa.
//
// O que está em jogo não é a tela: é que a escolha chega de um formulário que
// a PRÓPRIA pessoa preenche, no convite, antes de ter acesso a coisa alguma.
// O que vier de fora da lista não pode entrar no cadastro da clínica.
import {
  ESPECIALIDADES,
  especialidadesEmTexto,
  especialidadesValidas,
} from "../src/lib/settings/especialidades.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

conferir("a lista começa por Clínica Geral", ESPECIALIDADES[0], "Clínica Geral");
conferir("e tem as do CFO", ESPECIALIDADES.includes("Harmonização Orofacial"), true);
conferir("sem repetir", new Set(ESPECIALIDADES).size, ESPECIALIDADES.length);

// ── O filtro ────────────────────────────────────────────────────────────

conferir("duas válidas passam", especialidadesValidas(["Ortodontia", "Endodontia"]), [
  "Endodontia",
  "Ortodontia",
]);
// A ordem é a da LISTA, não a dos cliques: a mesma dentista não pode aparecer
// "Ortodontia · Dentística" numa tela e "Dentística · Ortodontia" em outra.
conferir("a ordem é a da lista", especialidadesValidas(["Ortodontia", "Dentística"]), [
  "Dentística",
  "Ortodontia",
]);
conferir("repetida entra uma vez", especialidadesValidas(["Endodontia", "Endodontia"]), [
  "Endodontia",
]);

// O que a fronteira recusa.
conferir("inventada não entra", especialidadesValidas(["Ortodontista"]), []);
conferir("caixa trocada não entra", especialidadesValidas(["ortodontia"]), []);
conferir("espaço sobrando é tolerado", especialidadesValidas([" Ortodontia "]), ["Ortodontia"]);
conferir("vazio", especialidadesValidas([]), []);
conferir("nulo", especialidadesValidas(null), []);
conferir("lixo junto com válida", especialidadesValidas(["<script>", "Periodontia"]), [
  "Periodontia",
]);

// ── O texto de uma linha ────────────────────────────────────────────────

conferir(
  "junta com ponto",
  especialidadesEmTexto(["Ortodontia", "Dentística"]),
  "Dentística · Ortodontia",
);
conferir("uma só não ganha separador", especialidadesEmTexto(["Endodontia"]), "Endodontia");
conferir("nenhuma vira vazio", especialidadesEmTexto([]), "");
conferir("só lixo vira vazio", especialidadesEmTexto(["Odontomancia"]), "");

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens das especialidades`);
