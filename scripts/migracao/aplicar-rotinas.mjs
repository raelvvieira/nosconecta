#!/usr/bin/env node
/**
 * Grava no cofre do banco NOVO o endereço e a chave das rotinas e recria as 7
 * tarefas automáticas — todas desligadas. Ver `rotinas.sql`.
 *
 * Uso: NOVO_PROJETO_REF=xxxx node scripts/migracao/aplicar-rotinas.mjs
 */
import { readFileSync } from "node:fs";
import { chavesDoProjeto, projetoNovo, sql } from "./api.mjs";

const ref = projetoNovo();
const { url, anon } = await chavesDoProjeto(ref);
if (!anon) throw new Error("A chave anon do projeto novo não veio da API.");

// Dólar-quoting com etiqueta própria: a chave nunca contém `$cofre$`.
const guardar = (nome, valor) => `
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM vault.secrets WHERE name = '${nome}')
      THEN (SELECT vault.update_secret(id, $cofre$${valor}$cofre$) FROM vault.secrets WHERE name = '${nome}')::text
    ELSE vault.create_secret($cofre$${valor}$cofre$, '${nome}')::text
  END;`;

await sql(ref, guardar("rotinas_url", url));
await sql(ref, guardar("rotinas_chave", anon));
const tarefas = await sql(ref, readFileSync(new URL("./rotinas.sql", import.meta.url), "utf8"));
console.table(tarefas);
