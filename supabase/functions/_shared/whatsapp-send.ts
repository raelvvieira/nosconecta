// Envio individual de mensagem WhatsApp pra um contato do CRM — extraída de
// `whatsapp-broadcast/index.ts` (onde nasceu) pra ser reaproveitada também
// por `atendimento-automations/index.ts` (ação "Enviar WhatsApp" de uma
// automação). Mesmo padrão de injeção de dependência de `_shared/crm-auth.ts`
// (`crmFetch(supabase, ownerId, ...)`  — `supabase` é sempre parâmetro
// explícito, nunca client de módulo por closure, porque este arquivo é
// importado por mais de uma função e cada uma tem o seu.
import { crmFetch } from "./crm-auth.ts";

/** Para quem a mensagem vai.
 *
 *  Exportado — e não escrito à mão em cada chamador — porque foi exatamente aí
 *  que uma automação silenciosa nasceu: `atendimento-automations` montava o
 *  objeto em camelCase (`contact_id` virava `contactId`), o campo saía
 *  `undefined`, o JSON.stringify descartava e a chamada ia ao CRM sem contato
 *  nenhum. O disparo de campanhas nunca sofreu porque passa a linha de
 *  `whatsapp_broadcast_targets` direto, cujas colunas já têm estes nomes.
 *
 *  As Edge Functions rodam em Deno e ficam fora do `bunx tsc` do projeto, que
 *  cobre só `src/` — então aqui o nome único é a única defesa que existe. */
export interface AlvoDeEnvio {
  conversation_id: string | null;
  contact_id: string;
}

/** Imagem enviada JUNTO do texto, como legenda de uma mensagem só. */
export interface MidiaDeEnvio {
  nome: string;
  tipo: string;
  bytes: Uint8Array;
}

/** Manda uma mensagem, devolvendo por qual caminho saiu.
 *
 *  `midiaIgnorada` vem preenchido quando havia imagem para mandar e o caminho
 *  usado não sabe carregá-la — é o que impede a foto de sumir em silêncio. */
export async function enviarWhatsapp(
  supabase: any,
  ownerId: string,
  alvo: AlvoDeEnvio,
  message: string,
  midia?: MidiaDeEnvio | null,
): Promise<{ via: string; midiaIgnorada?: string }> {
  if (alvo.conversation_id) {
    // Caminho CONFIRMADO: é o mesmo que o chat usa para responder alguém.
    //
    // Com imagem, o endpoint troca de JSON para multipart e o texto vai em
    // `content` na MESMA requisição — é assim que sai uma mensagem só, com a
    // foto legendada, e não duas mensagens seguidas. Idêntico ao que
    // `crm-conversations/handleSend` já faz para o anexo do chat.
    if (midia) {
      const form = new FormData();
      form.append("content", message);
      form.append("message_type", "outgoing");
      form.append("private", "false");
      form.append(
        "attachments[]",
        new File([midia.bytes as BlobPart], midia.nome, {
          type: midia.tipo || "application/octet-stream",
        }),
      );
      await crmFetch(supabase, ownerId, `/api/v1/conversations/${alvo.conversation_id}/messages`, {
        method: "POST",
        body: form,
      });
      return { via: "conversation_midia" };
    }

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
  // Imagem NÃO acompanha a criação da conversa. Este endpoint aceita só JSON
  // com `message.content`; anexar aqui nunca foi confirmado pelo time do CRM, e
  // chutar um formato faria a requisição inteira ser recusada — a pessoa não
  // receberia nem a foto nem o texto. Então o texto sai, e a linha do alvo
  // registra por que a foto não foi, para aparecer em Execuções em vez de
  // sumir.
  //
  // Mandar a foto numa segunda mensagem logo depois seria possível (o `id` da
  // conversa volta nesta resposta), mas seriam DUAS mensagens — e o pedido era
  // explicitamente uma só, com legenda.
  return {
    via: "conversation_new",
    midiaIgnorada: midia
      ? "Contato ainda não tinha conversa aberta: a imagem só pode ser anexada a uma conversa existente."
      : undefined,
  };
}
