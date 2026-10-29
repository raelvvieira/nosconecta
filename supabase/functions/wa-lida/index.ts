// Avisa o WhatsApp que a conversa foi lida aqui.
//
// ── O outro lado da sincronia ───────────────────────────────────────────
//
// `wa-webhook` cuida do sentido celular → sistema: quando alguém lê no
// aparelho, a bolinha some daqui. Esta função cuida do contrário — alguém abre
// a conversa no sistema, e o aparelho também para de mostrar não lida.
//
// Os dois juntos são o que a clínica pediu: **a bolinha só aparece se ninguém
// viu em canal nenhum.**
//
// ── Por que uma Edge Function, e não a server function direto ───────────
//
// A chave da Evolution é um segredo do Supabase, visível para funções e não
// para o aplicativo. Mesmo motivo de `wa-enviar`.
//
// ── Por que separada de `wa-enviar` ─────────────────────────────────────
//
// Porque `wa-enviar` tem uma responsabilidade que não pode falhar: a mensagem
// que alguém escreveu. Esta aqui é o oposto — ela é opcional, roda sozinha ao
// abrir uma conversa, e o pior caso dela é a bolinha continuar acesa no
// celular. Misturar as duas faria uma falha de marcação aparecer como falha de
// envio na tela de quem está conversando com um paciente.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { conexaoParaEnviar, evolutionFetch } from "../_shared/evolution-api.ts";
import { ehConversaDoAparelho } from "../_shared/leitura-no-celular.ts";
import { soOSistema } from "../_shared/so-o-sistema.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/**
 * Quantas mensagens recebidas vão no pedido.
 *
 * O WhatsApp marca a conversa inteira a partir da mais recente, mas a Evolution
 * pede a lista explícita. Vinte cobre com folga o que alguém deixou acumular
 * sem transformar a abertura de uma conversa antiga num pedido gigante.
 *
 * Marcar como lida uma mensagem que já estava lida não faz nada — então errar
 * para mais aqui é barato, e errar para menos deixaria bolinha no aparelho.
 */
const QUANTAS = 20;

async function marcar(ownerId: string, conversationId: string) {
  // Só as da conexão própria: o id de uma conversa herdada do CRM não existe no
  // aparelho. Ver `ehConversaDoAparelho`.
  if (!ehConversaDoAparelho(conversationId)) {
    return { ignorado: "conversa não é da conexão própria" };
  }

  const { instancia, motivo } = await conexaoParaEnviar(supabase, ownerId);
  if (!instancia) return { ignorado: motivo };

  const { data, error } = await supabase
    .from("wa_messages")
    .select("crm_message_id")
    .eq("owner_id", ownerId)
    .eq("crm_conversation_id", conversationId)
    // Só o que a PESSOA mandou: marcar como lida a própria mensagem da clínica
    // não quer dizer nada, e é ela que o aparelho ignoraria.
    .eq("from_me", false)
    .order("sent_at", { ascending: false })
    .limit(QUANTAS);
  if (error) return { ignorado: `não deu para ler as mensagens: ${error.message}` };

  const chaves = (data ?? [])
    .map((m: { crm_message_id?: string | null }) => String(m.crm_message_id ?? "").trim())
    .filter(Boolean)
    // Cinto e suspensório contra a nota interna: ela é uma linha nossa, com id
    // `nota:…` que não existe no WhatsApp. O filtro `from_me = false` acima já
    // a deixa de fora — notas saem da clínica —, mas uma nota que um dia entre
    // como recebida mandaria um id inventado para a Evolution.
    .filter((id: string) => !id.startsWith("nota:"))
    .map((id: string) => ({ remoteJid: conversationId, fromMe: false, id }));

  if (!chaves.length) return { ignorado: "nenhuma mensagem recebida para marcar" };

  await evolutionFetch(`/chat/markMessageAsRead/${encodeURIComponent(instancia)}`, {
    method: "POST",
    body: JSON.stringify({ readMessages: chaves }),
  });

  return { marcadas: chaves.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  const barrado = soOSistema(req);
  if (barrado) return barrado;
  try {
    const body = await req.json().catch(() => ({}));
    const { ownerId, conversationId } = (body ?? {}) as {
      ownerId?: string;
      conversationId?: string;
    };
    if (!ownerId || !conversationId) {
      return Response.json({ error: "ownerId e conversationId são obrigatórios" }, { status: 400 });
    }

    return Response.json({ ok: true, ...(await marcar(ownerId, String(conversationId))) });
  } catch (e) {
    // 200 com o motivo, e não 500: quem chama é a abertura de uma conversa, e
    // ela não pode virar tela de erro porque o aparelho não aceitou a marcação.
    // O log fica; a pessoa que abriu a conversa não fica sabendo de nada.
    console.warn("[wa-lida]", e instanceof Error ? e.message : e);
    return Response.json({ ok: false, motivo: e instanceof Error ? e.message : "falhou" });
  }
});
