#!/usr/bin/env node
/**
 * Liga ou desliga as tarefas automáticas do banco NOVO.
 *
 *   NOVO_PROJETO_REF=xxxx node scripts/migracao/ligar-rotinas.mjs ligar
 *   NOVO_PROJETO_REF=xxxx node scripts/migracao/ligar-rotinas.mjs desligar
 *
 * Só na virada (fase 5). Ligar aqui com o Lovable ainda ligado faz os dois
 * lados mandarem o mesmo lembrete e o mesmo follow-up para o paciente.
 */
import { projetoNovo, sql } from "./api.mjs";

const acao = process.argv[2];
if (acao !== "ligar" && acao !== "desligar") {
  console.error("Uso: ligar-rotinas.mjs ligar|desligar");
  process.exit(1);
}
const ref = projetoNovo();
const linhas = await sql(
  ref,
  `SELECT cron.alter_job(jobid, active := ${acao === "ligar"}) FROM cron.job;
   SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;`,
);
console.table(linhas);
