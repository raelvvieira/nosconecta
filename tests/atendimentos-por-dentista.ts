// "Atendimentos por dentista" no painel de Atendimento.
import {
  porDentista,
  type AtendimentoDoDentista,
} from "../src/lib/atendimentos/painel/metricas.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

const a = (
  id: string | null,
  nome: string | null,
  status: string,
  receita: number | null,
): AtendimentoDoDentista => ({ professionalId: id, professionalName: nome, status, receita });

const lista = [
  a("p1", "Dra. Mariane", "completed", 1000),
  a("p1", "Dra. Mariane", "completed", 500.5),
  a("p1", "Dra. Mariane", "cancelled", 900),
  a("p2", "Dr. Caio", "completed", 3000),
  a("p2", "Dr. Caio", "missed", null),
  a("p3", "Dra. Ana", "completed", null),
  a(null, null, "completed", 200),
  a(null, "dra. mariane ", "completed", 100),
];

conferir(
  "só concluídos; o mesmo dentista com e sem id vira uma linha só",
  porDentista(lista, true),
  [
    { nome: "Dra. Mariane", atendimentos: 3, receita: 1600.5 },
    { nome: "Dr. Caio", atendimentos: 1, receita: 3000 },
    { nome: "Sem dentista", atendimentos: 1, receita: 200 },
    { nome: "Dra. Ana", atendimentos: 1, receita: 0 },
  ],
);
conferir(
  "sem acesso ao financeiro a receita some e a ordem fica",
  porDentista(lista, false).map((l) => [l.nome, l.atendimentos, l.receita]),
  [
    ["Dra. Mariane", 3, null],
    ["Dr. Caio", 1, null],
    ["Sem dentista", 1, null],
    ["Dra. Ana", 1, null],
  ],
);
conferir("vazio", porDentista([], true), []);
conferir("só cancelados", porDentista([a("p1", "X", "cancelled", 10)], true), []);
conferir(
  "mesmo id com nomes gravados diferentes é uma linha, com o nome mais usado",
  porDentista(
    [
      a("p1", "Dra. Mariane Botti", "completed", 100),
      a("p1", "Dra. Mariane Botti", "completed", 100),
      a("p1", "Mariane Botti", "completed", 50),
    ],
    true,
  ),
  [{ nome: "Dra. Mariane Botti", atendimentos: 3, receita: 250 }],
);
conferir(
  "empate de atendimentos desempata pela receita",
  porDentista([a("p1", "A", "completed", 10), a("p2", "B", "completed", 20)], true).map(
    (l) => l.nome,
  ),
  ["B", "A"],
);
conferir(
  "soma em centavos sem sobra de ponto flutuante",
  porDentista([a("p1", "A", "completed", 0.1), a("p1", "A", "completed", 0.2)], true)[0].receita,
  0.3,
);

if (falhas.length) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
console.log(`atendimentos-por-dentista: ${ok} checagens ok`);
