#!/usr/bin/env node
/**
 * Publica a página de vendas (site/vendas) num Worker só de arquivos e liga o
 * endereço conecta.nosodontoesaude.com.br a ele.
 *
 *   node scripts/publicar-vendas.mjs
 *
 * A página é escrita em `site/vendas/pagina.html` com marcadores `{{HERO}}`,
 * `{{LOGO}}`… no lugar das imagens; este script embute as imagens de
 * `site/vendas/img/` como data: URI e monta o `index.html` completo em
 * `site/vendas/publico/`, que é o que o wrangler sobe. Uma página só, sem
 * arquivo externo: carrega de uma vez e não depende de mais nada.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const WRANGLER = "wrangler@4.145.0";
const ZONA = "440cb5c1d1eaca2142475630d39e7c67";
const CONTA = "18addf7eaf577f7f9c8e6d1ca8a3777e";
const WORKER = "nos-conecta-vendas";
const HOST = "conecta.nosodontoesaude.com.br";

const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) throw new Error("Falta CLOUDFLARE_API_TOKEN no ambiente.");

const pasta = new URL("../site/vendas/", import.meta.url);
const img = (nome, tipo) =>
  `data:image/${tipo};base64,${readFileSync(new URL(`img/${nome}`, pasta)).toString("base64")}`;

let html = readFileSync(new URL("pagina.html", pasta), "utf8")
  .replaceAll("{{HERO}}", img("hero.webp", "webp"))
  .replaceAll("{{LUNA}}", img("luna.webp", "webp"))
  .replaceAll("{{FIN}}", img("fin.webp", "webp"))
  .replaceAll("{{GESTAO}}", img("gestao.webp", "webp"))
  .replaceAll("{{OFFICE}}", img("office.webp", "webp"))
  .replaceAll("{{LOGO}}", img("logo.png", "png"));

html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Sistema odontológico com assistentes de I.A. que atendem, agendam e organizam o financeiro pelo WhatsApp.">
<link rel="icon" href="/favicon.png">
${html}
</body>
</html>
`
  .replace("<title>", "<title>")
  .replace("</style>\n\n<nav>", "</style>\n</head>\n<body>\n<nav>");

mkdirSync(new URL("publico/", pasta), { recursive: true });
writeFileSync(new URL("publico/index.html", pasta), html);
writeFileSync(
  new URL("publico/favicon.png", pasta),
  readFileSync(new URL("../public/favicon.png", import.meta.url)),
);
console.log(`index.html: ${(html.length / 1024).toFixed(0)} KB`);

execFileSync("bunx", [WRANGLER, "deploy", "--config", "site/vendas/wrangler.toml"], {
  stdio: "inherit",
  env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: CONTA },
});

async function cf(caminho, init = {}) {
  const r = await fetch(`https://api.cloudflare.com/client/v4${caminho}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const j = await r.json();
  if (!j.success) throw new Error(`${caminho}: ${JSON.stringify(j.errors)}`);
  return j.result;
}
const dominios = await cf(`/accounts/${CONTA}/workers/domains`);
if (!dominios.some((d) => d.hostname === HOST)) {
  await cf(`/accounts/${CONTA}/workers/domains`, {
    method: "PUT",
    body: JSON.stringify({
      environment: "production",
      hostname: HOST,
      service: WORKER,
      zone_id: ZONA,
    }),
  });
}
console.log(`No ar: https://${HOST}`);
