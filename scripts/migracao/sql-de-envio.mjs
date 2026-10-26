#!/usr/bin/env node
/**
 * Escreve o SQL que, rodado NO BANCO DO LOVABLE, envia as tabelas para o
 * projeto novo por `pg_net`. O SQL vai para um arquivo, não para a tela.
 *
 *   node scripts/migracao/sql-de-envio.mjs <saida.sql> [tabela ...]
 *
 * Sem tabelas: logins (`auth.users`, `auth.identities`) e todas as tabelas
 * de `public`. O envio só LÊ do Lovable; a escrita é na fila do pg_net, que
 * se esvazia sozinha.
 *
 * Rodar esse SQL no Lovable manda dados de paciente para fora dele — só com
 * autorização da pessoa, e só depois de `preparar-recepcao.mjs`.
 *
 * `--estrutura` no lugar das tabelas: envia a PLANTA do banco (`estrutura.sql`)
 * para `migracao.ddl` no projeto novo — só estrutura, nenhum dado. É o
 * primeiro passo de `montar-banco.mjs`.
 *
 * Lotes de 300 linhas: as conversas do WhatsApp têm texto longo, e um lote
 * grande demais estoura o tempo da função do outro lado.
 */
import { readFileSync, writeFileSync } from "node:fs";

const [saida, ...tabelas] = process.argv.slice(2);
if (!saida) {
  console.error("Uso: sql-de-envio.mjs <saida.sql> [tabela ...]");
  process.exit(1);
}
const { ref, token } = JSON.parse(readFileSync(new URL("./.recepcao", import.meta.url), "utf8"));
const destino = `https://${ref}.supabase.co/functions/v1/migracao-receber`;
const LOTE = 300;

if (tabelas[0] === "--estrutura") {
  const planta = readFileSync(new URL("./estrutura.sql", import.meta.url), "utf8");
  const consulta = planta.slice(planta.indexOf("WITH")).trim();
  writeFileSync(
    saida,
    `SELECT net.http_post(
  url := '${destino}',
  headers := jsonb_build_object('Content-Type', 'application/json', 'x-migracao', '${token}'),
  body := jsonb_build_object('tabela', 'migracao.ddl', 'linhas', (
    SELECT jsonb_agg(jsonb_build_object('ordem', ordem, 'sql', sql)) FROM (
${consulta}
    ) planta)),
  timeout_milliseconds := 120000
) AS pedido;
`,
  );
  console.log(`SQL da planta escrito em ${saida}`);
  process.exit(0);
}

const lista = tabelas.length
  ? `ARRAY[${tabelas.map((t) => `'${t.replaceAll("'", "")}'`).join(", ")}]`
  : `ARRAY['auth.users', 'auth.identities'] || ARRAY(
       SELECT 'public.' || tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename)`;

writeFileSync(
  saida,
  `DO $envio$
DECLARE
  t text;
  pedidos int := 0;
  n int;
BEGIN
  FOREACH t IN ARRAY ${lista} LOOP
    EXECUTE format($q$
      SELECT count(*) FROM (
        SELECT net.http_post(
          url := %L,
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-migracao', %L),
          body := jsonb_build_object('tabela', %L, 'linhas', jsonb_agg(to_jsonb(l) - 'lote_da_migracao')),
          timeout_milliseconds := 120000
        )
        FROM (SELECT x.*, (row_number() OVER ()) / ${LOTE} AS lote_da_migracao FROM %s x) l
        GROUP BY lote_da_migracao
      ) q$q$, '${destino}', '${token}', t, t) INTO n;
    pedidos := pedidos + n;
  END LOOP;
  RAISE NOTICE '% lotes na fila do pg_net', pedidos;
END
$envio$;

-- Depois de alguns minutos, o resultado de cada lote:
-- SELECT status_code, count(*) FROM net._http_response
--  WHERE created > now() - interval '1 hour' GROUP BY 1;
`,
);
console.log(`SQL escrito em ${saida}`);
