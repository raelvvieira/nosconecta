// Checagens do filtro de travessão.
//
// O manual da Luna proíbe travessão na mensagem: ele é uma das marcas que
// denunciam texto de máquina, e quase ninguém digita travessão no celular.
//
// Pedir não resolve — a instrução que proíbe é a mesma que está cheia deles. Este
// filtro é a garantia.
//
// O modo de errar que importa: **estragar palavra com hífen**. "segunda-feira",
// "pé-de-galinha", "pós-operatório" usam hífen, não travessão. Um filtro
// descuidado transformaria "segunda-feira" em "segunda, feira" e a mensagem
// ficaria pior do que começou.
import { semTravessao } from "../supabase/functions/_shared/sem-travessao.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

// ── O hífen nunca é tocado ──────────────────────────────────────────────
conferir(
  "segunda-feira fica inteira",
  semTravessao("Tenho segunda-feira às 14h"),
  "Tenho segunda-feira às 14h",
);
conferir(
  "pé-de-galinha fica inteiro",
  semTravessao("testa e pé-de-galinha"),
  "testa e pé-de-galinha",
);
conferir(
  "pós-operatório fica inteiro",
  semTravessao("o pós-operatório é tranquilo"),
  "o pós-operatório é tranquilo",
);
conferir("bem-estar fica inteiro", semTravessao("bem-estar"), "bem-estar");
// Texto sem travessão volta idêntico, sem nenhuma normalização a mais.
conferir(
  "texto limpo não é mexido",
  semTravessao("Oii! Tudo bem?  Vou ver aqui"),
  "Oii! Tudo bem?  Vou ver aqui",
);

// ── O travessão no meio vira vírgula ────────────────────────────────────
conferir("travessão com espaços", semTravessao("É hoje — às 14h"), "É hoje, às 14h");
conferir("travessão sem espaços", semTravessao("É hoje—às 14h"), "É hoje, às 14h");
conferir(
  "meia-risca também sai",
  semTravessao("R$ 600 – inclui limpeza"),
  "R$ 600, inclui limpeza",
);
conferir("barra horizontal também", semTravessao("valor ― a confirmar"), "valor, a confirmar");
conferir(
  "dois travessões na mesma frase",
  semTravessao("Limpeza — 250 — em até 10x"),
  "Limpeza, 250, em até 10x",
);

// ── Onde a vírgula ficaria feia, ele apenas sai ─────────────────────────
conferir("depois de ponto", semTravessao("Até já. — Luna"), "Até já. Luna");
conferir("depois de vírgula", semTravessao("Oi, — tudo bem?"), "Oi, tudo bem?");
conferir("depois de dois-pontos", semTravessao("Valores: — 250"), "Valores: 250");
conferir("no começo do texto", semTravessao("— Tenho às 14h"), "Tenho às 14h");
conferir("no fim do texto", semTravessao("Tenho às 14h —"), "Tenho às 14h");
conferir("sozinho", semTravessao("—"), "");

// ── As quebras de linha sobrevivem ──────────────────────────────────────
// A segmentação em várias mensagens depende delas: colapsar quebra viraria um
// paredão de texto, que é o que a segmentação existe para evitar.
conferir(
  "quebra de linha fica",
  semTravessao("Tenho dois horários:\n— terça às 10h\n— quinta às 15h"),
  "Tenho dois horários:\nterça às 10h\nquinta às 15h",
);
conferir(
  "vírgula não fica pendurada no fim da linha",
  semTravessao("É hoje —\nàs 14h"),
  "É hoje\nàs 14h",
);
conferir("parágrafo duplo fica", semTravessao("Oi\n\nTudo bem?"), "Oi\n\nTudo bem?");

// ── Chamadas em sequência ───────────────────────────────────────────────
// A regex é global; sem resetar `lastIndex` a segunda chamada erraria. Cada
// pedaço de uma resposta segmentada é uma chamada nova.
{
  const a = semTravessao("É hoje — às 14h");
  const b = semTravessao("É hoje — às 14h");
  conferir("a segunda chamada é igual à primeira", b, a);
  conferir("e as duas estão certas", a, "É hoje, às 14h");
  // Um texto sem travessão entre dois com travessão.
  conferir("sem travessão no meio da sequência", semTravessao("Tudo bem?"), "Tudo bem?");
  conferir("e a seguinte ainda funciona", semTravessao("Oi — tudo bem?"), "Oi, tudo bem?");
}

// ── Vazio e nulo ────────────────────────────────────────────────────────
conferir("vazio", semTravessao(""), "");
conferir("espaços viram vazio quando há travessão", semTravessao("  —  "), "");

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens do filtro de travessão`);
