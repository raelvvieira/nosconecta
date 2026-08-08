// Low-level HTTP helper shared by the CRM integration (Wavy white-label
// CRM). Handles JSON parsing/error shaping the same way for both domains
// (api.wavymarketing.com.br and flow.wavymarketing.com.br) — auth/token
// logic lives in crm-auth.ts, which is the only caller of this module.

export interface RawResponse {
  ok: boolean;
  status: number;
  json: any;
}

// Sem timeout, uma resposta lenta do CRM deixava a tela presa em "carregando"
// por muito tempo antes de eventualmente falhar (ou nunca falhar de fato) —
// parecendo travado. 15s converte "muito lento" em erro rápido e claro, que
// as telas de erro já tratam.
const REQUEST_TIMEOUT_MS = 15_000;

export async function rawFetch(baseUrl: string, path: string, init: RequestInit = {}): Promise<RawResponse> {
  // Com FormData (envio de anexo), o content-type NÃO pode ser definido por
  // nós: o fetch precisa gerar o header com o boundary do multipart. Fixar
  // application/json aqui quebraria o upload.
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      ...(isFormData ? {} : { "content-type": "application/json" }),
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

// Confirmado com dados reais: toda resposta do CRM (login, contatos,
// campanhas, ...) vem envelopada como { success, data, meta? }. Desembrulha
// pra quem chama nunca precisar adivinhar entre `res` e `res.data`.
export function unwrap(json: any): any {
  return json?.data ?? json;
}
