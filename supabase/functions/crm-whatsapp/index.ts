// Conecta/desconecta o WhatsApp da clínica através do CRM (que por sua vez
// fala com a Evolution API dele — este app nunca fala com Evolution
// diretamente). Chamada via callEdgeFunction a partir de
// src/lib/atendimentos/atendimentos.functions.ts, com o service role.
//
// Sequência confirmada com o time do Wavy (via VPS), depois de descobrir que
// `DELETE /evolution/instances/:id/logout` dava 404 "Channel not found"
// mesmo com authorization+QR funcionando: `POST /evolution/authorization`
// fala só com o servidor Evolution, nunca grava nada no banco do CRM — ele
// não sabe que existe inbox nenhuma. Quem cria o registro `Channel::Whatsapp`
// do qual status/logout dependem é `POST /api/v1/inboxes`, e isso precisa
// acontecer ANTES de autorizar, não depois:
//   1. POST /api/v1/inboxes — cria o registro no CRM. Corpo confirmado (201
//      ao vivo): `name` solto no nível principal (NÃO aninhado em
//      `inbox: {}`) + `channel: { type: "whatsapp", phone_number: "+55...",
//      provider: "evolution", provider_config: { instance_name } }`.
//   2. POST /api/v1/evolution/authorization (instance_name + phone_number)
//      — cria a instância de verdade no Evolution e registra o webhook de
//      volta pro CRM.
//   3. POST /api/v1/evolution/qrcodes — pega o QR.
//   4. Usuário escaneia — o webhook do Evolution confirma o pareamento
//      sozinho, nenhuma chamada extra necessária.
// Só depois desse fluxo completo `DELETE .../logout` (mesmo `instance_name`
// como `:id`) passa a funcionar.
//
// CUIDADO: `POST /evolution/authorization` é destrutivo — se a instância já
// existe no Evolution, ele apaga e recria antes de continuar. Por isso só
// pode ser chamado quando `evolution_instance_name` ainda é `null` (primeira
// conexão, ou depois de um "Desconectar" explícito) — nunca em retry/loop
// sobre uma instância que já pode estar conectada.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crmFetch } from "../_shared/crm-auth.ts";
import { unwrap } from "../_shared/crm-client.ts";
import { findWhatsappInboxId } from "../_shared/crm-inbox.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function instanceNameFor(ownerId: string): string {
  return `clinic_${ownerId.replace(/-/g, "")}`;
}

// E.164 pra pareamento no WhatsApp: `+` + código do país + DDD + número, sem
// zero inicial (formato antigo de DDD interurbano, nunca válido aqui). Sem
// isso, o número mandado pro CRM não bate com um número real e o celular
// recusa o pareamento mesmo com o QR aparecendo normalmente. Formato com
// `+` confirmado com o time do Wavy pro corpo de POST /api/v1/inboxes.
function normalizeBrazilPhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (!digits.startsWith("55")) digits = `55${digits}`;
  return `+${digits}`;
}

// Estados possíveis na resposta de GET /evolution/instances nunca foram
// confirmados com o Wavy (diferente do resto deste arquivo). Tenta primeiro
// as convenções nativas da própria Evolution API (string `state`/
// `connectionStatus`, às vezes aninhada em `instance.*`), com o booleano
// `connected` como último fallback. Se nada bater, `handleStatus` grava a
// resposta crua em `crm_status_debug` pra diagnosticar sem precisar pedir
// pro usuário reproduzir de novo.
const CRM_INSTANCE_STATE_MAP: Record<string, "open" | "connecting" | "disconnected"> = {
  open: "open",
  connected: "open",
  connecting: "connecting",
  qrcode: "connecting",
  qr: "connecting",
  pairing: "connecting",
  close: "disconnected",
  closed: "disconnected",
  disconnected: "disconnected",
  logged_out: "disconnected",
};

function normalizeCrmState(value: unknown): "open" | "connecting" | "disconnected" | null {
  return typeof value === "string" ? CRM_INSTANCE_STATE_MAP[value.toLowerCase()] ?? null : null;
}

function deriveConnectionStatus(
  first: any,
  previousStatus: string,
): { status: "open" | "connecting" | "disconnected"; matched: boolean } {
  const candidates = [
    first?.connectionStatus,
    first?.instance?.connectionStatus,
    first?.state,
    first?.instance?.state,
    first?.status,
    first?.instance?.status,
    first?.connectionState,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeCrmState(candidate);
    if (normalized) return { status: normalized, matched: true };
  }
  if (typeof first?.connected === "boolean") {
    return {
      status: first.connected ? "open" : previousStatus === "connecting" ? "connecting" : "disconnected",
      matched: true,
    };
  }
  return { status: previousStatus === "connecting" ? "connecting" : "disconnected", matched: false };
}

function extractPhoneNumber(first: any, fallback: string | null): string | null {
  const raw = first?.number ?? first?.phoneNumber ?? first?.ownerJid ?? first?.owner ?? first?.instance?.owner ?? null;
  return raw ? String(raw).split("@")[0] : fallback;
}

async function getCredentialsRow(ownerId: string) {
  const { data, error } = await supabase
    .from("crm_credentials")
    .select("*")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function handleConnect(ownerId: string, phoneNumber?: string) {
  const row = await getCredentialsRow(ownerId);
  if (!row) {
    throw new Error("Esta clínica ainda não tem credenciais do CRM cadastradas.");
  }

  const instanceName: string = row.evolution_instance_name ?? instanceNameFor(ownerId);
  const rawPhone = phoneNumber?.trim() || row.phone_number || null;
  const effectivePhone = rawPhone ? normalizeBrazilPhone(rawPhone) : null;

  let inboxId: string | null = row.inbox_id;

  if (!row.evolution_instance_name) {
    // Primeira conexão. O CRM exige phone_number aqui — não dá pra
    // descobrir depois do QR.
    if (!effectivePhone) {
      throw new Error("Informe o número de WhatsApp da clínica (com DDD) antes de conectar.");
    }

    // Passo 1: cria a inbox (Channel::Whatsapp) no CRM ANTES de autorizar —
    // é esse registro que status/logout dependem depois. Checa se já existe
    // uma primeiro (evita duplicar em caso de retry após falha parcial).
    if (!inboxId) inboxId = await findWhatsappInboxId(supabase, ownerId);
    if (!inboxId) {
      const inboxRes = await crmFetch(supabase, ownerId, "/api/v1/inboxes", {
        method: "POST",
        body: JSON.stringify({
          name: `WhatsApp - ${instanceName}`,
          channel: {
            type: "whatsapp",
            phone_number: effectivePhone,
            provider: "evolution",
            provider_config: { instance_name: instanceName },
          },
        }),
      });
      const created = unwrap(inboxRes);
      inboxId = created?.id ? String(created.id) : null;
    }

    // Passo 2: autoriza a instância no Evolution. DESTRUTIVO se a instância
    // já existir — só é seguro aqui porque só entra nesse branch quando
    // evolution_instance_name ainda é null (primeira vez ou pós-desconexão).
    await crmFetch(supabase, ownerId, "/api/v1/evolution/authorization", {
      method: "POST",
      body: JSON.stringify({ instance_name: instanceName, phone_number: effectivePhone }),
    });
  }

  // Pede o QR (primeira conexão ou reconexão — mesmo endpoint nos dois casos).
  const qrRes = await crmFetch(supabase, ownerId, "/api/v1/evolution/qrcodes", {
    method: "POST",
    body: JSON.stringify({ instance_name: instanceName }),
  });
  const qrData = unwrap(qrRes);
  // Formato exato da resposta ainda não confirmado — tenta os campos mais
  // prováveis (padrão da própria Evolution API é `base64`, mas o CRM pode
  // aninhar diferente). Se nenhum bater, falha alto com o corpo cru em vez
  // de deixar a tela sem QR silenciosamente.
  const qrCode: string | null =
    qrData?.base64 ?? qrData?.qrcode?.base64 ?? qrData?.qrCode ?? qrData?.qr ?? qrData?.code ?? null;
  if (!qrCode) {
    throw new Error(`QR code não veio no formato esperado. Resposta do CRM: ${JSON.stringify(qrRes)}`);
  }

  await supabase
    .from("crm_credentials")
    .update({
      evolution_instance_name: instanceName,
      phone_number: effectivePhone,
      inbox_id: inboxId,
      whatsapp_status: "connecting",
      qr_code: qrCode,
      qr_expires_at: new Date(Date.now() + 60_000).toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("owner_id", ownerId);

  return { ok: true, status: "connecting", qrCode };
}

async function handleStatus(ownerId: string) {
  const row = await getCredentialsRow(ownerId);
  if (!row?.evolution_instance_name) return { ok: true, instance: null };

  try {
    const res = await crmFetch(
      supabase,
      ownerId,
      `/api/v1/evolution/instances?instanceName=${encodeURIComponent(row.evolution_instance_name)}`,
    );
    const unwrapped = unwrap(res);
    const first = Array.isArray(unwrapped) ? unwrapped[0] : unwrapped;
    const { status, matched } = deriveConnectionStatus(first, row.whatsapp_status);
    const connected = status === "open";
    const phoneNumber = extractPhoneNumber(first, row.phone_number);

    // Best-effort, nunca bloqueia: uma vez pareado, tenta achar o inbox de
    // Campanhas em segundo plano (pode já existir no CRM, ou surgir depois
    // que o time do Wavy o cria manualmente).
    let inboxId: string | null = row.inbox_id;
    if (connected && !inboxId) inboxId = await findWhatsappInboxId(supabase, ownerId);

    const { data: updated } = await supabase
      .from("crm_credentials")
      .update({
        whatsapp_status: status,
        phone_number: phoneNumber,
        inbox_id: inboxId,
        // Autolimpa assim que um formato bate; só fica preenchido enquanto
        // nenhum candidato conhecido casa com a resposta real do CRM.
        crm_status_debug: matched ? null : { at: new Date().toISOString(), raw: res },
        updated_at: new Date().toISOString(),
      })
      .eq("owner_id", ownerId)
      .select("whatsapp_status, phone_number, qr_code, qr_expires_at, last_error")
      .single();
    return { ok: true, instance: updated };
  } catch (e) {
    console.error("[crm-whatsapp] status falhou:", e);
    // Antes, esse catch só devolvia os dados antigos em cache sem gravar
    // nada — se a chamada ao CRM sempre falhasse (token, rede, endpoint),
    // o status ficava eternamente preso em "connecting" sem nenhum rastro
    // no banco pra diagnosticar. Agora persiste o erro real em last_error.
    const message = e instanceof Error ? e.message : String(e);
    await supabase
      .from("crm_credentials")
      .update({ last_error: message, updated_at: new Date().toISOString() })
      .eq("owner_id", ownerId);
    return {
      ok: true,
      instance: {
        whatsapp_status: row.whatsapp_status,
        phone_number: row.phone_number,
        qr_code: row.qr_code,
        qr_expires_at: row.qr_expires_at,
        last_error: message,
      },
    };
  }
}

async function handleSetInboxId(ownerId: string, inboxId: string) {
  await supabase
    .from("crm_credentials")
    .update({ inbox_id: inboxId, updated_at: new Date().toISOString() })
    .eq("owner_id", ownerId);
  return { ok: true };
}

async function handleDisconnect(ownerId: string) {
  const row = await getCredentialsRow(ownerId);
  if (!row?.evolution_instance_name) return { ok: true };

  try {
    await crmFetch(supabase, ownerId, `/api/v1/evolution/instances/${encodeURIComponent(row.evolution_instance_name)}/logout`, {
      method: "DELETE",
    });
  } catch (e) {
    // O CRM pode não ter nenhum "channel" registrado pra essa instância
    // (ex.: o pareamento nunca completou do lado dele) — nesse caso não há
    // o que deslogar remotamente, e isso não pode travar o reset local.
    console.error("[crm-whatsapp] logout no CRM falhou, seguindo com reset local:", e);
  }

  // Zera evolution_instance_name também: sem isso, a próxima tentativa de
  // "Conectar" pularia direto pro QR (achando que já tá autorizado) em vez
  // de reautorizar do zero, que é o que "desconectar e recomeçar" promete.
  await supabase
    .from("crm_credentials")
    .update({
      whatsapp_status: "disconnected",
      evolution_instance_name: null,
      qr_code: null,
      phone_number: null,
      updated_at: new Date().toISOString(),
    })
    .eq("owner_id", ownerId);
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  try {
    const { ownerId, action, phoneNumber, inboxId } = (await req.json()) as {
      ownerId?: string;
      action?: string;
      phoneNumber?: string;
      inboxId?: string;
    };
    if (!ownerId || !action) {
      return new Response(JSON.stringify({ error: "ownerId e action são obrigatórios" }), { status: 400 });
    }

    let result: unknown;
    if (action === "connect") result = await handleConnect(ownerId, phoneNumber);
    else if (action === "status") result = await handleStatus(ownerId);
    else if (action === "disconnect") result = await handleDisconnect(ownerId);
    else if (action === "set-inbox-id") result = await handleSetInboxId(ownerId, inboxId ?? "");
    else return new Response(JSON.stringify({ error: `action desconhecida: ${action}` }), { status: 400 });

    return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
  } catch (e) {
    console.error("[crm-whatsapp]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
