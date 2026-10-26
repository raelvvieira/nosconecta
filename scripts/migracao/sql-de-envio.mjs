#!/usr/bin/env node
/**
 * Escreve o SQL que, rodado NO BANCO DO LOVABLE, envia as tabelas para o
 * projeto novo por `pg_net`. O SQL vai para um arquivo, não para a tela.
 *
 *   [DE=0 ATE=15] node scripts/migracao/sql-de-envio.mjs <saida.sql> [tabela ...]
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
 * Lotes de 100 linhas: as conversas do WhatsApp têm texto longo, e um lote
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
const LOTE = 100;

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

// Em ondas: só os lotes de número [de, ate) — contados em sequência por todas
// as tabelas. Mandar tudo de uma vez esgotou as conexões do banco novo na
// primeira cópia: o pg_net dispara os pedidos em paralelo. Ondas de ~15.
const de = Number(process.env.DE ?? 0);
const ate = Number(process.env.ATE ?? 1e9);

writeFileSync(
  saida,
  `DO $envio$
DECLARE
  t text;
  total int;
  k int;
  g int := 0;
  enviados int := 0;
BEGIN
  FOREACH t IN ARRAY ${lista} LOOP
    EXECUTE format('SELECT ceil(count(*) / ${LOTE}.0)::int FROM %s', t) INTO total;
    FOR k IN 0 .. total - 1 LOOP
      IF g >= ${de} AND g < ${ate} THEN
        EXECUTE format($q$
          SELECT net.http_post(
            url := %L,
            headers := jsonb_build_object('Content-Type', 'application/json', 'x-migracao', %L),
            body := jsonb_build_object('tabela', %L, 'linhas',
              (SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM %s ORDER BY ctid OFFSET %s LIMIT ${LOTE}) x)),
            timeout_milliseconds := 120000)$q$,
          '${destino}', '${token}', t, t, k * ${LOTE});
        enviados := enviados + 1;
      END IF;
      g := g + 1;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'lotes % a %: % enviados de % no total', ${de}, ${ate}, enviados, g;
END
$envio$;

-- Resultado de cada lote, depois de alguns segundos:
-- SELECT status_code, left(content, 120), count(*) FROM net._http_response
--  WHERE created > now() - interval '10 minutes' GROUP BY 1, 2;
`,
);
console.log(`SQL escrito em ${saida}`);
