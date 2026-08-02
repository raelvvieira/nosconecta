// Conecta/desconecta o WhatsApp da clínica através do CRM (que por sua vez
// fala com a Evolution API dele — este app nunca fala com Evolution
// diretamente). Chamada via callEdgeFunction a partir de
// src/lib/atendimentos/atendimentos.functions.ts, com o service role.
//
// Confirmado com o time do CRM: `POST /evolution/authorization` exige
// `instance_name` E `phone_number` (o número não é descoberto depois do
// QR, precisa vir antes) — e o `:id` de
// `DELETE /evolution/instances/:id/logout` é o próprio `instance_name`.
//
// O QR code é sempre buscado via `POST /evolution/qrcodes` com
// `instance_name` no corpo — a variante `GET /evolution/qrcodes/:instance`
// (usada antes só na primeira conexão) devolvia 404 "Channel not found for
// instance" logo depois de autorizar, porque o canal ainda não existe pro
// GET conseguir ler; o POST cria/atualiza o QR e resolve isso.
//
// De propósito, conectar o WhatsApp (autorizar a instância + parear o QR)
// NUNCA depende de resolver um inbox_id: /api/v1/conversations já lista
// tudo da conta sem precisar dele, e tentar criar um inbox via
// POST /api/v1/inboxes exige campos (`provider_config`) que não temos como
// preencher com confiança. inbox_id só importa pra Campanhas — ver
// crm-inbox.ts e crm-campaigns/index.ts.
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
  const effectivePhone = phoneNumber?.trim() || row.phone_number || null;

  if (!row.evolution_instance_name) {
    // Primeira conexão: autoriza a instância antes de pedir QR. O CRM
    // exige phone_number aqui — não dá pra descobrir depois do QR.
    if (!effectivePhone) {
      throw new Error("Informe o número de WhatsApp da clínica (com DDD) antes de conectar.");
    }
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
    const connected = !!first?.connected;
    const status = connected ? "open" : row.whatsapp_status === "connecting" ? "connecting" : "disconnected";
    const phoneNumber = first?.number ?? first?.phoneNumber ?? row.phone_number ?? null;

    // Best-effort, nunca bloqueia: uma vez pareado, tenta achar o inbox de
    // Campanhas em segundo plano (pode já existir no CRM, ou surgir depois
    // que o time do Wavy o cria manualmente).
    let inboxId: string | null = row.inbox_id;
    if (connected && !inboxId) inboxId = await findWhatsappInboxId(supabase, ownerId);

    const { data: updated } = await supabase
      .from("crm_credentials")
      .update({ whatsapp_status: status, phone_number: phoneNumber, inbox_id: inboxId, updated_at: new Date().toISOString() })
      .eq("owner_id", ownerId)
      .select("whatsapp_status, phone_number, qr_code, qr_expires_at, last_error")
      .single();
    return { ok: true, instance: updated };
  } catch (e) {
    console.error("[crm-whatsapp] status falhou:", e);
    return {
      ok: true,
      instance: {
        whatsapp_status: row.whatsapp_status,
        phone_number: row.phone_number,
        qr_code: row.qr_code,
        qr_expires_at: row.qr_expires_at,
        last_error: row.last_error,
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
