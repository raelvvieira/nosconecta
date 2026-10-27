#!/usr/bin/env node
/**
 * Aponta `login` e `club` para o sistema NOVO (Worker na Cloudflare) — ou de
 * volta para o Lovable.
 *
 *   node scripts/migracao/trocar-dominio.mjs novo
 *   node scripts/migracao/trocar-dominio.mjs lovable   ← volta, se precisar
 *
 * No modo "novo", o registro A que apontava para o Lovable sai e o endereço
 * vira domínio próprio do Worker (a Cloudflare cria o DNS e o certificado).
 * No modo "lovable", o domínio próprio sai e o registro A volta como era
 * (`185.158.133.1`, só DNS). As verificações `_lovable.*` não são tocadas:
 * com elas no lugar, voltar funciona sem refazer nada no Lovable.
 */
const ZONA = "440cb5c1d1eaca2142475630d39e7c67";
const CONTA = "18addf7eaf577f7f9c8e6d1ca8a3777e";
const WORKER = "nos-conecta";
const DOMINIO = "nosodontoesaude.com.br";
const HOSTS = ["login", "club"];
const IP_DO_LOVABLE = "185.158.133.1";

const modo = process.argv[2];
if (modo !== "novo" && modo !== "lovable") {
  console.error("Uso: trocar-dominio.mjs novo|lovable");
  process.exit(1);
}
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) throw new Error("Falta CLOUDFLARE_API_TOKEN no ambiente.");

async function cf(caminho, init = {}) {
  const r = await fetch(`https://api.cloudflare.com/client/v4${caminho}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  // Apagar domínio do Worker devolve corpo vazio (204).
  const texto = await r.text();
  if (!texto) {
    if (!r.ok) throw new Error(`${caminho}: ${r.status}`);
    return null;
  }
  const j = JSON.parse(texto);
  if (!j.success) throw new Error(`${caminho}: ${JSON.stringify(j.errors)}`);
  return j.result;
}

const dominiosDoWorker = await cf(`/accounts/${CONTA}/workers/domains`);

for (const host of HOSTS) {
  const nome = `${host}.${DOMINIO}`;
  const registros = await cf(`/zones/${ZONA}/dns_records?name=${nome}`);
  const doWorker = dominiosDoWorker.find((d) => d.hostname === nome);

  if (modo === "novo") {
    for (const r of registros.filter((r) => r.type === "A" || r.type === "CNAME")) {
      await cf(`/zones/${ZONA}/dns_records/${r.id}`, { method: "DELETE" });
    }
    if (!doWorker) {
      await cf(`/accounts/${CONTA}/workers/domains`, {
        method: "PUT",
        body: JSON.stringify({
          environment: "production",
          hostname: nome,
          service: WORKER,
          zone_id: ZONA,
        }),
      });
    }
    console.log(`${nome} → sistema novo`);
  } else {
    if (doWorker)
      await cf(`/accounts/${CONTA}/workers/domains/${doWorker.id}`, { method: "DELETE" });
    if (!registros.some((r) => r.type === "A" && r.content === IP_DO_LOVABLE)) {
      await cf(`/zones/${ZONA}/dns_records`, {
        method: "POST",
        body: JSON.stringify({
          type: "A",
          name: host,
          content: IP_DO_LOVABLE,
          proxied: false,
          ttl: 1,
        }),
      });
    }
    console.log(`${nome} → Lovable`);
  }
}
