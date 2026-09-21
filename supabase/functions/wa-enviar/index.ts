// Manda a mensagem que alguém escreveu no chat.
//
// ── O que isto substitui ────────────────────────────────────────────────
//
// A `crm-conversations`, que fazia isto e mais cinco coisas: listar conversas,
// ler mensagens, agendar, listar agendadas e cancelar agendamento. As quatro
// primeiras já não traziam nada — a conta do CRM não tem mais caixa de
// WhatsApp desde 18/09 — e o agendamento mudou de casa (ver
// `scheduleWhatsappMessage` em `src/lib/atendimentos/atendimentos.functions.ts`,
// que agora usa a mesma fila do disparo).
//
// ── Por que ainda é uma Edge Function ───────────────────────────────────
//
// A chave da Evolution é um segredo do Supabase, visível para funções e não
// para o app. O anexo também: ele chega em base64 porque server function e
// Edge Function só trocam JSON, e é aqui que vira arquivo de verdade.
//
// ── As duas coisas que mudaram de comportamento ─────────────────────────
//
// **A nota interna** era um recurso do CRM: uma anotação que fica na conversa
// e não vai para o paciente. Agora é uma linha nossa em `wa_messages` com
// `is_private`, que a thread já sabe ler e nunca envia. O texto continua onde
// sempre esteve, do lado da conversa a que pertence.
//
// **Dois ou mais anexos** saíam numa mensagem só pelo CRM. A Evolution manda
// um arquivo por chamada, então viram mensagens seguidas, o texto como legenda
// da primeira. É diferente do que era; perder os arquivos seria pior.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decidirCaminho } from "../_shared/evolution-api.ts";
import { enviarPelaEvolution } from "../_shared/whatsapp-send.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface AnexoDeSaida {
  name: string;
  type: string;
  /** O arquivo em base64 — server function e Edge Function só trocam JSON. */
  data: string;
  isRecordedAudio?: boolean;
}

function base64ParaBytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * A nota interna.
 *
 * Nunca sai para o WhatsApp — é uma anotação da equipe sobre a conversa. Por
 * isso ela não passa nem perto de `enviarPelaEvolution`: um engano aqui
 * publicaria para o paciente um texto escrito para uso interno.
 *
 * `crm_message_id` próprio, com prefixo, para nunca colidir com um id de
 * mensagem de verdade vindo da Evolution.
 */
async function gravarNota(ownerId: string, conversationId: string, texto: string) {
  const agora = new Date().toISOString();
  const { error } = await supabase.from("wa_messages").insert({
    owner_id: ownerId,
    origem: "evolution",
    crm_message_id: `nota:${crypto.randomUUID()}`,
    crm_conversation_id: conversationId,
    from_me: true,
    body: texto,
    is_private: true,
    attachments: [],
    sent_at: agora,
    synced_at: agora,
  });
  if (error) throw new Error(`nota: ${error.message}`);
  return { ok: true, message: { via: "nota_interna" } };
}

async function handleSend(
  ownerId: string,
  conversationId: string,
  content: string,
  isPrivate = false,
  anexos: AnexoDeSaida[] = [],
) {
  if (isPrivate) {
    if (!content.trim()) throw new Error("A nota interna está vazia.");
    return await gravarNota(ownerId, conversationId, content);
  }

  const { caminho, instancia } = await decidirCaminho(supabase, ownerId);
  if (caminho !== "evolution" || !instancia) {
    throw new Error(
      "O WhatsApp da clínica não está conectado. Conecte o número em Atendimentos para poder responder.",
    );
  }

  const alvo = { conversation_id: conversationId };

  if (anexos.length === 0) {
    const { via } = await enviarPelaEvolution(supabase, ownerId, instancia, alvo, content, null);
    return { ok: true, message: { via } };
  }

  // Um arquivo por chamada, em ordem. O texto é a legenda do PRIMEIRO: repetir
  // a legenda em cada arquivo mandaria o mesmo texto três vezes para alguém
  // que só queria três fotos.
  const vias: string[] = [];
  for (const [i, anexo] of anexos.entries()) {
    const { via } = await enviarPelaEvolution(
      supabase,
      ownerId,
      instancia,
      alvo,
      i === 0 ? content : "",
      { nome: anexo.name, tipo: anexo.type, bytes: base64ParaBytes(anexo.data) },
    );
    vias.push(via);
  }
  return { ok: true, message: { via: vias.join("+") } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  try {
    const body = await req.json();
    const { ownerId, conversationId, content, isPrivate, attachments } = body as {
      ownerId?: string;
      conversationId?: string;
      content?: string;
      isPrivate?: boolean;
      attachments?: AnexoDeSaida[];
    };
    if (!ownerId || !conversationId) {
      return new Response(
        JSON.stringify({ error: "ownerId e conversationId são obrigatórios" }),
        { status: 400 },
      );
    }

    const resultado = await handleSend(
      ownerId,
      conversationId,
      content?.trim() ?? "",
      !!isPrivate,
      attachments ?? [],
    );
    return new Response(JSON.stringify(resultado), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error("[wa-enviar]", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
    });
  }
});
