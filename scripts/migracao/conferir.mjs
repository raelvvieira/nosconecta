#!/usr/bin/env node
/**
 * Compara o Lovable com o projeto NOVO: linhas por tabela, logins e arquivos.
 *
 * 1. Rode no banco do Lovable (só leitura) o SQL de `CONTAGEM` abaixo — ele
 *    é impresso com `--sql` — e salve o resultado JSON em um arquivo.
 * 2. NOVO_PROJETO_REF=xxxx node scripts/migracao/conferir.mjs origem.json
 *
 * Tudo igual: "nada faltando". Qualquer diferença aparece na tabela.
 */
import { readFileSync } from "node:fs";
import { projetoNovo, sql } from "./api.mjs";

// Contagem exata de cada tabela, numa consulta só. `query_to_xml` é o jeito de
// contar uma lista de tabelas sem montar SQL dinâmico fora do banco.
export const CONTAGEM = `
SELECT tabela, (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM %s', tabela), false, true, '')))[1]::text::bigint AS linhas
FROM (
  SELECT 'public.' || tablename AS tabela FROM pg_tables WHERE schemaname = 'public'
  UNION ALL VALUES ('auth.users'), ('auth.identities'), ('storage.objects')
) t ORDER BY tabela;`;

if (process.argv.includes("--sql")) {
  console.log(CONTAGEM);
  process.exit(0);
}

const arquivo = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!arquivo) {
  console.error("Uso: conferir.mjs origem.json   (ou --sql para ver a consulta)");
  process.exit(1);
}
const bruto = JSON.parse(readFileSync(arquivo, "utf8"));
const origem = new Map((bruto.rows ?? bruto).map((l) => [l.tabela, Number(l.linhas)]));
const destino = new Map(
  (await sql(projetoNovo(), CONTAGEM)).map((l) => [l.tabela, Number(l.linhas)]),
);

const diferencas = [];
for (const tabela of new Set([...origem.keys(), ...destino.keys()])) {
  const a = origem.get(tabela);
  const b = destino.get(tabela);
  if (a !== b) diferencas.push({ tabela, lovable: a ?? "(não existe)", novo: b ?? "(não existe)" });
}
if (diferencas.length) {
  console.table(diferencas);
  process.exitCode = 1;
} else {
  console.log(`Nada faltando: ${origem.size} tabelas com as mesmas contagens.`);
}
