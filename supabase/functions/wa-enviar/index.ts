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
import { conexaoParaEnviar } from "../_shared/evolution-api.ts";
import { explicarSemConexao } from "../_shared/evolution-rota.ts";
import { enviarPelaEvolution } from "../_shared/whatsapp-send.ts";
import { soOSistema } from "../_shared/so-o-sistema.ts";
import { cancelarRecuperacao } from "../_shared/recuperacao-no-banco.ts";

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

/**
 * Uma pessoa da equipe escreveu para o paciente pelo chat: a conversa é dela.
 *
 * ── Por que aqui, e não no webhook ──────────────────────────────────────
 *
 * Mensagem que sai pela API da Evolution NÃO volta como `messages.upsert` —
 * só a que é digitada no celular volta. Então o webhook nunca via a resposta
 * escrita no chat do sistema, e a assistente seguia falando por cima. Em
 * 03/11 a recepção escreveu "Verifiquei e tenho hoje às 18h…" às 13:53:03 e
 * a Luna mandou "Então o horário das 17h não encaixa…" cinco segundos depois;
 * só a mensagem digitada no celular, às 13:54, calou a conversa.
 *
 * Marca ANTES de enviar: a Luna confere a marca antes de cada bolha, e uma
 * resposta dela que já estava sendo escrita para aqui. Sem sessão ainda, cria
 * uma já assumida, para a próxima mensagem do paciente não abrir conversa
 * nova com a assistente.
 *
 * Nunca levanta: a mensagem da equipe tem de sair mesmo se a marca falhar.
 */
async function equipeAssumiu(ownerId: string, conversationId: string) {
  try {
    const agora = new Date().toISOString();
    const { data: sessoes } = await supabase
      .from("ai_agent_sessions")
      .select("id, human_took_over_at")
      .eq("owner_id", ownerId)
      .eq("conversation_id", conversationId);
    if ((sessoes ?? []).length) {
      for (const s of sessoes as { id: string; human_took_over_at: string | null }[]) {
        if (!s.human_took_over_at) {
          await supabase
            .from("ai_agent_sessions")
            .update({ human_took_over_at: agora, updated_at: agora })
            .eq("id", s.id);
        }
        await cancelarRecuperacao(supabase, s.id, "a equipe assumiu a conversa");
      }
      return;
    }
    const { data: agente } = await supabase
      .from("ai_agents")
      .select("id")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!agente?.id) return;
    await supabase.from("ai_agent_sessions").insert({
      owner_id: ownerId,
      agent_id: agente.id,
      conversation_id: conversationId,
      human_took_over_at: agora,
    });
  } catch (e) {
    console.warn(
      "[wa-enviar] não marquei a conversa como assumida:",
      e instanceof Error ? e.message : e,
    );
  }
}

async function handleSend(
  ownerId: string,
  conversationId: string,
  content: string,
  isPrivate = false,
  anexos: AnexoDeSaida[] = [],
  assumir = false,
) {
  if (isPrivate) {
    if (!content.trim()) throw new Error("A nota interna está vazia.");
    return await gravarNota(ownerId, conversationId, content);
  }

  // Só quando quem chama é uma pessoa no chat. A confirmação automática da
  // reserva de paciente modelo também passa por aqui e não assume nada.
  if (assumir) await equipeAssumiu(ownerId, conversationId);

  const { instancia, motivo } = await conexaoParaEnviar(supabase, ownerId);
  if (!instancia) throw new Error(explicarSemConexao(motivo));

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
  const barrado = soOSistema(req);
  if (barrado) return barrado;
  try {
    const body = await req.json();
    const { ownerId, conversationId, content, isPrivate, attachments, assumir } = body as {
      assumir?: boolean;
      ownerId?: string;
      conversationId?: string;
      content?: string;
      isPrivate?: boolean;
      attachments?: AnexoDeSaida[];
    };
    if (!ownerId || !conversationId) {
      return new Response(JSON.stringify({ error: "ownerId e conversationId são obrigatórios" }), {
        status: 400,
      });
    }

    const resultado = await handleSend(
      ownerId,
      conversationId,
      content?.trim() ?? "",
      !!isPrivate,
      attachments ?? [],
      assumir === true,
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
