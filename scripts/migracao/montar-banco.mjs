#!/usr/bin/env node
/**
 * Monta a estrutura do banco NOVO a partir da planta do Lovable, sem dado
 * nenhum: tabelas, regras de acesso, funções, gatilhos, extensões e os 3
 * depósitos de arquivos.
 *
 * Uso (NOVO_PROJETO_REF no ambiente):
 *   1. node scripts/migracao/montar-banco.mjs           → prepara a recepção
 *   2. node scripts/migracao/preparar-recepcao.mjs      (se ainda não rodou)
 *      node scripts/migracao/sql-de-envio.mjs /tmp/planta.sql --estrutura
 *      e rodar /tmp/planta.sql NO LOVABLE — só lê a estrutura e a POSTa para
 *      `migracao.ddl` no projeto novo; nenhum dado de paciente.
 *   3. node scripts/migracao/montar-banco.mjs           → aplica a planta
 *
 * ── Por que planta, e não `supabase/migrations/` ──────────────────────────
 *
 * Das 175 migrations do repositório, só 81 estão no histórico do Lovable: as
 * outras foram aplicadas por cópias com outro nome, à mão ou fora de ordem.
 * Reaplicadas em sequência num banco vazio, quebram na 10ª. A planta
 * (`estrutura.sql`) lê dos catálogos o que EXISTE lá hoje — o resultado, não
 * a história. Primeira montagem em 27/10: 1.203 comandos, nenhuma falha, e
 * as contagens bateram com o Lovable (78 tabelas, 4 views, 38 funções, 200
 * índices, 95 regras, 30 gatilhos).
 *
 * As linhas são aplicadas em passadas: a que falha por depender de algo ainda
 * não criado (função que devolve uma tabela, padrão que chama função) entra na
 * seguinte. Rodar de novo só tenta o que não foi.
 *
 * No fim, todas as versões de `supabase/migrations/` são marcadas como
 * aplicadas: a estrutura já é a delas, e uma migration NOVA, escrita depois
 * da virada, é a única que o CLI vai querer aplicar.
 */
import { readdirSync } from "node:fs";
import { projetoNovo, sql } from "./api.mjs";

const ref = projetoNovo();

await sql(
  ref,
  `CREATE SCHEMA IF NOT EXISTS migracao;
   CREATE TABLE IF NOT EXISTS migracao.ddl (
     id bigserial, ordem int NOT NULL, sql text NOT NULL, feito boolean, erro text
   );`,
);

const [{ total }] = await sql(ref, "SELECT count(*)::int AS total FROM migracao.ddl");
if (!total) {
  console.log(
    "A planta ainda não chegou. Rode no Lovable o SQL de\n" +
      "  node scripts/migracao/sql-de-envio.mjs /tmp/planta.sql --estrutura\n" +
      "e depois este script de novo.",
  );
  process.exit(0);
}

const resultado = await sql(
  ref,
  `DO $passadas$ DECLARE r record; progresso int; passada int := 0; BEGIN
     SET LOCAL check_function_bodies = off;
     LOOP
       passada := passada + 1; progresso := 0;
       FOR r IN SELECT id, sql FROM migracao.ddl WHERE feito IS NOT TRUE ORDER BY ordem, id LOOP
         BEGIN
           EXECUTE r.sql;
           UPDATE migracao.ddl SET feito = true, erro = NULL WHERE id = r.id;
           progresso := progresso + 1;
         EXCEPTION WHEN OTHERS THEN
           UPDATE migracao.ddl SET erro = SQLERRM WHERE id = r.id;
         END;
       END LOOP;
       EXIT WHEN progresso = 0 OR passada >= 6;
     END LOOP;
   END $passadas$;
   SELECT count(*) FILTER (WHERE feito)::int AS aplicadas,
          count(*) FILTER (WHERE feito IS NOT TRUE)::int AS falharam
   FROM migracao.ddl;`,
);
const { aplicadas, falharam } = resultado[0];
console.log(`Planta: ${aplicadas} comandos aplicados, ${falharam} falharam.`);
if (falharam) {
  console.table(
    await sql(
      ref,
      "SELECT ordem, left(sql, 80) AS comando, erro FROM migracao.ddl WHERE feito IS NOT TRUE ORDER BY ordem, id LIMIT 30",
    ),
  );
  process.exit(1);
}

// Os 3 depósitos de arquivos foram criados à mão no Lovable (Cloud → Storage)
// e não estão em migration nenhuma — só as regras de acesso deles, que vieram
// na planta. Mesma configuração de lá: privados, sem limite de tamanho nem de tipo.
await sql(
  ref,
  `INSERT INTO storage.buckets (id, name, public)
   VALUES ('crm-campaign-media', 'crm-campaign-media', false),
          ('wa-midia', 'wa-midia', false),
          ('patient-files', 'patient-files', false)
   ON CONFLICT (id) DO NOTHING`,
);

const versoes = readdirSync(new URL("../../supabase/migrations/", import.meta.url))
  .filter((f) => f.endsWith(".sql"))
  .map((f) => f.replace(/\.sql$/, "").split("_"))
  .map(([version, ...nome]) => `('${version}', '${nome.join("_").replaceAll("'", "''")}')`);
await sql(
  ref,
  `CREATE SCHEMA IF NOT EXISTS supabase_migrations;
   CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
     version text PRIMARY KEY, statements text[], name text
   );
   INSERT INTO supabase_migrations.schema_migrations (version, name)
   VALUES ${versoes.join(", ")} ON CONFLICT DO NOTHING;`,
);

console.log(
  `Depósitos criados e ${versoes.length} migrations marcadas. Agora: aplicar-rotinas.mjs`,
);
