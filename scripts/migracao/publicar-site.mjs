#!/usr/bin/env node
/**
 * Publica o sistema na Cloudflare da pessoa, ligado ao projeto NOVO.
 *
 *   NOVO_PROJETO_REF=xxxx node scripts/migracao/publicar-site.mjs
 *
 * Opcional: NOVO_VAPID_PUBLIC_KEY (a chave PÚBLICA do push novo).
 *
 * ── O que é igual ao Lovable ──────────────────────────────────────────────
 *
 * O mesmo `vite build` de sempre: o preset `@lovable.dev/vite-tanstack-config`
 * já gera o pacote da Cloudflare em `.output/server/`. Só muda para ONDE ele
 * aponta:
 *   - `VITE_SUPABASE_*` no ambiente do build vencem o `.env` (regra do Vite),
 *     então o navegador fala com o projeto novo sem tocar no `.env`, que é do
 *     Lovable;
 *   - no servidor, `SUPABASE_URL` e a chave pública vão como variáveis do
 *     Worker, e a chave de serviço como SEGREDO, gravada pela API — ela não
 *     aparece em comando, log nem arquivo.
 *
 * O Worker se chama `nos-conecta` e fica em `nos-conecta.<conta>.workers.dev`
 * até a virada, quando o domínio passa a apontar para ele.
 */
import { spawnSync } from "node:child_process";
import { chavesDoProjeto, contaDaCloudflare, gravarSegredoNoWorker, projetoNovo } from "./api.mjs";

const WORKER = "nos-conecta";
const WRANGLER = "wrangler@4.145.0";
const raiz = new URL("../../", import.meta.url).pathname;

const ref = projetoNovo();
const { url, anon, servico } = await chavesDoProjeto(ref);
if (!anon || !servico) throw new Error("As chaves do projeto novo não vieram da API.");
const conta = await contaDaCloudflare();

function rodar(comando, args, env) {
  const r = spawnSync(comando, args, {
    cwd: raiz,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

rodar("bunx", ["vite", "build"], { VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: anon });

const vars = [`SUPABASE_URL:${url}`, `SUPABASE_PUBLISHABLE_KEY:${anon}`];
if (process.env.NOVO_VAPID_PUBLIC_KEY)
  vars.push(`VAPID_PUBLIC_KEY:${process.env.NOVO_VAPID_PUBLIC_KEY}`);
rodar(
  "bunx",
  [
    WRANGLER,
    "deploy",
    "-c",
    ".output/server/wrangler.json",
    "--name",
    WORKER,
    ...vars.flatMap((v) => ["--var", v]),
  ],
  { CLOUDFLARE_ACCOUNT_ID: conta.id },
);

await gravarSegredoNoWorker(conta.id, WORKER, "SUPABASE_SERVICE_ROLE_KEY", servico);
console.log(`\nNo ar em https://${WORKER}.<sua-conta>.workers.dev — conta "${conta.name}".`);
