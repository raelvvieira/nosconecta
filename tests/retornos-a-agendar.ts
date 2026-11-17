// A lista de retornos a agendar: ordem, urgência, grupos e prazos.
import {
  agruparRetornos,
  diasEntre,
  ordenarRetornos,
  prazoPorExtenso,
  somarMeses,
  urgenciaDoRetorno,
  type RetornoAAgendar,
} from "../src/lib/agenda/retornos.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

const r = (id: string, nome: string, data: string): RetornoAAgendar => ({
  id,
  patient_id: null,
  patient_name: nome,
  procedure_name: null,
  professional_name: null,
  data_prevista: data,
  observacao: null,
});
const HOJE = "2026-11-17";

conferir("dias entre", diasEntre("2026-11-17", "2026-11-20"), 3);
conferir("dias negativos", diasEntre("2026-11-17", "2026-11-10"), -7);
conferir("virada de ano", diasEntre("2026-12-31", "2027-01-01"), 1);

conferir("atrasado", urgenciaDoRetorno("2026-11-16", HOJE), "atrasado");
conferir("hoje é da semana", urgenciaDoRetorno("2026-11-17", HOJE), "semana");
conferir("em 7 dias", urgenciaDoRetorno("2026-11-24", HOJE), "semana");
conferir("em 8 dias", urgenciaDoRetorno("2026-11-25", HOJE), "mes");
conferir("em 3 meses", urgenciaDoRetorno("2027-02-17", HOJE), "depois");

const lista = [
  r("3", "Bia", "2027-02-10"),
  r("2", "Ana", "2026-12-01"),
  r("1", "Caio", "2026-11-10"),
  r("4", "Alice", "2026-12-01"),
];
conferir(
  "ordem",
  ordenarRetornos(lista).map((x) => x.id),
  ["1", "4", "2", "3"],
);
conferir("não altera a original", lista[0].id, "3");

const g = agruparRetornos(lista, HOJE);
conferir(
  "grupos",
  g.map((x) => x.titulo),
  ["Atrasados", "Dezembro de 2026", "Fevereiro de 2027"],
);
conferir(
  "itens do grupo",
  g[1].itens.map((x) => x.patient_name),
  ["Alice", "Ana"],
);
conferir("lista vazia", agruparRetornos([], HOJE), []);

conferir("hoje", prazoPorExtenso("2026-11-17", HOJE), "hoje");
conferir("amanhã", prazoPorExtenso("2026-11-18", HOJE), "amanhã");
conferir("atraso", prazoPorExtenso("2026-11-10", HOJE), "há 7 dias");
conferir("em dias", prazoPorExtenso("2026-12-01", HOJE), "em 14 dias");
conferir("em meses", prazoPorExtenso("2027-05-17", HOJE), "em 6 meses");

conferir("+3 meses", somarMeses("2026-11-17", 3), "2027-02-17");
conferir("31/01 + 1 mês", somarMeses("2027-01-31", 1), "2027-02-28");
conferir("+12 meses", somarMeses("2026-11-17", 12), "2027-11-17");

if (falhas.length) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
console.log(`retornos-a-agendar: ${ok} checagens ok`);
