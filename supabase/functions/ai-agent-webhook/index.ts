// O CRM entrega aqui cada mensagem que o paciente manda.
//
// ── Endpoint público ───────────────────────────────────────────────────────
//
// `verify_jwt = false` (ver supabase/config.toml): o CRM não tem como
// apresentar um JWT do Supabase. A proteção é um segredo compartilhado na
// query, mesmo padrão e mesma justificativa do `whatsapp-inbound-webhook` que
// já existe para o Brevo.
//
// O `ownerId` vem na URL junto do segredo. Uma clínica só hoje, mas o CRM não
// tem como saber de quem é a conversa — e deduzir pelo inbox exigiria uma
// consulta a mais em todo evento, no caminho mais quente do sistema.
//
// ── O que este arquivo NÃO faz ─────────────────────────────────────────────
//
// Não decide se responde (isso é `_shared/filtros-do-agente.ts`), não monta a
// instrução (`instrucao-do-agente.ts`) e não orquestra (`atendimento.ts`). Aqui
// é só a borda: autenticar, traduzir o formato do CRM e devolver a resposta
// pelo caminho do CRM. É o mesmo desenho do resto do módulo.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crmFetch } from "../_shared/crm-auth.ts";
import { unwrap } from "../_shared/crm-client.ts";
import { atender, type MensagemDeEntrada } from "../_shared/atendimento.ts";
import { responderPaciente } from "../_shared/modelo-de-atendimento.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** As últimas mensagens da conversa, para o modelo saber do que se fala. */
async function historicoDaConversa(ownerId: string, conversationId: string) {
  try {
    const res = await crmFetch(
      supabase,
      ownerId,
      `/api/v1/conversations/${conversationId}/messages`,
    );
    const msgs = unwrap(res);
    if (!Array.isArray(msgs)) return [];
    return msgs
      .map((m: any) => {
        const texto = String(m?.content ?? "").trim();
        if (!texto) return null;
        const tipo = m?.message_type;
        const daClinica = tipo === 1 || tipo === "1" || tipo === "outgoing";
        return { deQuem: daClinica ? ("clinica" as const) : ("paciente" as const), texto };
      })
      .filter(Boolean) as { deQuem: "clinica" | "paciente"; texto: string }[];
  } catch {
    // Sem histórico o agente responde só a última mensagem. Pior que com, muito
    // melhor que não responder.
    return [];
  }
}

/** Espera de verdade antes de mandar o pedaço — é o tempo de digitação. */
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");

  const url = new URL(req.url);
  const segredo = Deno.env.get("AI_AGENT_WEBHOOK_SECRET");
  if (!segredo || url.searchParams.get("secret") !== segredo) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
  const ownerId = url.searchParams.get("ownerId");
  if (!ownerId) {
    return new Response(JSON.stringify({ error: "ownerId é obrigatório na URL" }), { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));

    // Formato do evento do CRM (spec §06). Os nomes alternativos existem porque
    // o payload real ainda não foi visto: ler dois nomes é inofensivo, e
    // devolver 500 por causa de um campo com outro nome custaria a mensagem.
    const conversationId = String(
      body?.conversation_id ?? body?.conversation?.id ?? body?.metadata?.conversation?.id ?? "",
    );
    if (!conversationId) {
      return new Response(JSON.stringify({ ok: true, skipped: "sem conversation_id" }));
    }

    const entrada: MensagemDeEntrada = {
      conversationId,
      contactId: String(body?.contact_id ?? body?.metadata?.contact?.id ?? "") || null,
      contactName: body?.metadata?.contact?.name ?? null,
      conteudo: body?.message_content ?? body?.content ?? null,
      // `message_type` 1/outgoing = saiu da clínica. Sem isto o agente responde
      // a própria resposta, em laço.
      daClinica:
        body?.message_type === 1 ||
        body?.message_type === "1" ||
        body?.message_type === "outgoing",
      privada: body?.private === true || body?.private === "true",
    };

    const resultado = await atender(
      {
        supabase,
        ownerId,
        historico: (id) => historicoDaConversa(ownerId, id),
        responderComIa: responderPaciente,
        enviar: async (pedaco, esperaMs) => {
          if (esperaMs > 0) await dormir(esperaMs);
          await crmFetch(supabase, ownerId, `/api/v1/conversations/${conversationId}/messages`, {
            method: "POST",
            body: JSON.stringify({ content: pedaco, message_type: "outgoing", private: false }),
          });
        },
      },
      entrada,
    );

    return new Response(JSON.stringify({ ok: true, ...resultado }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error("[ai-agent-webhook]", e);
    // 200 de propósito num erro nosso: o CRM não deve reenfileirar a mensagem e
    // fazer o paciente receber a mesma resposta duas vezes. O erro já está
    // gravado em `ai_agent_messages` e aparece na tela.
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
});
