// Conecta/desconecta o WhatsApp da clínica através do CRM (que por sua vez
// fala com a Evolution API dele — este app nunca fala com Evolution
// diretamente). Chamada via callEdgeFunction a partir de
// src/lib/atendimentos/atendimentos.functions.ts, com o service role.
//
// Fluxo atual: UM único endpoint faz a conexão inteira.
//
//   POST /api/v1/evolution/connections  { phone_number: "5548984195309" }
//   → { success, data: { inbox_id, inbox_name, instance_name, adopted, qrcode } }
//
// O CRM cria a inbox, gera o `instance_name` (garantindo que não colide) e
// devolve o QR pronto. `adopted: true` significa que já existia uma
// instância conectada pra esse número — não vem QR e NÃO é erro.
//
// Guardamos o `inbox_id`: é ele que identifica a caixa dessa conexão.
// Modelo é UM NÚMERO = UMA CAIXA — trocar de número cria uma caixa nova em
// vez de sobrescrever a anterior, então as conversas já sincronizadas do
// número antigo continuam existindo no CRM.
//
// HISTÓRICO (não repetir): antes montávamos o nome da instância aqui como
// `clinic_<ownerId>` — fixo por clínica — e chamávamos
// `POST /evolution/authorization`. Esse endpoint APAGA e recria a instância
// quando encontra uma com o mesmo nome: como o nome era sempre o mesmo,
// isso quase derrubou a conexão real da clínica (17k mensagens, 4.5k
// contatos). Só não aconteceu porque o gateway devolveu 400. Hoje esse
// endpoint recusa apagar instância conectada, de propósito. Não voltar a
// usá-lo, e não voltar a gerar o nome da instância deste lado.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crmFetch } from "../_shared/crm-auth.ts";
import { unwrap } from "../_shared/crm-client.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Só dígitos: código do país + DDD + número, sem zero inicial (formato
// antigo de DDD interurbano, nunca válido aqui). Sem essa limpeza, o número
// mandado pro CRM não bate com um número real e o celular recusa o
// pareamento mesmo com o QR aparecendo normalmente.
//
// Sem `+`: é o formato do corpo de POST /api/v1/evolution/connections
// ("5548984195309"), conforme especificado pelo time do CRM.
function normalizeBrazilPhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (!digits.startsWith("55")) digits = `55${digits}`;
  return digits;
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

  const rawPhone = phoneNumber?.trim() || row.phone_number || null;
  const effectivePhone = rawPhone ? normalizeBrazilPhone(rawPhone) : null;
  if (!effectivePhone) {
    throw new Error("Informe o número de WhatsApp da clínica (com DDD) antes de conectar.");
  }

  // Um único endpoint faz tudo: cria a inbox, gera o instance_name sem
  // colidir, e devolve o QR. Nunca mandamos instance_name — quem nomeia é o
  // CRM (ver comentário no topo sobre por que não geramos mais).
  const res = await crmFetch(supabase, ownerId, "/api/v1/evolution/connections", {
    method: "POST",
    body: JSON.stringify({ phone_number: effectivePhone }),
  });
  const data = unwrap(res);

  const inboxId: string | null = data?.inbox_id ? String(data.inbox_id) : null;
  const instanceName: string | null = data?.instance_name ? String(data.instance_name) : null;
  const adopted = !!data?.adopted;
  const qrCode: string | null = data?.qrcode ?? null;

  if (!inboxId) {
    throw new Error(`O CRM não retornou o inbox_id da conexão. Resposta: ${JSON.stringify(res)}`);
  }

  // `adopted: true` = já existia uma instância conectada pra esse número.
  // Não vem QR e não é erro: já está pareado, é só refletir isso na tela.
  if (adopted) {
    await supabase
      .from("crm_credentials")
      .update({
        evolution_instance_name: instanceName,
        phone_number: effectivePhone,
        inbox_id: inboxId,
        whatsapp_status: "open",
        qr_code: null,
        qr_expires_at: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("owner_id", ownerId);
    return { ok: true, status: "open", qrCode: null, adopted: true };
  }

  if (!qrCode) {
    throw new Error(`O CRM não retornou QR code nem marcou a instância como já conectada. Resposta: ${JSON.stringify(res)}`);
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

  return { ok: true, status: "connecting", qrCode, adopted: false };
}

async function handleStatus(ownerId: string) {
  const row = await getCredentialsRow(ownerId);
  if (!row?.evolution_instance_name) return { ok: true, instance: null };

  try {
    // Confirmado no manual de integração v2 (seção 5): `GET
    // /api/v1/evolution/instances?instanceName=X` é o endpoint correto pra
    // status — o 404 "Channel not found" visto antes era estado sujo de
    // ciclos de debug anteriores (instâncias recriadas repetidas vezes via
    // authorization), não um endpoint/formato errado. Um teste anterior
    // trocou isso por listagem sem filtro por engano; revertido.
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

    // Não adivinhamos mais o inbox aqui. Antes havia um fallback que listava
    // as inboxes e pegava a primeira de WhatsApp — inofensivo quando só
    // podia existir uma, mas errado agora: com um número = uma caixa, trocar
    // de número deixa mais de uma caixa de WhatsApp na conta, e "a primeira"
    // pode ser a do número antigo. Quem define o inbox_id é o connect (que
    // recebe do CRM) ou o vínculo manual por Inbox ID.
    const inboxId: string | null = row.inbox_id;

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

  // Zera inbox_id junto: modelo é um número = uma caixa, então conectar um
  // número diferente depois precisa criar uma caixa NOVA. Mantendo o
  // inbox_id antigo aqui, a próxima conexão continuaria apontando pra caixa
  // do número anterior — número pareado e caixa em desacordo.
  //
  // Isso não apaga nada: a caixa antiga e as conversas já sincronizadas
  // continuam existindo no CRM, só deixam de ser a caixa ativa desta
  // clínica.
  await supabase
    .from("crm_credentials")
    .update({
      whatsapp_status: "disconnected",
      evolution_instance_name: null,
      inbox_id: null,
      qr_code: null,
      qr_expires_at: null,
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
