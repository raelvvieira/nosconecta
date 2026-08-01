// inbox_id só é necessário hoje pra criar Campanhas — o chat (conversas/
// mensagens) lista tudo da conta via /api/v1/conversations sem precisar
// dele. Por isso essa busca nunca deve travar o fluxo de conectar o
// WhatsApp: é só um "melhor esforço", chamado depois que o pareamento já
// deu certo (no polling de status) e de novo, sob demanda, quando a tela
// de Campanhas precisar dele.
import { crmFetch } from "./crm-auth.ts";
import { unwrap } from "./crm-client.ts";

export async function findWhatsappInboxId(supabase: any, ownerId: string): Promise<string | null> {
  try {
    const res = await crmFetch(supabase, ownerId, "/api/v1/inboxes");
    const unwrapped = unwrap(res);
    const list = Array.isArray(unwrapped) ? unwrapped : [];
    const whatsapp = list.find(
      (i: any) => i?.channel_type === "Channel::Whatsapp" || i?.channel?.type === "whatsapp",
    );
    return whatsapp?.id ? String(whatsapp.id) : null;
  } catch (e) {
    console.error("[crm-inbox] GET /inboxes falhou:", e);
    return null;
  }
}
