// Caixas (inboxes) do WhatsApp no CRM.
//
// O modelo do Wavy é UM NÚMERO = UMA CAIXA: trocar de número cria uma caixa
// nova e a antiga continua na conta, com as conversas já sincronizadas (ver
// crm-whatsapp/index.ts:15-18). Então uma conta pode ter várias caixas de
// WhatsApp, e "a primeira" não quer dizer nada.
//
// `inbox_id` só é necessário para criar Campanhas — o chat lista tudo da conta
// via /api/v1/conversations sem precisar dele. Por isso estas buscas nunca
// travam o fluxo de conectar: são melhor esforço.
import { crmFetch } from "./crm-auth.ts";
import { unwrap } from "./crm-client.ts";

export interface CrmInbox {
  id: string;
  name: string | null;
  /** Número da caixa, quando o CRM informa. */
  phoneNumber: string | null;
  isWhatsapp: boolean;
}

function mapInbox(row: any): CrmInbox {
  return {
    id: String(row?.id ?? ""),
    name: row?.name ?? row?.inbox_name ?? null,
    // O nome do campo não está confirmado; tentamos os plausíveis e assumimos
    // nulo em vez de inventar.
    phoneNumber: row?.phone_number ?? row?.phoneNumber ?? row?.channel?.phone_number ?? null,
    isWhatsapp: row?.channel_type === "Channel::Whatsapp" || row?.channel?.type === "whatsapp",
  };
}

/** Todas as caixas da conta. Vazio quando a chamada falha — nunca lança. */
export async function listInboxes(supabase: any, ownerId: string): Promise<CrmInbox[]> {
  try {
    const res = await crmFetch(supabase, ownerId, "/api/v1/inboxes");
    const unwrapped = unwrap(res);
    return (Array.isArray(unwrapped) ? unwrapped : []).map(mapInbox).filter((i) => i.id);
  } catch (e) {
    console.error("[crm-inbox] GET /inboxes falhou:", e);
    return [];
  }
}

/**
 * A primeira caixa de WhatsApp da conta.
 *
 * **Use com cuidado.** Com um número = uma caixa, trocar de número deixa mais
 * de uma caixa de WhatsApp na conta, e "a primeira" pode muito bem ser a do
 * número antigo. Quem sabe a caixa certa é o `connect`, que a recebe do CRM e
 * grava em `crm_credentials.inbox_id` — este atalho é só para o caso de a
 * credencial não ter sido gravada, e mesmo aí é chute.
 */
export async function findWhatsappInboxId(supabase: any, ownerId: string): Promise<string | null> {
  const inboxes = await listInboxes(supabase, ownerId);
  return inboxes.find((i) => i.isWhatsapp)?.id ?? null;
}
