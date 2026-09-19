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
import {
  type MensagemEspelhada,
  mensagemDoEvento,
  telefoneDoJid,
} from "../_shared/evolution-mapear.ts";
import { gravarMensagemEspelhada } from "../_shared/espelho-evolution.ts";
import { pushToOwner } from "../_shared/push.ts";

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
    .update({
      last_event_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...extra,
    })
    .eq("instance_name", nome);
}

/**
 * Uma mensagem que chegou pelo webhook.
 *
 * A gravação em si mora em `_shared/espelho-evolution.ts`: o ENVIO também
 * grava, e duas cópias da mesma escrita divergem em silêncio.
 */
async function gravarMensagem(ownerId: string, data: any) {
  const m = mensagemDoEvento(data);
  if (!m) return { ignorado: "evento sem id ou sem conversa" };

  await gravarMensagemEspelhada(supabase, ownerId, m, data);

  await avisar(ownerId, m);

  return { gravado: m.crmMessageId, telefone: m.phone, grupo: m.ehGrupo };
}

/**
 * O aviso de "chegou mensagem" no celular de quem atende.
 *
 * ── O que isto substitui ────────────────────────────────────────────────
 *
 * Um cron de 2 em 2 minutos (`push-poll-conversations`) que perguntava ao CRM
 * a lista inteira de conversas e comparava contadores de não-lidas entre
 * rodadas — porque o CRM não tinha webhook. O aviso chegava com até dois
 * minutos de atraso, e só enquanto o CRM atendesse. Aqui ele sai no instante
 * em que a mensagem chega.
 *
 * ── Quem NÃO recebe aviso ───────────────────────────────────────────────
 *
 * A mensagem que a própria clínica mandou: quem a escreveu não precisa ser
 * avisado dela, e ela chega de volta pelo mesmo webhook.
 *
 * Grupo. São 12 na base — "#NÓS Floripa - Gestão", "Grupo de Estudos Dr.
 * Mauro K" —, todos internos e nenhum de paciente. Um grupo ativo faria o
 * celular de todo mundo vibrar o dia inteiro, e o primeiro reflexo de quem
 * recebe aviso demais é desligar o aviso — inclusive o do paciente.
 *
 * ── E por que uma falha aqui não derruba a gravação ─────────────────────
 *
 * A mensagem já está no banco quando esta função roda. Um erro de push não
 * pode virar 500, porque 500 faz a Evolution REENVIAR o evento — e o reenvio
 * grava de novo e avisa de novo. Perder um aviso é ruim; duplicar a mensagem
 * do paciente é pior.
 */
async function avisar(ownerId: string, m: MensagemEspelhada) {
  if (m.fromMe || m.ehGrupo) return;

  try {
    const { data: contato } = await supabase
      .from("wa_contacts")
      .select("name")
      .eq("owner_id", ownerId)
      .eq("origem", "evolution")
      .eq("crm_contact_id", m.crmContactId)
      .limit(1)
      .maybeSingle();

    await pushToOwner(supabase, ownerId, "whatsapp_message", {
      title: contato?.name?.trim() || m.phone || "Contato",
      body: resumo(m),
      url: "/atendimentos/chat",
    });
  } catch (e) {
    console.warn("[wa-webhook] aviso não saiu:", e instanceof Error ? e.message : e);
  }
}

/** O texto do aviso. Sem texto, o que veio — "Foto" é informação; "" não é. */
function resumo(m: MensagemEspelhada): string {
  const texto = m.body?.trim();
  if (texto) return texto.length > 120 ? `${texto.slice(0, 117)}…` : texto;
  // `attachments` é `unknown[]` no tradutor de propósito — ele não impõe
  // forma ao que grava. Aqui a leitura é estreita: só o tipo do primeiro.
  const tipo = (m.attachments[0] as { tipo?: string } | undefined)?.tipo;
  if (tipo === "image") return "📷 Foto";
  if (tipo === "audio") return "🎤 Áudio";
  if (tipo === "video") return "🎬 Vídeo";
  if (tipo) return "📎 Arquivo";
  return "Mandou uma mensagem nova no WhatsApp.";
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

    const evento = String(body?.event ?? "")
      .toLowerCase()
      .replace(/_/g, ".");
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
