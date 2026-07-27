// Thin wrapper around a self-hosted Evolution API instance (WhatsApp
// Web/Baileys — unofficial, separate from the Brevo/Meta official WhatsApp
// Business Platform integration used for appointment notifications).
// EVOLUTION_API_URL and EVOLUTION_API_KEY are Supabase Edge Function
// secrets, never hardcoded here.
//
// Evolution API's exact field names vary a bit across v1/v2 and self-hosted
// versions, so responses are parsed defensively (see extractQrCode /
// extractConnectionStatus) rather than assuming one fixed shape.

function apiUrl(): string {
  const url = Deno.env.get("EVOLUTION_API_URL");
  if (!url) throw new Error("EVOLUTION_API_URL não configurada");
  return url.replace(/\/$/, "");
}

function apiKey(): string {
  const key = Deno.env.get("EVOLUTION_API_KEY");
  if (!key) throw new Error("EVOLUTION_API_KEY não configurada");
  return key;
}

async function evoFetch(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${apiUrl()}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      apikey: apiKey(),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`Evolution API ${path} falhou (${res.status}): ${text}`);
  }
  return json;
}

const WEBHOOK_EVENTS = ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"];

export async function createInstance(instanceName: string, webhookUrl: string) {
  return evoFetch("/instance/create", {
    method: "POST",
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      webhook: { url: webhookUrl, events: WEBHOOK_EVENTS },
    }),
  });
}

export async function setWebhook(instanceName: string, webhookUrl: string) {
  return evoFetch(`/webhook/set/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({ webhook: { url: webhookUrl, events: WEBHOOK_EVENTS } }),
  });
}

export async function connectInstance(instanceName: string) {
  return evoFetch(`/instance/connect/${instanceName}`, { method: "GET" });
}

export async function getConnectionState(instanceName: string) {
  return evoFetch(`/instance/connectionState/${instanceName}`, { method: "GET" });
}

export async function sendTextMessage(instanceName: string, number: string, text: string) {
  return evoFetch(`/message/sendText/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({ number, text }),
  });
}

// Field name varies by Evolution version — try the known shapes.
export function extractQrCode(response: any): string | null {
  return response?.base64 ?? response?.qrcode?.base64 ?? response?.qr?.base64 ?? null;
}

export function extractConnectionStatus(response: any): string | null {
  return response?.instance?.state ?? response?.state ?? null;
}

// Maps Evolution's connection state strings to our own status enum.
export function normalizeStatus(raw: string | null | undefined): "open" | "connecting" | "disconnected" | "error" {
  if (raw === "open") return "open";
  if (raw === "connecting") return "connecting";
  if (raw === "close" || raw === "closed") return "disconnected";
  return "error";
}
