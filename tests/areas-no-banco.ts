// O mapa nível → áreas do banco (migration) tem de ser IGUAL ao do código.
//
// Se divergirem, a tela mostra uma área que o banco nega (ou o pior: o banco
// libera o que a tela esconde). Este teste lê a migration e compara.
import { readFileSync } from "node:fs";
import { AREAS_DO_NIVEL, AREAS_CONCEDIVEIS } from "../src/lib/auth/niveis-de-acesso.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

const sql = readFileSync(
  new URL("../supabase/migrations/20261127120000_acessos_base.sql", import.meta.url),
  "utf8",
);

// O mapa vigente é o da migration mais recente que redefine `areas_do_membro`.
const sqlDoMapa = readFileSync(
  new URL("../supabase/migrations/20261127160000_locatario.sql", import.meta.url),
  "utf8",
);

for (const [nivel, areas] of Object.entries(AREAS_DO_NIVEL)) {
  const m = new RegExp(`WHEN '${nivel}' THEN ARRAY\\[([^\\]]*)\\]`).exec(sqlDoMapa);
  const doSql = m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : null;
  conferir(`áreas do nível ${nivel}`, doSql && [...doSql].sort(), [...areas].sort());
}

// A lista de áreas concedíveis do código = a do CHECK do banco.
const check = /acessos_extras <@ ARRAY\[([^\]]*)\]/.exec(sql);
const doCheck = check ? [...check[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : null;
conferir("áreas concedíveis", doCheck && [...doCheck].sort(), [...AREAS_CONCEDIVEIS].sort());

if (falhas.length) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
console.log(`areas-no-banco: ${ok} checagens ok`);
