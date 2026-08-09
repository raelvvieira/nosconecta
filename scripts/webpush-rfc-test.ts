// Valida a cifragem do Web Push contra o vetor de teste publicado na
// RFC 8291 §5. Se a saída bate byte a byte com a da RFC, a implementação
// está correta — é o único jeito de ter certeza sem um navegador real.
//
// Rodar:  bun scripts/webpush-rfc-test.ts
//
// (bun porque roda TypeScript direto; o módulo em si não usa nada de Deno,
// só WebCrypto, então roda igual nos dois.)

import { b64urlToBytes, bytesToB64url, encryptPayload } from "../supabase/functions/_shared/webpush.ts";

// Valores exatos da RFC 8291 §5.
const PLAINTEXT = "When I grow up, I want to be a watermelon";
const UA_PUBLIC = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
const AUTH_SECRET = "BTBZMqHH6r4Tts7J_aSIgg";
const AS_PRIVATE = "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw";
const AS_PUBLIC = "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";
const SALT = "DGv6ra1nlYgDCS1FRnbzlw";
const EXPECTED =
  "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN";

// O par efêmero do remetente é fixo no vetor; em produção ele é sorteado.
const asPublicBytes = b64urlToBytes(AS_PUBLIC);
const privateKey = await crypto.subtle.importKey(
  "jwk",
  {
    kty: "EC",
    crv: "P-256",
    d: AS_PRIVATE,
    x: bytesToB64url(asPublicBytes.subarray(1, 33)),
    y: bytesToB64url(asPublicBytes.subarray(33, 65)),
    ext: true,
  },
  { name: "ECDH", namedCurve: "P-256" },
  true,
  ["deriveBits"],
);
const publicKey = await crypto.subtle.importKey(
  "raw",
  asPublicBytes,
  { name: "ECDH", namedCurve: "P-256" },
  true,
  [],
);

const result = await encryptPayload(PLAINTEXT, UA_PUBLIC, AUTH_SECRET, {
  salt: b64urlToBytes(SALT),
  localKeyPair: { privateKey, publicKey },
});

const got = bytesToB64url(result.body);

if (got === EXPECTED) {
  console.log("RFC 8291 §5: OK — saída idêntica ao vetor de teste");
  console.log(`  ${got.length} caracteres base64url conferidos`);
} else {
  console.error("RFC 8291 §5: FALHOU");
  console.error("  esperado:", EXPECTED);
  console.error("  obtido:  ", got);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Segunda checagem: a assinatura VAPID. O vetor da RFC 8291 cobre só a
// cifragem; quem assina é a RFC 8292, e o pedaço delicado é remontar a chave
// privada num JWK (WebCrypto não importa escalar cru). Aqui o JWT é gerado e
// verificado de volta com a chave pública — se fecha, a importação está certa.

const { vapidAuthorization } = await import("../supabase/functions/_shared/webpush.ts");

const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
  "sign",
  "verify",
])) as CryptoKeyPair;

const vapidPublic = bytesToB64url(
  new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)),
);
const { d: vapidPrivate } = await crypto.subtle.exportKey("jwk", pair.privateKey);

const header = await vapidAuthorization(
  "https://fcm.googleapis.com/fcm/send/abc123",
  "mailto:teste@nosconecta.app",
  vapidPublic,
  vapidPrivate!,
);

const token = header.match(/t=([^,]+)/)?.[1] ?? "";
const [h, p, sig] = token.split(".");
const valid = await crypto.subtle.verify(
  { name: "ECDSA", hash: "SHA-256" },
  pair.publicKey,
  b64urlToBytes(sig),
  new TextEncoder().encode(`${h}.${p}`),
);

const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
const audOk = claims.aud === "https://fcm.googleapis.com";
const expOk = claims.exp > Math.floor(Date.now() / 1000);

if (valid && audOk && expOk && header.includes(`k=${vapidPublic}`)) {
  console.log("VAPID (RFC 8292): OK — assinatura confere e aud/exp corretos");
} else {
  console.error("VAPID (RFC 8292): FALHOU", { valid, audOk, expOk });
  process.exit(1);
}
