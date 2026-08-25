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
 *  `midiaIgnorada` vem preenchido quando havia imagem para mandar e ela não
 *  saiu — é o que impede a foto de sumir em silêncio. Os dois caminhos (com e
 *  sem conversa aberta) sabem levar imagem legendada hoje, então isso só
 *  aparece se o CRM recusar o anexo. */
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
  //
  // Com imagem, este endpoint também aceita multipart — os campos aninhados vão
  // como `message[content]` e `message[attachments][]` (confirmado pelo time do
  // CRM, 25/08). Sai UMA mensagem com a foto legendada, sem precisar criar a
  // conversa e mandar o anexo depois, que seriam duas mensagens no WhatsApp de
  // quem recebe.
  if (midia) {
    const form = new FormData();
    form.append("contact_id", alvo.contact_id);
    form.append("inbox_id", inboxId);
    form.append("message[content]", message);
    form.append(
      "message[attachments][]",
      new File([midia.bytes as BlobPart], midia.nome, {
        type: midia.tipo || "application/octet-stream",
      }),
    );
    try {
      await crmFetch(supabase, ownerId, "/api/v1/conversations", { method: "POST", body: form });
      return { via: "conversation_nova_midia" };
    } catch (e) {
      // O time do CRM validou este caminho na camada do Rails, não de ponta a
      // ponta por HTTP com token — e avisou disso. Se ele for RECUSADO (4xx), a
      // conversa não chegou a ser criada, então dá pra cair no JSON de sempre e
      // a pessoa recebe ao menos o texto, com o motivo da foto faltar gravado
      // na linha do alvo.
      //
      // Só em 4xx. Num 5xx ou timeout não dá pra saber se a conversa foi criada
      // antes de a resposta se perder, e repetir mandaria a mensagem duas vezes
      // — pior do que falhar.
      const status = Number((e as any)?.status ?? 0);
      if (status < 400 || status >= 500) throw e;
      console.warn("[whatsapp-send] multipart recusado na criação da conversa:", String(e).slice(0, 300));
      await criarConversaSoTexto(supabase, ownerId, alvo.contact_id, inboxId, message);
      return {
        via: "conversation_new",
        midiaIgnorada: "O CRM recusou a imagem ao abrir a conversa; o texto foi enviado.",
      };
    }
  }

  await criarConversaSoTexto(supabase, ownerId, alvo.contact_id, inboxId, message);
  return { via: "conversation_new" };
}

async function criarConversaSoTexto(
  supabase: any,
  ownerId: string,
  contactId: string,
  inboxId: string,
  message: string,
): Promise<void> {
  await crmFetch(supabase, ownerId, "/api/v1/conversations", {
    method: "POST",
    body: JSON.stringify({
      contact_id: contactId,
      inbox_id: inboxId,
      message: { content: message },
    }),
  });
}
