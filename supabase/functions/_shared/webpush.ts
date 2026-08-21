// Web Push: assinatura VAPID (RFC 8292) e cifragem do payload (RFC 8291,
// content-encoding aes128gcm).
//
// Escrito à mão sobre WebCrypto em vez de usar `npm:web-push` porque um
// especificador npm que não resolva no ambiente do Supabase só falharia no
// deploy — e aqui não há como testar isso. A implementação à mão, ao
// contrário, é verificável: `webpush.test.mjs` roda o vetor de teste
// publicado na RFC 8291 §5 e confere byte a byte.

const encoder = new TextEncoder();

// ---------- base64url ----------

export function b64urlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function bytesToB64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

// ---------- HKDF (RFC 5869) ----------

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm as ArrayBufferView, "HKDF", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt as ArrayBufferView,
      info: info as ArrayBufferView,
    },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

// ---------- chaves ----------

/** Chave pública P-256 crua (65 bytes, 0x04 || X || Y) → CryptoKey. */
async function importPublicKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    raw as ArrayBufferView,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );
}

async function exportPublicKey(key: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.exportKey("raw", key));
}

/**
 * Chave privada VAPID (32 bytes crus, base64url) → CryptoKey para ES256.
 * WebCrypto não importa escalar cru, então é preciso montar um JWK — e para
 * isso a pública precisa acompanhar, que é como o par VAPID é distribuído.
 */
async function importVapidKey(privateKeyB64: string, publicKeyB64: string): Promise<CryptoKey> {
  const pub = b64urlToBytes(publicKeyB64);
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error("VAPID_PUBLIC_KEY deve ser um ponto P-256 não comprimido (65 bytes).");
  }
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    d: privateKeyB64,
    x: bytesToB64url(pub.subarray(1, 33)),
    y: bytesToB64url(pub.subarray(33, 65)),
    ext: true,
  };
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, [
    "sign",
  ]);
}

// ---------- VAPID (RFC 8292) ----------

export async function vapidAuthorization(
  endpoint: string,
  subject: string,
  publicKey: string,
  privateKey: string,
): Promise<string> {
  const { origin } = new URL(endpoint);
  const header = bytesToB64url(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = bytesToB64url(
    encoder.encode(
      JSON.stringify({
        aud: origin,
        // 12h. O limite da spec é 24h; ficar bem abaixo evita rejeição por
        // relógio dessincronizado no serviço de push.
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: subject,
      }),
    ),
  );

  const signingInput = `${header}.${payload}`;
  const key = await importVapidKey(privateKey, publicKey);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    encoder.encode(signingInput),
  );

  return `vapid t=${signingInput}.${bytesToB64url(new Uint8Array(signature))}, k=${publicKey}`;
}

// ---------- cifragem do payload (RFC 8291) ----------

export interface EncryptedPayload {
  body: Uint8Array;
  headers: Record<string, string>;
}

/**
 * @param salt e `localKeys` existem só para o teste da RFC poder injetar os
 *   valores do vetor. Em produção ficam ausentes e são sorteados.
 */
export async function encryptPayload(
  plaintext: string,
  clientPublicKeyB64: string,
  authSecretB64: string,
  overrides?: { salt?: Uint8Array; localKeyPair?: CryptoKeyPair },
): Promise<EncryptedPayload> {
  const clientPublic = b64urlToBytes(clientPublicKeyB64);
  const authSecret = b64urlToBytes(authSecretB64);
  const salt = overrides?.salt ?? crypto.getRandomValues(new Uint8Array(16));

  const localKeys =
    overrides?.localKeyPair ??
    ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
      "deriveBits",
    ])) as CryptoKeyPair);
  const localPublic = await exportPublicKey(localKeys.publicKey);

  // ECDH cru entre a nossa efêmera e a pública do assinante.
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: await importPublicKey(clientPublic) },
      localKeys.privateKey,
      256,
    ),
  );

  // PRK combinado: o auth_secret vira o sal, e o info amarra as duas chaves
  // públicas — é o que impede reusar a cifra com outro destinatário.
  const authInfo = concat(
    encoder.encode("WebPush: info\0"),
    clientPublic,
    localPublic,
  );
  const ikm = await hkdf(authSecret, sharedSecret, authInfo, 32);

  const contentEncryptionKey = await hkdf(
    salt,
    ikm,
    encoder.encode("Content-Encoding: aes128gcm\0"),
    16,
  );
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);

  // O padding do aes128gcm é um delimitador: 0x02 marca o último (e único)
  // registro. Sem ele o navegador rejeita a mensagem.
  const record = concat(encoder.encode(plaintext), new Uint8Array([0x02]));

  const aesKey = await crypto.subtle.importKey(
    "raw",
    contentEncryptionKey as ArrayBufferView,
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce as ArrayBufferView, tagLength: 128 },
      aesKey,
      record as ArrayBufferView,
    ),
  );

  // Cabeçalho aes128gcm: salt(16) | rs(4, big-endian) | idlen(1) | keyid
  const header = new Uint8Array(16 + 4 + 1 + localPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096, false);
  header[20] = localPublic.length;
  header.set(localPublic, 21);

  return {
    body: concat(header, ciphertext),
    headers: {
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
    },
  };
}

// ---------- envio ----------

export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface SendResult {
  ok: boolean;
  status: number;
  /** true quando o serviço de push diz que a inscrição morreu (404/410). */
  gone: boolean;
  error: string | null;
}

export async function sendPush(
  subscription: PushSubscriptionRecord,
  payload: unknown,
  vapid: { subject: string; publicKey: string; privateKey: string },
  ttlSeconds = 60 * 60 * 24,
): Promise<SendResult> {
  try {
    const encrypted = await encryptPayload(
      JSON.stringify(payload),
      subscription.p256dh,
      subscription.auth,
    );
    const authorization = await vapidAuthorization(
      subscription.endpoint,
      vapid.subject,
      vapid.publicKey,
      vapid.privateKey,
    );

    const res = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        ...encrypted.headers,
        authorization,
        ttl: String(ttlSeconds),
        urgency: "normal",
      },
      body: encrypted.body,
      signal: AbortSignal.timeout(15_000),
    });

    if (res.ok) return { ok: true, status: res.status, gone: false, error: null };

    const text = await res.text().catch(() => "");
    return {
      ok: false,
      status: res.status,
      gone: res.status === 404 || res.status === 410,
      error: text || `Serviço de push respondeu ${res.status}`,
    };
  } catch (e) {
    return { ok: false, status: 0, gone: false, error: String(e) };
  }
}
