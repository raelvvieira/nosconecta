// Conversions API da Meta: guarda as credenciais, avalia os gatilhos
// configurados e envia os eventos server-side.
//
// Tudo que envolve o access token mora aqui de propósito —
// meta_capi_credentials é deny-all na RLS, então só este arquivo (service
// role) consegue ler o token. A tela nunca recebe o valor em claro.
//
// Normalização e hashing seguem o guia de integração da CAPI (sha256 hex de
// valor normalizado, `em`/`ph` como array e o resto como string). Hash de
// valor malformado não dá erro: só falha o match em silêncio. Por isso a
// regra é normalizar → validar → OMITIR, registrando o que caiu em
// dropped_keys.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const DEFAULT_API_VERSION = "v24.0";
const UPLOAD_TAG = "nosconecta";

interface Credentials {
  pixel_id: string | null;
  offline_event_set_id: string | null;
  access_token: string | null;
  test_event_code: string | null;
  api_version: string | null;
  enabled: boolean;
}

interface DispatchContext {
  /** Id estável do registro que converteu — compõe o event_id de dedup. */
  entityId?: string | null;
  patientId?: string | null;
  crmContactId?: string | null;
  contactName?: string | null;
  stageId?: string | null;
  status?: string | null;
  amount?: number | null;
}

interface RawPerson {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  zip?: string | null;
  city?: string | null;
  state?: string | null;
  dob?: string | null;
  gender?: string | null;
  externalId?: string | null;
}

// ---------- hash + normalizadores ----------

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const stripDiacritics = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const normEmail = (s: string): string | null => {
  const v = s.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
};

// E.164 só dígitos, com DDI e sem "+". Telefone sem DDI é a causa número um
// de match baixo no Brasil, então 10/11 dígitos ganham o 55 na frente.
const normPhone = (s: string): string | null => {
  let d = s.replace(/\D/g, "").replace(/^0+/, "");
  if (!d) return null;
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.length < 10 || d.length > 15) return null;
  return d;
};

const normName = (s: string): string | null =>
  stripDiacritics(s.trim().toLowerCase()).replace(/[^a-z]/g, "") || null;

const normZip = (s: string): string | null => {
  const v = s.replace(/\D/g, "");
  // Só há paciente brasileiro neste sistema, então CEP é 8 dígitos exatos.
  return v.length === 8 ? v : null;
};

const normState = (s: string): string | null => {
  const v = stripDiacritics(s.trim().toLowerCase()).replace(/[^a-z]/g, "");
  return v.length === 2 ? v : null;
};

const normDob = (s: string): string | null => {
  const v = s.replace(/\D/g, "");
  if (v.length !== 8) return null;
  const year = +v.slice(0, 4);
  const month = +v.slice(4, 6);
  const day = +v.slice(6, 8);
  const now = new Date().getUTCFullYear();
  if (year < 1900 || year > now || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return v;
};

const GENDER_MAP: Record<string, "m" | "f"> = {
  m: "m", male: "m", masculino: "m", homem: "m", h: "m",
  f: "f", female: "f", feminino: "f", mulher: "f",
};
const normGender = (s: string): string | null =>
  GENDER_MAP[stripDiacritics(s.trim().toLowerCase()).replace(/[^a-z]/g, "")] ?? null;

// ---------- user_data ----------

async function buildUserData(raw: RawPerson) {
  const userData: Record<string, string | string[]> = {};
  const dropped: string[] = [];

  const add = async (
    key: string,
    value: unknown,
    norm: (s: string) => string | null,
    asArray = false,
  ) => {
    if (value === null || value === undefined) return;
    const text = String(value);
    if (!text.trim()) return;
    const normalized = norm(text);
    if (!normalized) {
      dropped.push(key);
      return;
    }
    const hash = await sha256(normalized);
    userData[key] = asArray ? [hash] : hash;
  };

  await add("em", raw.email, normEmail, true);
  await add("ph", raw.phone, normPhone, true);

  // Primeira palavra em fn e TODO o resto junto em ln ("Maria Silva Souza"
  // → fn=maria, ln=silvasouza). Mandar só a última palavra em ln muda o hash
  // inteiro e o match falha sem avisar.
  const parts = (raw.name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length) {
    await add("fn", parts[0], normName);
    if (parts.length > 1) await add("ln", parts.slice(1).join(""), normName);
  }

  await add("zp", raw.zip, normZip);
  await add("ct", raw.city, normName);
  await add("st", raw.state, normState);
  await add("db", raw.dob, normDob);
  await add("ge", raw.gender, normGender);
  await add("external_id", raw.externalId, (s) => s.trim() || null);

  // País é fixo: o cadastro de pacientes é todo brasileiro. Reforça o match
  // dos demais campos e sai de graça.
  if (Object.keys(userData).length) userData.country = await sha256("br");

  return { userData, dropped };
}

// ---------- credenciais e envio ----------

async function loadCredentials(ownerId: string): Promise<Credentials | null> {
  const { data, error } = await supabase
    .from("meta_capi_credentials")
    .select("pixel_id, offline_event_set_id, access_token, test_event_code, api_version, enabled")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

// Dois destinos possíveis, e o action_source depende de qual: o conjunto de
// eventos offline aceita system_generated; o pixel, não (só website/app/other).
// Se houver conjunto offline configurado, ele ganha — é o destino certo para
// conversão que acontece fora da internet, que é o caso deste sistema.
function resolveTarget(creds: Credentials) {
  const offline = creds.offline_event_set_id?.trim();
  return offline
    ? { id: offline, mode: "offline_dataset" as const, actionSource: "system_generated" }
    : { id: creds.pixel_id?.trim() ?? "", mode: "pixel_events" as const, actionSource: "other" };
}

function hasCredentials(creds: Credentials | null): creds is Credentials {
  return Boolean(creds?.access_token && (creds.offline_event_set_id?.trim() || creds.pixel_id?.trim()));
}

// Envia e devolve o resultado sem lançar: o chamador decide o que fazer, e
// nenhuma falha da Meta pode derrubar a operação de negócio.
async function postEvent(creds: Credentials, event: Record<string, unknown>) {
  const version = creds.api_version || DEFAULT_API_VERSION;
  const target = resolveTarget(creds);
  const payload: Record<string, unknown> = {
    data: [event],
    access_token: creds.access_token,
  };
  // upload_tag só existe no modo offline; serve para auditar o lote no
  // Gerenciador de Eventos.
  if (target.mode === "offline_dataset") payload.upload_tag = UPLOAD_TAG;
  if (creds.test_event_code?.trim()) payload.test_event_code = creds.test_event_code.trim();

  try {
    const res = await fetch(`https://graph.facebook.com/${version}/${target.id}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.error) {
      const code = json?.error?.code;
      const message = json?.error?.message ?? `Meta respondeu ${res.status}`;
      return {
        ok: false,
        response: json,
        // Código 190 é token expirado/revogado: não adianta reenviar, precisa
        // gerar outro. A tela trata isso como "Reconectar", não como falha
        // genérica de envio.
        error: code === 190 ? `[reconectar] ${message}` : String(message),
      };
    }
    return { ok: true, response: json, error: null };
  } catch (e) {
    return { ok: false, response: null, error: String(e) };
  }
}

async function logEvent(row: Record<string, unknown>) {
  await supabase.from("meta_capi_events").insert(row);
}

async function markResult(ownerId: string, ok: boolean, error: string | null) {
  await supabase
    .from("meta_capi_credentials")
    .update(
      ok
        ? { last_success_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }
        : { last_error: error, updated_at: new Date().toISOString() },
    )
    .eq("owner_id", ownerId);
}

// ---------- actions ----------

// Nunca devolve o token em claro — só um mascarado, para a tela conseguir
// dizer "já existe um token salvo" sem transportá-lo.
async function handleGetSettings(ownerId: string) {
  const { data } = await supabase
    .from("meta_capi_credentials")
    .select("*")
    .eq("owner_id", ownerId)
    .maybeSingle();
  const token = data?.access_token ?? "";
  const offline = data?.offline_event_set_id?.trim() ?? "";
  return {
    ok: true,
    settings: {
      pixelId: data?.pixel_id ?? "",
      offlineEventSetId: offline,
      mode: offline ? "offline_dataset" : "pixel_events",
      testEventCode: data?.test_event_code ?? "",
      apiVersion: data?.api_version ?? DEFAULT_API_VERSION,
      enabled: data?.enabled ?? false,
      hasToken: Boolean(token),
      tokenPreview: token ? `••••••••${token.slice(-4)}` : "",
      lastSuccessAt: data?.last_success_at ?? null,
      lastError: data?.last_error ?? null,
      needsReconnect: Boolean(data?.last_error?.startsWith("[reconectar]")),
    },
  };
}

async function handleSaveSettings(
  ownerId: string,
  input: {
    pixelId?: string;
    offlineEventSetId?: string;
    accessToken?: string;
    testEventCode?: string;
    apiVersion?: string;
    enabled?: boolean;
  },
) {
  const row: Record<string, unknown> = {
    owner_id: ownerId,
    pixel_id: input.pixelId?.trim() || null,
    offline_event_set_id: input.offlineEventSetId?.trim() || null,
    test_event_code: input.testEventCode?.trim() || null,
    api_version: input.apiVersion?.trim() || DEFAULT_API_VERSION,
    enabled: Boolean(input.enabled),
    updated_at: new Date().toISOString(),
  };
  // Token vazio significa "mantém o que já está salvo" — a tela só recebe o
  // valor mascarado, então não teria como reenviar o original.
  if (input.accessToken?.trim()) {
    row.access_token = input.accessToken.trim();
    row.last_error = null; // token novo zera o estado de "reconectar"
  }

  const { error } = await supabase
    .from("meta_capi_credentials")
    .upsert(row, { onConflict: "owner_id" });
  if (error) throw new Error(error.message);
  return { ok: true };
}

async function handleTestConnection(ownerId: string) {
  const creds = await loadCredentials(ownerId);
  if (!hasCredentials(creds)) {
    throw new Error("Cadastre o token e o Pixel ID (ou o conjunto de eventos offline) antes de testar.");
  }

  const target = resolveTarget(creds);
  // Nome de evento propositalmente fora do catálogo padrão da Meta: se o
  // Test Event Code estiver em branco, o evento chega como produção, e um
  // "Purchase" de teste sujaria as métricas reais da conta.
  const { userData } = await buildUserData({ email: `teste+${ownerId}@nosconecta.app` });
  const event = {
    event_name: "NosConectaTest",
    event_time: Math.floor(Date.now() / 1000),
    event_id: `test:${ownerId}:${Date.now()}`,
    action_source: target.actionSource,
    user_data: userData,
  };

  const result = await postEvent(creds, event);
  await markResult(ownerId, result.ok, result.error);
  await logEvent({
    owner_id: ownerId,
    trigger_id: null,
    system_event: "test",
    meta_event_name: event.event_name,
    event_id: event.event_id,
    status: result.ok ? "sent" : "failed",
    payload: event,
    response: result.response,
    dropped_keys: [],
    error: result.error,
  });

  if (!result.ok) throw new Error(result.error ?? "Falha ao enviar o evento de teste.");
  return { ok: true, testMode: Boolean(creds.test_event_code?.trim()), mode: target.mode };
}

// Busca os dados pessoais no banco em vez de recebê-los do chamador: mantém
// o tratamento de PII num lugar só e evita que dado sensível trafegue entre
// a server function e a Edge Function.
async function resolvePerson(ownerId: string, ctx: DispatchContext): Promise<RawPerson> {
  const columns = "id, name, email, phone, birth_date, gender, city, state, zip_code";
  const toRaw = (row: any): RawPerson => ({
    name: row.name,
    email: row.email,
    phone: row.phone,
    zip: row.zip_code,
    city: row.city,
    state: row.state,
    dob: row.birth_date,
    gender: row.gender,
    externalId: row.id,
  });

  if (ctx.patientId) {
    const { data } = await supabase
      .from("patients").select(columns)
      .eq("id", ctx.patientId).eq("owner_id", ownerId).maybeSingle();
    if (data) return toRaw(data);
  }
  if (ctx.crmContactId) {
    const { data } = await supabase
      .from("patients").select(columns)
      .eq("crm_contact_id", ctx.crmContactId).eq("owner_id", ownerId).maybeSingle();
    if (data) return toRaw(data);
  }
  return { name: ctx.contactName ?? null };
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
  if (!creds?.enabled || !hasCredentials(creds)) {
    return { ok: true, skipped: "integração desativada ou sem credenciais", sent: 0 };
  }

  const { data: triggers, error } = await supabase
    .from("meta_capi_triggers")
    .select("id, name, conditions, meta_event_name, value_source, fixed_value, currency")
    .eq("owner_id", ownerId)
    .eq("system_event", systemEvent)
    .eq("active", true);
  if (error) throw new Error(error.message);

  const matching = (triggers ?? []).filter((t: any) => matchesConditions(t.conditions ?? {}, ctx));
  if (!matching.length) return { ok: true, skipped: "nenhum gatilho corresponde", sent: 0 };

  const person = await resolvePerson(ownerId, ctx);
  const { userData, dropped } = await buildUserData(person);
  const target = resolveTarget(creds);
  const eventTime = Math.floor(Date.now() / 1000);

  // Evento sem nenhum identificador é rejeitado pela Meta e ainda suja o
  // dataset. Falha aqui, com mensagem que diz o que fazer, em vez de mandar
  // e receber um erro genérico de volta.
  if (!Object.keys(userData).length) {
    await Promise.all(
      matching.map((trigger: any) =>
        logEvent({
          owner_id: ownerId,
          trigger_id: trigger.id,
          system_event: systemEvent,
          meta_event_name: trigger.meta_event_name,
          event_id: `${trigger.meta_event_name}:${ctx.entityId ?? "sem-id"}`,
          status: "failed",
          payload: null,
          response: null,
          dropped_keys: dropped,
          error: "Nenhum identificador válido (e-mail ou telefone) — evento não enviado.",
        }),
      ),
    );
    return { ok: true, sent: 0, total: matching.length, skipped: "sem identificador" };
  }

  // Um gatilho não pode impedir o outro de enviar, e nenhum deles pode
  // derrubar a operação de negócio que originou o evento.
  const results = await Promise.all(
    matching.map(async (trigger: any) => {
      const value = resolveValue(trigger, ctx);
      // O event_id identifica a CONVERSÃO, não o gatilho que a disparou.
      // Por isso é (evento da Meta + registro que converteu), e não o id do
      // gatilho: dois gatilhos configurados para mandar "Purchase" no mesmo
      // acontecimento descrevem a mesma conversão, e com o id do gatilho no
      // meio eles virariam dois event_id distintos e a Meta contaria duas
      // vezes. Gatilhos com eventos diferentes (Purchase + Lead) continuam
      // separados, que é o desejado.
      const eventId = `${trigger.meta_event_name}:${ctx.entityId ?? eventTime}`;
      const event: Record<string, unknown> = {
        event_name: trigger.meta_event_name,
        event_time: eventTime,
        event_id: eventId,
        action_source: target.actionSource,
        user_data: userData,
      };
      if (value !== null) {
        event.custom_data = { value, currency: trigger.currency || "BRL" };
      }

      const result = await postEvent(creds, event);
      await logEvent({
        owner_id: ownerId,
        trigger_id: trigger.id,
        system_event: systemEvent,
        meta_event_name: trigger.meta_event_name,
        event_id: eventId,
        status: result.ok ? "sent" : "failed",
        payload: event,
        response: result.response,
        dropped_keys: dropped,
        error: result.error,
      });
      return { ok: result.ok, error: result.error };
    }),
  );

  const sent = results.filter((r) => r.ok).length;
  await markResult(
    ownerId,
    sent > 0,
    sent > 0 ? null : (results.find((r) => r.error)?.error ?? "Nenhum evento entregue."),
  );

  return { ok: true, sent, total: matching.length, dropped };
}

async function handleListEvents(ownerId: string, limit: number) {
  const { data, error } = await supabase
    .from("meta_capi_events")
    .select("id, system_event, meta_event_name, status, error, dropped_keys, sent_at")
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
