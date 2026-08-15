// Token cache + login for the Wavy CRM. One row per clinic (owner_id) in
// crm_credentials holds the CRM's email/password (needed to relogin — the
// login endpoint is email/password, not OAuth client-credentials) plus the
// cached access_token/expiry. crm_credentials has no RLS policy for
// authenticated/anon, so this module — and everything that calls it — must
// only ever run with a service-role Supabase client.
import { rawFetch } from "./crm-client.ts";

// A UI do CRM mora em crm.wavymarketing.com.br, mas a API é servida em
// domínio separado — confirmado com o time do CRM.
export const CRM_BASE_URL = "https://api.wavymarketing.com.br";
export const CAMPAIGNS_BASE_URL = "https://flow.wavymarketing.com.br";

// A conta de integração (nosodontologia.integracao@wavymarketing.com.br) foi
// marcada pelo time do CRM como "conta de serviço": token dura 30 dias e
// login concorrente não derruba mais os outros (antes eram 2h e sessão
// única — vários processos nossos relogando perto do vencimento ao mesmo
// tempo, cada login revogando o token que outro processo tinha acabado de
// gravar, é o que causava 401 intermitente). Renovar com 5 dias de folga
// (não faltando só 1 minuto) foi a faixa que o time do CRM recomendou —
// ainda reduz a chance de vários processos decidirem relogar ao mesmo
// tempo perto do fim, mesmo não sendo mais uma questão de correção.
const RENEW_BEFORE_EXPIRY_MS = 5 * 24 * 60 * 60 * 1000;

interface CrmCredentialsRow {
  crm_email: string;
  crm_password: string;
  access_token: string | null;
  token_expires_at: string | null;
}

async function login(email: string, password: string): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const res = await rawFetch(CRM_BASE_URL, "/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login no CRM falhou (${res.status}): ${JSON.stringify(res.json)}`);
  // Resposta confirmada: { data: { user, accounts, token: { access_token, expires_in } } }.
  const payload = res.json?.data ?? res.json;
  const token = payload?.token?.access_token;
  const expiresIn = Number(payload?.token?.expires_in ?? 0);
  if (!token) throw new Error("Login no CRM não retornou access_token");
  return { accessToken: token, expiresInSeconds: expiresIn > 0 ? expiresIn : 3600 };
}

async function fetchCredentials(supabase: any, ownerId: string): Promise<CrmCredentialsRow> {
  const { data, error } = await supabase
    .from("crm_credentials")
    .select("crm_email, crm_password, access_token, token_expires_at")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Esta clínica ainda não tem credenciais do CRM cadastradas");
  return data;
}

/** Loga de verdade e grava o token novo, sem checar se o token guardado
 *  "ainda não venceu pelo relógio" — é o que falta no caminho de retry de
 *  401 (ver `authedFetch`): um 401 já prova que o token guardado não
 *  funciona agora, mesmo que `token_expires_at` ainda esteja no futuro
 *  (revogado do lado do CRM antes da hora, por exemplo). Reusar a checagem
 *  de expiração ali reproduziria o mesmo token que acabou de falhar,
 *  fazendo o retry falhar do mesmo jeito sempre — até o token vencer de
 *  verdade e forçar um login pelo caminho normal. */
async function forceLogin(supabase: any, ownerId: string, email: string, password: string): Promise<string> {
  const { accessToken, expiresInSeconds } = await login(email, password);
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
  await supabase
    .from("crm_credentials")
    .update({ access_token: accessToken, token_expires_at: expiresAt, updated_at: new Date().toISOString() })
    .eq("owner_id", ownerId);
  return accessToken;
}

async function refreshToken(supabase: any, ownerId: string, row: CrmCredentialsRow): Promise<string> {
  // Reconsulta o banco antes de logar: se outra chamada concorrente já
  // relogou nesse meio-tempo, reusa o token dela em vez de logar de novo —
  // puro cuidado de carga agora (o CRM não derruba mais logins concorrentes
  // da conta de serviço), não mais uma questão de correção.
  const fresh = await fetchCredentials(supabase, ownerId);
  if (fresh.access_token && fresh.token_expires_at) {
    const expiresAt = new Date(fresh.token_expires_at).getTime();
    if (expiresAt - RENEW_BEFORE_EXPIRY_MS > Date.now()) return fresh.access_token;
  }
  return forceLogin(supabase, ownerId, fresh.crm_email, fresh.crm_password);
}

export async function ensureCrmToken(supabase: any, ownerId: string): Promise<string> {
  const row = await fetchCredentials(supabase, ownerId);
  if (row.access_token && row.token_expires_at) {
    const expiresAt = new Date(row.token_expires_at).getTime();
    if (expiresAt - RENEW_BEFORE_EXPIRY_MS > Date.now()) return row.access_token;
  }
  return refreshToken(supabase, ownerId, row);
}

async function authedFetch(
  baseUrl: string,
  supabase: any,
  ownerId: string,
  path: string,
  init: RequestInit = {},
): Promise<any> {
  const token = await ensureCrmToken(supabase, ownerId);
  let res = await rawFetch(baseUrl, path, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  if (res.status === 401) {
    // Não passa pelo `refreshToken`/checagem de expiração aqui — o 401 já
    // prova que o token guardado não serve mais, então relogar de verdade é
    // a única forma de o retry ter chance de funcionar.
    const row = await fetchCredentials(supabase, ownerId);
    const fresh = await forceLogin(supabase, ownerId, row.crm_email, row.crm_password);
    res = await rawFetch(baseUrl, path, {
      ...init,
      headers: { authorization: `Bearer ${fresh}`, ...(init.headers ?? {}) },
    });
  }
  if (!res.ok) throw new Error(`CRM ${path} falhou (${res.status}): ${JSON.stringify(res.json)}`);
  return res.json;
}

// api.wavymarketing.com.br — inboxes, evolution, conversations, contacts,
// pipelines, message_templates.
export function crmFetch(supabase: any, ownerId: string, path: string, init: RequestInit = {}) {
  return authedFetch(CRM_BASE_URL, supabase, ownerId, path, init);
}

// flow.wavymarketing.com.br — campanhas de disparo em massa (mesmo token).
export function campaignFetch(supabase: any, ownerId: string, path: string, init: RequestInit = {}) {
  return authedFetch(CAMPAIGNS_BASE_URL, supabase, ownerId, path, init);
}
