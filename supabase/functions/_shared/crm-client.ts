// Low-level HTTP helper shared by the CRM integration (Wavy white-label
// CRM). Handles JSON parsing/error shaping the same way for both domains
// (crm.wavymarketing.com.br and flow.wavymarketing.com.br) — auth/token
// logic lives in crm-auth.ts, which is the only caller of this module.

export interface RawResponse {
  ok: boolean;
  status: number;
  json: any;
}

export async function rawFetch(baseUrl: string, path: string, init: RequestInit = {}): Promise<RawResponse> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
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
  return { ok: res.ok, status: res.status, json };
}
