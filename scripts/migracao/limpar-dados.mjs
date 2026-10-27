#!/usr/bin/env node
/**
 * Apaga os DADOS do banco NOVO (não a estrutura), para a cópia final da
 * virada começar do zero. Recusa o banco do Lovable (`projetoNovo`).
 *
 *   NOVO_PROJETO_REF=xxxx node scripts/migracao/limpar-dados.mjs --sim
 *
 * Por que apagar em vez de só copiar por cima: o que foi APAGADO no Lovable
 * desde o ensaio (um agendamento cancelado, uma conta excluída) continuaria
 * vivo no banco novo. Começar do zero é o único jeito de os dois lados
 * ficarem iguais.
 *
 * Ficam: estrutura, logins (`auth`, recopiados por cima), arquivos (o
 * `copiar-arquivos` regrava) e as tarefas automáticas.
 */
import { projetoNovo, sql } from "./api.mjs";

if (!process.argv.includes("--sim")) {
  console.error("Apaga todos os dados do banco NOVO. Rode com --sim para confirmar.");
  process.exit(1);
}
const ref = projetoNovo();
const [{ tabelas }] = await sql(
  ref,
  `SELECT string_agg(format('public.%I', tablename), ', ') AS tabelas
   FROM pg_tables WHERE schemaname = 'public'`,
);
await sql(ref, `TRUNCATE ${tabelas} RESTART IDENTITY CASCADE`);
const [{ sobrou }] = await sql(
  ref,
  `SELECT sum((xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', tablename), false, true, '')))[1]::text::bigint) AS sobrou
   FROM pg_tables WHERE schemaname = 'public'`,
);
console.log(`Dados apagados no banco novo. Linhas restantes em public: ${sobrou}`);
