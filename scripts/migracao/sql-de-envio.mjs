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

// Acerto final da virada: `DESDE=2026-10-27T21:00:00-03:00` manda só as linhas
// criadas OU alteradas depois desse momento (tabelas com `created_at` /
// `updated_at`), e pede para a recepção ATUALIZAR quem já existe. É o que
// pega a mensagem que chegou no Lovable enquanto a cópia grande rodava.
if (process.env.DESDE) {
  const desde = process.env.DESDE.replaceAll("'", "");
  writeFileSync(
    saida,
    `DO $acerto$
DECLARE
  r record;
  filtro text;
  n int;
  k int;
BEGIN
  FOR r IN
    SELECT c.table_name,
           bool_or(c.column_name = 'created_at') AS tem_criado,
           bool_or(c.column_name = 'updated_at') AS tem_alterado
    FROM information_schema.columns c
    JOIN pg_tables t ON t.schemaname = c.table_schema AND t.tablename = c.table_name
    WHERE c.table_schema = 'public' AND c.column_name IN ('created_at', 'updated_at')
    GROUP BY c.table_name
  LOOP
    -- Conversa e contato mudam (última mensagem, nome) sem tocar em
    -- created_at/updated_at: vão inteiros, para a ordem do chat bater.
    filtro := CASE
      WHEN r.table_name IN ('wa_conversations', 'wa_contacts') THEN 'true'
      WHEN r.tem_criado AND r.tem_alterado THEN 'greatest(created_at, updated_at)'
      WHEN r.tem_alterado THEN 'updated_at'
      ELSE 'created_at' END
      || CASE WHEN r.table_name IN ('wa_conversations', 'wa_contacts') THEN ''
              ELSE format(' > %L::timestamptz', '${desde}') END;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %s', r.table_name, filtro) INTO n;
    FOR k IN 0 .. ceil(n / ${LOTE}.0)::int - 1 LOOP
      EXECUTE format($q$
        SELECT net.http_post(
          url := %L,
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-migracao', %L),
          body := jsonb_build_object('tabela', %L, 'atualizar', true, 'linhas',
            (SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM public.%I WHERE %s ORDER BY ctid OFFSET %s LIMIT ${LOTE}) x)),
          timeout_milliseconds := 120000)$q$,
        '${destino}', '${token}', 'public.' || r.table_name, r.table_name, filtro, k * ${LOTE});
    END LOOP;
  END LOOP;
END
$acerto$;
`,
  );
  console.log(`SQL do acerto final (desde ${desde}) escrito em ${saida}`);
  process.exit(0);
}

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
