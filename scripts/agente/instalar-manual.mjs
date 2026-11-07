/**
 * Troca o manual (MD) da assistente de UMA conta, com cópia de segurança.
 *
 *   node scripts/agente/instalar-manual.mjs --conta demo@x.com --arquivo docs/AGENTE_CORE_V5_1_UNIVERSAL.md
 *       (só mostra o que faria: NADA é gravado)
 *   node scripts/agente/instalar-manual.mjs --conta demo@x.com --arquivo docs/... --aplicar
 *   node scripts/agente/instalar-manual.mjs --conta demo@x.com --arquivo scripts/agente/backups/X.md --aplicar
 *       (voltar ao manual anterior: o "arquivo" é a cópia de segurança)
 *
 * Por que existe: o manual de cada conta mora no banco (ai_agents.instrucao_base) e a
 * tela sobrescreve sem guardar o anterior. Aqui o anterior é salvo em arquivo ANTES
 * de qualquer troca, para dar para voltar (e comparar). Nunca mexe em mais de uma
 * conta por vez, e recusa a troca se o texto novo tiver variável desconhecida.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { projetoNovo, sql } from "../migracao/api.mjs";

const arg = (nome) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : null;
};
const aplicar = process.argv.includes("--aplicar");
const conta = arg("conta");
const arquivo = arg("arquivo");
if (!conta || !arquivo) {
  console.error("Uso: --conta <e-mail do dono> --arquivo <md> [--aplicar]");
  process.exit(1);
}
const novo = readFileSync(arquivo, "utf8");
const conhecidas = ["ASSISTENTE", "CONSULTORIO", "RESPONSAVEL", "RESPONSAVEL_NOME"];
const desconhecidas = [
  ...new Set([...novo.matchAll(/\{\{\s*([A-Za-z_]+)\s*\}\}/g)].map((m) => m[1])),
].filter((v) => !conhecidas.includes(v.toUpperCase()));
if (desconhecidas.length) {
  console.error("Recusado: variáveis desconhecidas no texto:", desconhecidas.join(", "));
  process.exit(1);
}
const ref = projetoNovo();
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const [dono] = await sql(
  ref,
  `select u.id from auth.users u where lower(u.email) = lower(${q(conta)})`,
);
if (!dono) throw new Error("Nenhum login com esse e-mail.");
const [agente] = await sql(
  ref,
  `select a.id, length(coalesce(a.instrucao_base,'')) tamanho, a.instrucao_base from ai_agents a where a.owner_id = '${dono.id}'`,
);
if (!agente) throw new Error("Essa conta não tem assistente cadastrada.");
console.log(
  `Conta ${conta}: manual atual com ${agente.tamanho} caracteres; novo com ${novo.length}.`,
);
if (!aplicar) {
  console.log("Simulação: nada foi gravado. Acrescente --aplicar para trocar.");
  process.exit(0);
}
mkdirSync(new URL("./backups/", import.meta.url), { recursive: true });
const copia = new URL(
  `./backups/${conta.replace(/[^a-z0-9]/gi, "_")}-${new Date().toISOString().replace(/[:.]/g, "-")}.md`,
  import.meta.url,
);
writeFileSync(copia, agente.instrucao_base ?? "");
console.log("Cópia do manual anterior:", copia.pathname);
await sql(
  ref,
  `update ai_agents set instrucao_base = $manual$${novo}$manual$, updated_at = now() where id = '${agente.id}' and owner_id = '${dono.id}'`,
);
console.log("Manual trocado.");
process.exit(0);
