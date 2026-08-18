// Envio individual de mensagem WhatsApp pra um contato do CRM — extraída de
// `whatsapp-broadcast/index.ts` (onde nasceu) pra ser reaproveitada também
// por `atendimento-automations/index.ts` (ação "Enviar WhatsApp" de uma
// automação). Mesmo padrão de injeção de dependência de `_shared/crm-auth.ts`
// (`crmFetch(supabase, ownerId, ...)`  — `supabase` é sempre parâmetro
// explícito, nunca client de módulo por closure, porque este arquivo é
// importado por mais de uma função e cada uma tem o seu.
import { crmFetch } from "./crm-auth.ts";

/** Manda uma mensagem, devolvendo por qual caminho saiu. */
export async function enviarWhatsapp(
  supabase: any,
  ownerId: string,
  alvo: { conversation_id: string | null; contact_id: string },
  message: string,
): Promise<{ via: string }> {
  if (alvo.conversation_id) {
    // Caminho CONFIRMADO: é o mesmo que o chat usa para responder alguém.
    await crmFetch(supabase, ownerId, `/api/v1/conversations/${alvo.conversation_id}/messages`, {
      method: "POST",
      body: JSON.stringify({ content: message, message_type: "outgoing", private: false }),
    });
    return { via: "conversation" };
  }

  // Sem conversa ainda: cria a conversa direto — caminho validado pelo time do
  // CRM (18/08) com disparo real entregue. Uma chamada só vincula contato↔inbox
  // (a partir do telefone), abre a conversa e manda a mensagem de saída. Troca
  // o antigo caminho especulativo via /scheduled_actions (nunca confirmado
  // funcionando sozinho por contato — o uso real desse endpoint, em
  // crm-conversations/index.ts, sempre exige conversation_id).
  const { data: cred } = await supabase
    .from("crm_credentials")
    .select("inbox_id")
    .eq("owner_id", ownerId)
    .maybeSingle();
  const inboxId: string | null = cred?.inbox_id ?? null;
  if (!inboxId) {
    throw new Error(
      "Caixa de WhatsApp não encontrada para iniciar a conversa. Reconecte o número em Atendimentos → Conectar.",
    );
  }

  // NÃO mandar `source_id`: o CRM deriva do telefone do contato, e um valor
  // próprio faz a requisição ser recusada (confirmado pelo time do CRM, 18/08).
  await crmFetch(supabase, ownerId, "/api/v1/conversations", {
    method: "POST",
    body: JSON.stringify({
      contact_id: alvo.contact_id,
      inbox_id: inboxId,
      message: { content: message },
    }),
  });
  return { via: "conversation_new" };
}
