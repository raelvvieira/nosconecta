#!/usr/bin/env node
/**
 * Monta a estrutura do banco NOVO a partir de `supabase/migrations/`, sem
 * dado nenhum: tabelas, regras de acesso, funções e extensões.
 *
 * Uso: NOVO_PROJETO_REF=xxxx node scripts/migracao/montar-banco.mjs
 *
 * ── Por que não `supabase db push` direto ─────────────────────────────────
 *
 * 1. `db push` pede a senha do banco; pela API de gerenciamento basta a chave
 *    da conta, que já está no ambiente.
 * 2. Umas 16 migrations antigas agendam tarefas com o endereço DO LOVABLE
 *    escrito dentro. Rodadas como estão, o banco novo passaria a chamar as
 *    funções do Lovable a cada minuto até `aplicar-rotinas.mjs` rodar. Aqui o
 *    endereço é trocado por um que não responde (a chamada falha e não faz
 *    nada), e `rotinas.sql` apaga e recria as tarefas logo depois.
 *
 * Cada migration aplicada é registrada em `supabase_migrations.schema_migrations`,
 * como o CLI faz — rodar de novo pula o que já foi, e um `supabase db push`
 * futuro enxerga o histórico.
 */
import { readdirSync, readFileSync } from "node:fs";
import { PROJETO_DO_LOVABLE, projetoNovo, sql } from "./api.mjs";

const ref = projetoNovo();
const pasta = new URL("../../supabase/migrations/", import.meta.url);
const ENDERECO_MORTO = "http://127.0.0.1:9";

await sql(
  ref,
  `CREATE SCHEMA IF NOT EXISTS supabase_migrations;
   CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
     version text PRIMARY KEY, statements text[], name text
   );`,
);
const feitas = new Set(
  (await sql(ref, "SELECT version FROM supabase_migrations.schema_migrations")).map(
    (l) => l.version,
  ),
);

const arquivos = readdirSync(pasta)
  .filter((f) => f.endsWith(".sql"))
  .sort();
let aplicadas = 0;
for (const arquivo of arquivos) {
  const [version, ...resto] = arquivo.replace(/\.sql$/, "").split("_");
  if (feitas.has(version)) continue;
  const texto = readFileSync(new URL(arquivo, pasta), "utf8").replaceAll(
    `https://${PROJETO_DO_LOVABLE}.supabase.co`,
    ENDERECO_MORTO,
  );
  try {
    await sql(ref, texto);
  } catch (erro) {
    console.error(`\nParou em ${arquivo}:\n${erro.message}`);
    console.error(
      `\n${aplicadas} aplicadas nesta rodada. Corrija e rode de novo — o que já foi é pulado.`,
    );
    process.exit(1);
  }
  await sql(
    ref,
    `INSERT INTO supabase_migrations.schema_migrations (version, name)
     VALUES ('${version}', '${resto.join("_").replaceAll("'", "''")}') ON CONFLICT DO NOTHING`,
  );
  aplicadas += 1;
  process.stdout.write(`\r${aplicadas} aplicadas (${arquivo})`.padEnd(100));
}
// Os 3 depósitos de arquivos foram criados à mão no Lovable (Cloud → Storage)
// e não estão em migration nenhuma — só as regras de acesso deles estão.
// Mesma configuração de lá: privados, sem limite de tamanho nem de tipo.
await sql(
  ref,
  `INSERT INTO storage.buckets (id, name, public)
   VALUES ('crm-campaign-media', 'crm-campaign-media', false),
          ('wa-midia', 'wa-midia', false),
          ('patient-files', 'patient-files', false)
   ON CONFLICT (id) DO NOTHING`,
);

console.log(
  `\nPronto: ${aplicadas} aplicadas, ${feitas.size} já estavam. Agora: aplicar-rotinas.mjs`,
);
