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

const TOKEN_SAFETY_MARGIN_MS = 60_000;

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

async function refreshToken(supabase: any, ownerId: string, row: CrmCredentialsRow): Promise<string> {
  // Confirmado no manual (seção 2): "um login novo invalida o token do
  // login anterior" — sem essa checagem, duas chamadas concorrentes (comum
  // aqui: badge da sidebar, chat e sheet de conectar pollam de forma
  // independente) que veem o token expirado ao mesmo tempo relogam em
  // paralelo, e a segunda invalida o token que a primeira acabou de gravar,
  // derrubando a chamada que a esperava. Reconsulta o banco bem antes de
  // logar: se outra chamada concorrente já relogou nesse meio-tempo, reusa
  // o token dela em vez de logar de novo. Não elimina a corrida por
  // completo (ainda há uma janela entre esse check e o login em si), mas
  // reduz bastante a chance na prática.
  const fresh = await fetchCredentials(supabase, ownerId);
  if (fresh.access_token && fresh.token_expires_at) {
    const expiresAt = new Date(fresh.token_expires_at).getTime();
    if (expiresAt - TOKEN_SAFETY_MARGIN_MS > Date.now()) return fresh.access_token;
  }
  const { accessToken, expiresInSeconds } = await login(fresh.crm_email, fresh.crm_password);
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
  await supabase
    .from("crm_credentials")
    .update({ access_token: accessToken, token_expires_at: expiresAt, updated_at: new Date().toISOString() })
    .eq("owner_id", ownerId);
  return accessToken;
}

export async function ensureCrmToken(supabase: any, ownerId: string): Promise<string> {
  const row = await fetchCredentials(supabase, ownerId);
  if (row.access_token && row.token_expires_at) {
    const expiresAt = new Date(row.token_expires_at).getTime();
    if (expiresAt - TOKEN_SAFETY_MARGIN_MS > Date.now()) return row.access_token;
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
    // Token pode ter expirado sem avisar ou ter sido revogado — relogar uma vez.
    const row = await fetchCredentials(supabase, ownerId);
    const fresh = await refreshToken(supabase, ownerId, row);
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
