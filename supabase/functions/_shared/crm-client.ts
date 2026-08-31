// Low-level HTTP helper shared by the CRM integration (Wavy white-label
// CRM). Handles JSON parsing/error shaping the same way for both domains
// (api.wavymarketing.com.br and flow.wavymarketing.com.br) — auth/token
// logic lives in crm-auth.ts, which is the only caller of this module.

export interface RawResponse {
  ok: boolean;
  status: number;
  json: any;
}

// Sem timeout, uma resposta lenta do CRM deixava a tela presa em "carregando".
// 15s se mostrou curto demais para listas grandes (conversas, itens do
// pipeline): virava TimeoutError mesmo quando o CRM ia responder. 30s por
// tentativa, com uma segunda tentativa automática, cabe folgado dentro do
// limite de quem chama (55s no lado do app) e some com a maioria dos erros.
// 30s por tentativa somava 60s com a segunda tentativa e estourava o teto de
// 55s de quem chama — o app cancelava antes e a tela quebrava. 20s x2 = 40s
// cabe dentro do orçamento e ainda dá folga para listas grandes.
const REQUEST_TIMEOUT_MS = 20_000;

export async function rawFetch(baseUrl: string, path: string, init: RequestInit = {}, attempt = 1): Promise<RawResponse> {
  // Com FormData (envio de anexo), o content-type NÃO pode ser definido por
  // nós: o fetch precisa gerar o header com o boundary do multipart. Fixar
  // application/json aqui quebraria o upload.
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        ...(isFormData ? {} : { "content-type": "application/json" }),
        ...(init.headers ?? {}),
      },
    });
  } catch (err) {
    const isTimeout =
      (err as any)?.name === "TimeoutError" || /timed out|aborted/i.test(String((err as any)?.message ?? ""));
    // Só repete leituras (GET) e só uma vez: repetir POST poderia duplicar
    // mensagem enviada / contato criado.
    const method = (init.method ?? "GET").toUpperCase();
    if (isTimeout && attempt === 1 && method === "GET" && !isFormData) {
      return rawFetch(baseUrl, path, init, 2);
    }
    if (isTimeout) throw new Error("O CRM demorou demais para responder. Tente novamente em instantes.");
    throw err;
  }
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
