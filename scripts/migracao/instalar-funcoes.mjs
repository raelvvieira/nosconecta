#!/usr/bin/env node
/**
 * Instala as rotinas internas (Edge Functions) no projeto NOVO e cria as
 * chaves que podem nascer novas.
 *
 *   NOVO_PROJETO_REF=xxxx node scripts/migracao/instalar-funcoes.mjs
 *
 * ── O que esta etapa grava sozinha ────────────────────────────────────────
 *
 * - VAPID (push): um par NOVO. A chave privada vai direto para os segredos do
 *   projeto; só a pública é mostrada, porque é pública (vai para o site).
 *   Trocar o par faz cada aparelho tocar em "permitir notificações" de novo —
 *   a privada do Lovable não pode ser lida, então não há como manter.
 *
 * ── O que a PESSOA cadastra (valores que só ela tem) ──────────────────────
 *
 * Supabase → Edge Functions → Secrets, copiando dos painéis de origem:
 *   OPENAI_API_KEY (se usada), BREVO_* (7), EVOLUTION_API_URL,
 *   EVOLUTION_API_KEY, WA_WEBHOOK_SECRET (o MESMO que está no .env da VPS —
 *   assim, na virada, só o endereço muda lá), WHATSAPP_WEBHOOK_SECRET.
 * Este script lista quais ainda faltam.
 *
 * `migracao-exportar` fica de fora: ela é do lado do Lovable.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { webcrypto as crypto } from "node:crypto";
import { gravarSegredosDasFuncoes, nomesDosSegredos, projetoNovo } from "./api.mjs";

const SUPABASE_CLI = "supabase@2.120.0";
const raiz = new URL("../../", import.meta.url).pathname;
const ref = projetoNovo();

const funcoes = readdirSync(new URL("../../supabase/functions/", import.meta.url), {
  withFileTypes: true,
})
  .filter((d) => d.isDirectory() && !d.name.startsWith("_") && d.name !== "migracao-exportar")
  .map((d) => d.name);

for (const nome of funcoes) {
  console.log(`\n→ ${nome}`);
  const r = spawnSync(
    "bunx",
    [SUPABASE_CLI, "functions", "deploy", nome, "--project-ref", ref, "--use-api"],
    {
      cwd: raiz,
      stdio: "inherit",
    },
  );
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const ja = new Set(await nomesDosSegredos(ref));
if (!ja.has("VAPID_PRIVATE_KEY")) {
  const b64url = (b) =>
    Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const publica = b64url(await crypto.subtle.exportKey("raw", par.publicKey));
  const { d: privada } = await crypto.subtle.exportKey("jwk", par.privateKey);
  await gravarSegredosDasFuncoes(ref, [
    { name: "VAPID_PUBLIC_KEY", value: publica },
    { name: "VAPID_PRIVATE_KEY", value: privada },
    { name: "VAPID_SUBJECT", value: "mailto:contato@nosodontoesaude.com.br" },
  ]);
  console.log(`\nPush novo criado. Chave PÚBLICA para o site: NOVO_VAPID_PUBLIC_KEY=${publica}`);
}

const DA_PESSOA = [
  "BREVO_API_KEY",
  "BREVO_SENDER_EMAIL",
  "BREVO_SENDER_NAME",
  "BREVO_SMS_SENDER",
  "BREVO_WHATSAPP_SENDER_NUMBER",
  "BREVO_WHATSAPP_TEMPLATE_CONFIRMATION",
  "BREVO_WHATSAPP_TEMPLATE_REMINDER_DAY_BEFORE",
  "BREVO_WHATSAPP_TEMPLATE_REMINDER_DAY_OF",
  "EVOLUTION_API_URL",
  "EVOLUTION_API_KEY",
  "WA_WEBHOOK_SECRET",
  "WHATSAPP_WEBHOOK_SECRET",
  "OPENAI_API_KEY",
];
const agora = new Set(await nomesDosSegredos(ref));
const faltam = DA_PESSOA.filter((n) => !agora.has(n));
console.log(
  faltam.length
    ? `\nFaltam cadastrar no painel do Supabase (Edge Functions → Secrets):\n  ${faltam.join("\n  ")}`
    : "\nTodas as chaves cadastradas.",
);
