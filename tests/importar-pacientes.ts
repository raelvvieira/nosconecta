import { lerPacientes } from "../src/lib/patients/importar.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

conferir(
  "CSV com títulos e ponto e vírgula",
  lerPacientes("Nome;Telefone;E-mail\nAna Souza;(48) 99999-1111;ANA@x.com\nBruno Lima;;"),
  [
    { nome: "Ana Souza", telefone: "(48) 99999-1111", email: "ana@x.com" },
    { nome: "Bruno Lima", telefone: "", email: "" },
  ],
);
conferir(
  "colado do Excel (tabulação), colunas fora de ordem",
  lerPacientes("Celular\tPaciente\n48988887777\tCarla Dias"),
  [{ nome: "Carla Dias", telefone: "48988887777", email: "" }],
);
conferir(
  "sem títulos: identifica pelo conteúdo",
  lerPacientes("11999998888, Diego Rocha, diego@x.com"),
  [{ nome: "Diego Rocha", telefone: "11999998888", email: "diego@x.com" }],
);
conferir("aspas com vírgula no nome", lerPacientes('nome,telefone\n"Silva, Eva",48977776666'), [
  { nome: "Silva, Eva", telefone: "48977776666", email: "" },
]);
conferir(
  "linha sem nome é ignorada",
  lerPacientes("nome,telefone\n,48911112222\nFábio,48933334444"),
  [{ nome: "Fábio", telefone: "48933334444", email: "" }],
);
conferir("vazio", lerPacientes("  \n "), []);
conferir("BOM do Excel", lerPacientes("﻿nome\nGil"), [{ nome: "Gil", telefone: "", email: "" }]);

if (falhas.length) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
console.log(`ok — ${ok} checagens da importação de pacientes`);
