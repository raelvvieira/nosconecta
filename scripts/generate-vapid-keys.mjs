// Gera o par de chaves VAPID do Web Push.
//
// Rodar:  node scripts/generate-vapid-keys.mjs
//
// As duas chaves vão para Cloud → Secrets no Lovable (VAPID_PUBLIC_KEY e
// VAPID_PRIVATE_KEY). A privada NUNCA entra no repositório, no .env commitado
// nem em conversa — é ela que autoriza enviar notificação em nome do app.
//
// Gere uma vez só: trocar a chave depois invalida todas as inscrições já
// feitas, e cada aparelho precisaria ativar o push de novo.

import { webcrypto as crypto } from "node:crypto";

const b64url = (bytes) =>
  Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
  "sign",
  "verify",
]);

// Pública: ponto P-256 não comprimido (65 bytes, 0x04 || X || Y).
const publicKey = b64url(await crypto.subtle.exportKey("raw", pair.publicKey));
// Privada: o escalar `d` do JWK, que já vem em base64url.
const { d: privateKey } = await crypto.subtle.exportKey("jwk", pair.privateKey);

console.log("\nCadastre em Cloud → Secrets no Lovable:\n");
console.log(`VAPID_PUBLIC_KEY   = ${publicKey}`);
console.log(`VAPID_PRIVATE_KEY  = ${privateKey}`);
console.log(`VAPID_SUBJECT      = mailto:seu-email@dominio.com`);
console.log("\nA privada é segredo: não commite e não cole em chat.\n");
