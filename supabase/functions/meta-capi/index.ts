// Conversions API da Meta: guarda as credenciais do Pixel, avalia os gatilhos
// configurados e envia os eventos server-side.
//
// Tudo que envolve o access token mora aqui de propósito —
// meta_capi_credentials é deny-all na RLS, então só este arquivo (service
// role) consegue ler o token. A tela nunca recebe o valor em claro.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { toWhatsappBR } from "../_shared/phone.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const DEFAULT_API_VERSION = "v21.0";

interface Credentials {
  pixel_id: string | null;
  access_token: string | null;
  test_event_code: string | null;
  api_version: string | null;
  enabled: boolean;
}

interface DispatchContext {
  patientId?: string | null;
  crmContactId?: string | null;
  contactName?: string | null;
  stageId?: string | null;
  status?: string | null;
  amount?: number | null;
}

// ---------- helpers ----------

// A Meta exige SHA-256 hex dos dados pessoais, sobre um valor normalizado.
// Normalização errada não dá erro — só faz o match falhar silenciosamente,
// então vale seguir a regra à risca.
async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const normalizeEmail = (v: string) => v.trim().toLowerCase();

// Telefone: só dígitos, com código do país e sem "+". toWhatsappBR já faz
// exatamente essa normalização (reuso do que as notificações usam).
const normalizePhone = (v: string) => toWhatsappBR(v);

const normalizeName = (v: string) =>
  v
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "");

async function hashedUserData(person: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}): Promise<Record<string, string[]>> {
  const userData: Record<string, string[]> = {};

  if (person.email?.trim()) {
    userData.em = [await sha256(normalizeEmail(person.email))];
  }
  const phone = person.phone ? normalizePhone(person.phone) : null;
  if (phone) {
    userData.ph = [await sha256(phone)];
  }
  const parts = (person.name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length) {
    const first = normalizeName(parts[0]);
    if (first) userData.fn = [await sha256(first)];
    if (parts.length > 1) {
      const last = normalizeName(parts[parts.length - 1]);
      if (last) userData.ln = [await sha256(last)];
    }
  }
  return userData;
}

async function loadCredentials(ownerId: string): Promise<Credentials | null> {
  const { data, error } = await supabase
    .from("meta_capi_credentials")
    .select("pixel_id, access_token, test_event_code, api_version, enabled")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

// Envia um evento e devolve o resultado sem lançar: o chamador decide o que
// fazer, e nenhuma falha da Meta pode derrubar a operação de negócio.
async function postEvent(
  creds: Credentials,
  event: Record<string, unknown>,
): Promise<{ ok: boolean; response: unknown; error: string | null }> {
  const version = creds.api_version || DEFAULT_API_VERSION;
  const url = `https://graph.facebook.com/${version}/${creds.pixel_id}/events`;
  const body: Record<string, unknown> = {
    data: [event],
    access_token: creds.access_token,
  };
  if (creds.test_event_code?.trim()) body.test_event_code = creds.test_event_code.trim();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = json?.error?.message ?? `Meta respondeu ${res.status}`;
      return { ok: false, response: json, error: String(message) };
    }
    return { ok: true, response: json, error: null };
  } catch (e) {
    return { ok: false, response: null, error: String(e) };
  }
}

// ---------- actions ----------

// Nunca devolve o token em claro — só um mascarado pra tela conseguir dizer
// "já existe um token salvo" sem nunca transportá-lo.
async function handleGetSettings(ownerId: string) {
  const creds = await loadCredentials(ownerId);
  const { data: extra } = await supabase
    .from("meta_capi_credentials")
    .select("last_success_at, last_error")
    .eq("owner_id", ownerId)
    .maybeSingle();
  const token = creds?.access_token ?? "";
  return {
    ok: true,
    settings: {
      pixelId: creds?.pixel_id ?? "",
      testEventCode: creds?.test_event_code ?? "",
      apiVersion: creds?.api_version ?? DEFAULT_API_VERSION,
      enabled: creds?.enabled ?? false,
      hasToken: Boolean(token),
      tokenPreview: token ? `••••••••${token.slice(-4)}` : "",
      lastSuccessAt: extra?.last_success_at ?? null,
      lastError: extra?.last_error ?? null,
    },
  };
}

async function handleSaveSettings(
  ownerId: string,
  input: {
    pixelId?: string;
    accessToken?: string;
    testEventCode?: string;
    apiVersion?: string;
    enabled?: boolean;
  },
) {
  const row: Record<string, unknown> = {
    owner_id: ownerId,
    pixel_id: input.pixelId?.trim() || null,
    test_event_code: input.testEventCode?.trim() || null,
    api_version: input.apiVersion?.trim() || DEFAULT_API_VERSION,
    enabled: Boolean(input.enabled),
    updated_at: new Date().toISOString(),
  };
  // Token vazio significa "mantém o que já está salvo" — a tela só recebe o
  // valor mascarado, então não teria como reenviar o original.
  if (input.accessToken?.trim()) row.access_token = input.accessToken.trim();

  const { error } = await supabase
    .from("meta_capi_credentials")
    .upsert(row, { onConflict: "owner_id" });
  if (error) throw new Error(error.message);
  return { ok: true };
}

async function handleTestConnection(ownerId: string) {
  const creds = await loadCredentials(ownerId);
  if (!creds?.pixel_id || !creds.access_token) {
    throw new Error("Cadastre o Pixel ID e o token de acesso antes de testar.");
  }

  // Nome de evento propositalmente fora do catálogo padrão da Meta: se o
  // Test Event Code estiver em branco, o evento chega como produção, e um
  // "Purchase" de teste sujaria as métricas reais da conta.
  const event = {
    event_name: "NosConectaTest",
    event_time: Math.floor(Date.now() / 1000),
    event_id: crypto.randomUUID(),
    action_source: "system_generated",
    user_data: await hashedUserData({ email: `teste+${ownerId}@nosconecta.app` }),
  };

  const result = await postEvent(creds, event);
  await supabase
    .from("meta_capi_credentials")
    .update(
      result.ok
        ? { last_success_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }
        : { last_error: result.error, updated_at: new Date().toISOString() },
    )
    .eq("owner_id", ownerId);

  await supabase.from("meta_capi_events").insert({
    owner_id: ownerId,
    trigger_id: null,
    system_event: "test",
    meta_event_name: event.event_name,
    event_id: event.event_id,
    status: result.ok ? "sent" : "failed",
    payload: event,
    response: result.response,
    error: result.error,
  });

  if (!result.ok) throw new Error(result.error ?? "Falha ao enviar o evento de teste.");
  return { ok: true, testMode: Boolean(creds.test_event_code?.trim()) };
}

// Busca os dados pessoais no banco em vez de recebê-los do chamador: mantém
// o tratamento de PII num lugar só e evita que dado sensível trafegue entre
// a server function e a Edge Function.
async function resolvePerson(ownerId: string, ctx: DispatchContext) {
  if (ctx.patientId) {
    const { data } = await supabase
      .from("patients")
      .select("name, email, phone")
      .eq("id", ctx.patientId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (data) return data;
  }
  if (ctx.crmContactId) {
    const { data } = await supabase
      .from("patients")
      .select("name, email, phone")
      .eq("crm_contact_id", ctx.crmContactId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (data) return data;
  }
  return { name: ctx.contactName ?? null, email: null, phone: null };
}

function matchesConditions(conditions: Record<string, unknown>, ctx: DispatchContext) {
  if (conditions?.stageId && String(conditions.stageId) !== String(ctx.stageId ?? "")) return false;
  if (conditions?.status && String(conditions.status) !== String(ctx.status ?? "")) return false;
  return true;
}

function resolveValue(
  trigger: { value_source: string; fixed_value: number | null },
  ctx: DispatchContext,
): number | null {
  if (trigger.value_source === "fixed") return Number(trigger.fixed_value ?? 0);
  if (trigger.value_source === "event") {
    return ctx.amount === null || ctx.amount === undefined ? null : Number(ctx.amount);
  }
  return null;
}

async function handleDispatch(ownerId: string, systemEvent: string, ctx: DispatchContext) {
  const creds = await loadCredentials(ownerId);
  if (!creds?.enabled || !creds.pixel_id || !creds.access_token) {
    return { ok: true, skipped: "integração desativada ou sem credenciais", sent: 0 };
  }

  const { data: triggers, error } = await supabase
    .from("meta_capi_triggers")
    .select("id, name, conditions, meta_event_name, value_source, fixed_value, currency")
    .eq("owner_id", ownerId)
    .eq("system_event", systemEvent)
    .eq("active", true);
  if (error) throw new Error(error.message);

  const matching = (triggers ?? []).filter((t: any) =>
    matchesConditions(t.conditions ?? {}, ctx),
  );
  if (!matching.length) return { ok: true, skipped: "nenhum gatilho corresponde", sent: 0 };

  const person = await resolvePerson(ownerId, ctx);
  const userData = await hashedUserData(person);
  const eventTime = Math.floor(Date.now() / 1000);

  // Um gatilho não pode impedir o outro de enviar, e nenhum deles pode
  // derrubar a operação de negócio que originou o evento.
  const results = await Promise.all(
    matching.map(async (trigger: any) => {
      const value = resolveValue(trigger, ctx);
      const event: Record<string, unknown> = {
        event_name: trigger.meta_event_name,
        event_time: eventTime,
        event_id: crypto.randomUUID(),
        action_source: "system_generated",
        user_data: userData,
      };
      if (value !== null) {
        event.custom_data = { value, currency: trigger.currency || "BRL" };
      }

      const result = await postEvent(creds, event);
      await supabase.from("meta_capi_events").insert({
        owner_id: ownerId,
        trigger_id: trigger.id,
        system_event: systemEvent,
        meta_event_name: trigger.meta_event_name,
        event_id: event.event_id,
        status: result.ok ? "sent" : "failed",
        payload: event,
        response: result.response,
        error: result.error,
      });
      return result.ok;
    }),
  );

  const sent = results.filter(Boolean).length;
  await supabase
    .from("meta_capi_credentials")
    .update(
      sent
        ? { last_success_at: new Date().toISOString(), last_error: null }
        : { last_error: "Nenhum evento entregue no último disparo." },
    )
    .eq("owner_id", ownerId);

  return { ok: true, sent, total: matching.length };
}

async function handleListEvents(ownerId: string, limit: number) {
  const { data, error } = await supabase
    .from("meta_capi_events")
    .select("id, system_event, meta_event_name, status, error, sent_at")
    .eq("owner_id", ownerId)
    .order("sent_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return { ok: true, events: data ?? [] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  try {
    const body = await req.json();
    const { ownerId, action } = body as { ownerId?: string; action?: string };
    if (!ownerId || !action) {
      return new Response(JSON.stringify({ error: "ownerId e action são obrigatórios" }), {
        status: 400,
      });
    }

    let result: unknown;
    switch (action) {
      case "get-settings":
        result = await handleGetSettings(ownerId);
        break;
      case "save-settings":
        result = await handleSaveSettings(ownerId, body.settings ?? {});
        break;
      case "test-connection":
        result = await handleTestConnection(ownerId);
        break;
      case "dispatch":
        result = await handleDispatch(ownerId, body.systemEvent, body.context ?? {});
        break;
      case "list-events":
        result = await handleListEvents(ownerId, Number(body.limit ?? 20));
        break;
      default:
        return new Response(JSON.stringify({ error: `action desconhecida: ${action}` }), {
          status: 400,
        });
    }

    return new Response(JSON.stringify(result), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error("[meta-capi]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
