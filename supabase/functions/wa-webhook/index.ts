// Recebe os eventos da Evolution API e grava no espelho.
//
// ── O que isto substitui ────────────────────────────────────────────────
//
// O cron de 5 minutos. O CRM não tem webhook de entrada — "as conversas só
// existem por consulta" —, então até hoje mensagem nova era DESCOBERTA
// comparando contadores de não-lidas entre rodadas. É a causa da lentidão do
// chat. Aqui a mensagem CHEGA.
//
// ── Endpoint público, e por quê ─────────────────────────────────────────
//
// `verify_jwt = false` no config.toml: a Evolution não tem como apresentar um
// JWT do Supabase. A porta é fechada por um segredo compartilhado na
// querystring, mesmo desenho do `whatsapp-inbound-webhook` que já existe.
//
// ── Sempre 200, quase sempre ────────────────────────────────────────────
//
// Evento que não interessa, instância desconhecida, corpo estranho: tudo
// responde 200. A Evolution REENVIA o que não deu 200, e ficar reenviando um
// evento que nunca vai ser aceito enche o log dela e o disco da VPS — o
// mesmo disco que acabou de ser resgatado de 94%.
//
// A exceção é falha ao GRAVAR: aí o 500 é honesto e o reenvio é desejado.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mensagemDoEvento, telefoneDoJid } from "../_shared/evolution-mapear.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const SEGREDO = Deno.env.get("WA_WEBHOOK_SECRET") ?? "";

const ok = (corpo: Record<string, unknown> = {}) => Response.json({ ok: true, ...corpo });

/** O dono da instância. Instância que não está na tabela não grava nada. */
async function donoDaInstancia(nome: string): Promise<string | null> {
  const { data } = await supabase
    .from("wa_instances")
    .select("owner_id")
    .eq("instance_name", nome)
    .maybeSingle();
  return data?.owner_id ?? null;
}

async function marcarSinalDeVida(nome: string, extra: Record<string, unknown> = {}) {
  await supabase
    .from("wa_instances")
    .update({ last_event_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...extra })
    .eq("instance_name", nome);
}

/**
 * Uma mensagem que chegou ou saiu.
 *
 * Grava contato, conversa e mensagem nesta ordem: a conversa referencia o
 * contato, e a mensagem referencia a conversa. Fora de ordem abriria uma
 * janela com linha apontando para o que ainda não existe.
 */
async function gravarMensagem(ownerId: string, data: any) {
  const m = mensagemDoEvento(data);
  if (!m) return { ignorado: "evento sem id ou sem conversa" };

  const agora = new Date().toISOString();

  // O contato. `name` só é atualizado quando veio um nome de verdade: a
  // Evolution manda `pushName` vazio em muitos eventos, e gravar vazio por
  // cima apagaria o nome que já estava certo.
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
      // Copiada por definição: a mensagem está chegando agora, não há
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
      // Sem data no evento, a hora da chegada. É a única vez em todo o
      // espelho que "agora" é aceitável: a mensagem está literalmente
      // chegando neste instante, então o erro é de segundos.
      sent_at: m.sentAt ?? agora,
      payload: data,
      synced_at: agora,
    },
    { onConflict: "owner_id,origem,crm_message_id" },
  );
  if (erroMensagem) throw new Error(`mensagem: ${erroMensagem.message}`);

  return { gravado: m.crmMessageId, telefone: m.phone, grupo: m.ehGrupo };
}

/** Nome e foto de um contato, quando a Evolution os informa à parte. */
async function gravarContato(ownerId: string, data: any) {
  const jid = data?.id ?? data?.remoteJid;
  if (!jid) return { ignorado: "contato sem jid" };

  const linha: Record<string, unknown> = {
    owner_id: ownerId,
    origem: "evolution",
    crm_contact_id: String(jid),
    phone_raw: telefoneDoJid(jid),
    synced_at: new Date().toISOString(),
  };
  const nome = data?.pushName ?? data?.name ?? data?.notify;
  if (typeof nome === "string" && nome.trim()) linha.name = nome.trim();
  if (data?.profilePicUrl) linha.avatar_url = data.profilePicUrl;

  const { error } = await supabase
    .from("wa_contacts")
    .upsert(linha, { onConflict: "owner_id,origem,crm_contact_id" });
  if (error) throw new Error(`contato: ${error.message}`);
  return { gravado: String(jid) };
}

const ESTADOS: Record<string, "open" | "connecting" | "close"> = {
  open: "open",
  connecting: "connecting",
  close: "close",
};

Deno.serve(async (req) => {
  try {
    // O segredo antes de qualquer trabalho. Sem ele configurado, a função
    // recusa tudo em vez de aceitar tudo — porta sem fechadura é pior que
    // porta trancada com a chave perdida.
    const segredoRecebido = new URL(req.url).searchParams.get("secret") ?? "";
    if (!SEGREDO || segredoRecebido !== SEGREDO) {
      return Response.json({ error: "não autorizado" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body) return ok({ ignorado: "corpo vazio" });

    const evento = String(body?.event ?? "").toLowerCase().replace(/_/g, ".");
    const instancia = String(body?.instance ?? body?.instanceName ?? "");
    if (!instancia) return ok({ ignorado: "evento sem instância" });

    const ownerId = await donoDaInstancia(instancia);
    if (!ownerId) {
      // Não é erro: pode ser uma instância de outro sistema no mesmo
      // servidor. Devolver 500 faria a Evolution reenviar para sempre.
      console.warn(`[wa-webhook] instância desconhecida: ${instancia}`);
      return ok({ ignorado: "instância não cadastrada" });
    }

    let resultado: unknown = { ignorado: evento };

    if (evento === "messages.upsert") {
      // A Evolution manda ora um objeto, ora uma lista.
      const itens = Array.isArray(body?.data) ? body.data : [body?.data];
      const gravados = [];
      for (const item of itens) gravados.push(await gravarMensagem(ownerId, item));
      resultado = { evento, gravados };
    } else if (evento === "contacts.upsert" || evento === "contacts.update") {
      const itens = Array.isArray(body?.data) ? body.data : [body?.data];
      const gravados = [];
      for (const item of itens) gravados.push(await gravarContato(ownerId, item));
      resultado = { evento, gravados };
    } else if (evento === "connection.update") {
      const estado = ESTADOS[String(body?.data?.state ?? "").toLowerCase()];
      const extra: Record<string, unknown> = {};
      if (estado) extra.status = estado;
      if (estado === "open") extra.connected_at = new Date().toISOString();
      const numero = telefoneDoJid(body?.data?.wuid ?? body?.sender);
      if (numero) extra.phone_e164 = numero;
      await marcarSinalDeVida(instancia, extra);
      return ok({ evento, estado: estado ?? "desconhecido" });
    }

    await marcarSinalDeVida(instancia);
    return ok(resultado as Record<string, unknown>);
  } catch (e) {
    // Falha ao gravar É erro, e o 500 faz a Evolution reenviar — que é o
    // comportamento desejado: a mensagem do paciente não pode se perder
    // porque o banco piscou.
    console.error("[wa-webhook]", e);
    return Response.json(
      { error: e instanceof Error ? e.message : "falha ao gravar o evento" },
      { status: 500 },
    );
  }
});
