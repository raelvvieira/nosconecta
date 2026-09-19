import { type MensagemEspelhada, mensagemDoEvento } from "./evolution-mapear.ts";

// Gravar uma mensagem da Evolution no espelho — de um lugar só.
//
// Nasceu dentro de `wa-webhook`, quando só ele gravava. Agora o ENVIO também
// grava: a Evolution avisa por webhook o que chega, mas a mensagem que o
// sistema manda pela API dela sai por outro evento, que o webhook não escuta
// — e o resultado era a mensagem chegar no WhatsApp de quem recebe e não
// aparecer na conversa de quem mandou.
//
// Esperar o webhook resolver isso teria dois problemas: depende de ligar mais
// um evento na VPS, e mesmo ligado chega depois. Gravar no instante do envio
// é imediato, e se o webhook ainda entregar o mesmo id o upsert não duplica.
//
// Duas cópias desta gravação divergiriam em silêncio — uma ganharia um campo
// novo, a outra não, e a diferença só apareceria como conversa faltando dado.

/**
 * Grava contato, conversa e mensagem, nesta ordem.
 *
 * A ordem importa: a conversa referencia o contato e a mensagem referencia a
 * conversa. Fora de ordem abriria uma janela com linha apontando para o que
 * ainda não existe.
 */
export async function gravarMensagemEspelhada(
  supabase: any,
  ownerId: string,
  m: MensagemEspelhada,
  payload: unknown,
): Promise<void> {
  const agora = new Date().toISOString();

  // O contato. `name` só é atualizado quando veio um nome de verdade: a
  // Evolution manda `pushName` vazio em muitos eventos, e gravar vazio por
  // cima apagaria o nome que já estava certo. Em mensagem que a clínica
  // manda, o `pushName` é o nome DELA — por isso o tradutor já o anula.
  const contato: Record<string, unknown> = {
    owner_id: ownerId,
    origem: "evolution",
    crm_contact_id: m.crmContactId,
    phone_raw: m.phone,
    synced_at: agora,
  };
  if (m.contactName?.trim()) contato.name = m.contactName.trim();

  const { error: erroContato } = await supabase
    .from("wa_contacts")
    .upsert(contato, { onConflict: "owner_id,origem,crm_contact_id" });
  if (erroContato) throw new Error(`contato: ${erroContato.message}`);

  // A conversa. `last_message_at` e `last_message_preview` NÃO entram: são do
  // gatilho, que os calcula a partir das mensagens de verdade.
  const { error: erroConversa } = await supabase.from("wa_conversations").upsert(
    {
      owner_id: ownerId,
      origem: "evolution",
      crm_conversation_id: m.crmConversationId,
      crm_contact_id: m.crmContactId,
      status: "open",
      // Copiada por definição: a mensagem está passando agora, não há
      // histórico atrasado para buscar.
      messages_synced_at: agora,
      synced_at: agora,
    },
    { onConflict: "owner_id,origem,crm_conversation_id" },
  );
  if (erroConversa) throw new Error(`conversa: ${erroConversa.message}`);

  const { error: erroMensagem } = await supabase.from("wa_messages").upsert(
    {
      owner_id: ownerId,
      origem: "evolution",
      crm_message_id: m.crmMessageId,
      crm_conversation_id: m.crmConversationId,
      from_me: m.fromMe,
      body: m.body,
      is_private: false,
      attachments: m.attachments,
      // Sem data no evento, a hora de agora. É a única vez em todo o espelho
      // que "agora" é aceitável: a mensagem está literalmente passando neste
      // instante, então o erro é de segundos.
      sent_at: m.sentAt ?? agora,
      payload: payload,
      synced_at: agora,
    },
    { onConflict: "owner_id,origem,crm_message_id" },
  );
  if (erroMensagem) throw new Error(`mensagem: ${erroMensagem.message}`);
}

/**
 * A resposta de `/message/sendText` ou `/message/sendMedia` virando linha do
 * espelho.
 *
 * A Evolution devolve o mesmo formato que manda no webhook — `key`, `message`,
 * `messageTimestamp` —, então o tradutor de eventos serve sem adaptação. É o
 * que garante que a mensagem enviada e a recebida sejam guardadas do mesmo
 * jeito: mesmo id, mesma data, mesmo lugar do texto.
 *
 * `null` quando a resposta não tem id — aí não há o que gravar, e quem chama
 * decide se isso é erro. O envio em si já aconteceu.
 */
export function mensagemEnviada(resposta: unknown): MensagemEspelhada | null {
  if (!resposta || typeof resposta !== "object") return null;
  const corpo = resposta as Record<string, unknown>;
  // Versões da Evolution diferem em envelopar ou não a mensagem. Aceitar as
  // duas formas custa uma linha; apostar na errada custa a mensagem enviada
  // não aparecer na conversa — sem erro nenhum, que é como este defeito
  // apareceu da primeira vez.
  const alvo = corpo.key ? corpo : ((corpo.data ?? corpo.message) as unknown);
  return mensagemDoEvento(alvo);
}
