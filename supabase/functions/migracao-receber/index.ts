/**
 * Recebe os dados do banco do Lovable durante a migração. SÓ no projeto NOVO.
 *
 * ── Como os dados chegam ──────────────────────────────────────────────────
 *
 * O banco do Lovable não dá cópia nem senha. Mas ele tem `pg_net`: um SQL
 * rodado lá monta lotes de linhas (`jsonb_agg`) e os POSTa para cá. As linhas
 * vão de banco para banco — nunca passam pelo chat nem pelo terminal.
 *
 * ── Como entram ───────────────────────────────────────────────────────────
 *
 * `session_replication_role = replica` desliga gatilhos e chaves
 * estrangeiras durante a gravação. É o que permite:
 *   - lotes chegarem em qualquer ordem (o pg_net manda em paralelo, então um
 *     agendamento pode chegar antes do paciente dele);
 *   - copiar `auth.users` sem disparar os gatilhos de "conta nova" — que
 *     criariam perfil e crédito de boas-vindas DE NOVO, com outro id.
 * Os dados já eram consistentes na origem; a checagem seria só repetida.
 *
 * `ON CONFLICT DO NOTHING`: rodar de novo o mesmo lote não duplica nada.
 *
 * ── A porta ───────────────────────────────────────────────────────────────
 *
 * Fechada por `MIGRACAO_RECEPCAO_TOKEN`, que `preparar-recepcao.mjs` gera e
 * grava só no projeto novo. Sem ele cadastrado, responde 404 a tudo — por
 * isso este arquivo pode existir no repositório e até ser publicado no Lovable
 * por engano sem abrir nada. Apagar depois da virada.
 */
import postgres from "npm:postgres@3.4.9";

const NOME_VALIDO = /^(public|auth|migracao)\.[a-z_][a-z0-9_]*$/;

// Uma conexão por pedido, fechada no fim. O pg_net manda dezenas de lotes ao
// mesmo tempo e cada um sobe uma instância desta função; conexões que ficam
// abertas esgotaram o banco novo na primeira cópia ("remaining connection
// slots are reserved") e dois terços dos lotes voltaram.
function conexao() {
  return postgres(Deno.env.get("SUPABASE_DB_URL")!, { max: 1, prepare: false, idle_timeout: 1 });
}

/** As colunas que podem receber valor: fora as geradas (`GENERATED ... STORED`). */
async function colunas(sql: ReturnType<typeof postgres>, tabela: string) {
  const linhas = await sql<{ nome: string; identidade: string }[]>`
    SELECT a.attname AS nome, a.attidentity AS identidade
    FROM pg_attribute a
    WHERE a.attrelid = ${tabela}::regclass AND a.attnum > 0
      AND NOT a.attisdropped AND a.attgenerated = ''
    ORDER BY a.attnum`;
  return linhas;
}

async function gravar(tabela: string, linhas: unknown[], atualizar: boolean) {
  const sql = conexao();
  try {
    return await gravarCom(sql, tabela, linhas, atualizar);
  } finally {
    await sql.end();
  }
}

/** As colunas da chave primária — o "quem é quem" para atualizar. */
async function chave(sql: ReturnType<typeof postgres>, tabela: string) {
  const linhas = await sql<{ nome: string }[]>`
    SELECT a.attname AS nome
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
    WHERE i.indrelid = ${tabela}::regclass AND i.indisprimary`;
  return linhas.map((l) => l.nome);
}

/**
 * `atualizar`: em vez de ignorar quem já existe, sobrescreve com o que veio.
 * É o que a virada usa no fim, para trazer o que mudou NOS ÚLTIMOS MINUTOS
 * (uma conversa que ganhou mensagem, um agendamento remarcado) sem apagar e
 * copiar tudo de novo.
 */
async function gravarCom(
  sql: ReturnType<typeof postgres>,
  tabela: string,
  linhas: unknown[],
  atualizar: boolean,
) {
  const cols = await colunas(sql, tabela);
  if (!cols.length) throw new Error(`Tabela sem colunas: ${tabela}`);
  const lista = cols.map((c) => `"${c.nome}"`).join(", ");
  const sobrepor = cols.some((c) => c.identidade === "a") ? "OVERRIDING SYSTEM VALUE" : "";
  let conflito = "ON CONFLICT DO NOTHING";
  if (atualizar) {
    const pk = await chave(sql, tabela);
    const resto = cols.filter((c) => !pk.includes(c.nome) && c.identidade !== "a");
    if (pk.length && resto.length) {
      conflito = `ON CONFLICT (${pk.map((c) => `"${c}"`).join(", ")}) DO UPDATE SET ${resto
        .map((c) => `"${c.nome}" = EXCLUDED."${c.nome}"`)
        .join(", ")}`;
    }
  }
  return await sql.begin(async (tx) => {
    await tx.unsafe("SET LOCAL session_replication_role = replica");
    const feito = await tx.unsafe(
      `INSERT INTO ${tabela} (${lista}) ${sobrepor}
       SELECT ${lista} FROM jsonb_populate_recordset(NULL::${tabela}, $1::text::jsonb)
       ${conflito}`,
      [JSON.stringify(linhas)],
    );
    return feito.count;
  });
}

/** Depois da cópia: cada sequência volta a contar a partir do maior id copiado. */
async function acertarSequencias() {
  const sql = conexao();
  try {
    return await acertarCom(sql);
  } finally {
    await sql.end();
  }
}

async function acertarCom(sql: ReturnType<typeof postgres>) {
  const seqs = await sql<{ tabela: string; coluna: string; seq: string }[]>`
    SELECT n.nspname || '.' || c.relname AS tabela, a.attname AS coluna,
           pg_get_serial_sequence(n.nspname || '.' || c.relname, a.attname) AS seq
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
      AND pg_get_serial_sequence(n.nspname || '.' || c.relname, a.attname) IS NOT NULL`;
  for (const s of seqs) {
    await sql.unsafe(
      `SELECT setval('${s.seq}', COALESCE((SELECT max("${s.coluna}") FROM ${s.tabela}), 0) + 1, false)`,
    );
  }
  return seqs.length;
}

Deno.serve(async (req) => {
  const esperado = Deno.env.get("MIGRACAO_RECEPCAO_TOKEN");
  if (!esperado) return new Response("Not found", { status: 404 });
  if (req.method !== "POST" || req.headers.get("x-migracao") !== esperado) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const corpo = await req.json();
    if (corpo.acao === "sequencias") {
      return Response.json({ ok: true, sequencias: await acertarSequencias() });
    }
    const tabela = String(corpo.tabela ?? "");
    if (!NOME_VALIDO.test(tabela))
      return Response.json({ ok: false, erro: "tabela inválida" }, { status: 400 });
    const linhas = Array.isArray(corpo.linhas) ? corpo.linhas : [];
    const gravadas = linhas.length ? await gravar(tabela, linhas, corpo.atualizar === true) : 0;
    return Response.json({ ok: true, tabela, recebidas: linhas.length, gravadas });
  } catch (erro) {
    // A mensagem do Postgres diz a coluna e o motivo, nunca o conteúdo da linha.
    return Response.json({ ok: false, erro: (erro as Error).message }, { status: 500 });
  }
});
