// Proxy pros dois endpoints de análise do CRM Wavy confirmados no manual de
// integração v2 (seções 11-12) — só leitura, nada especulativo, os dois têm
// exemplo de resposta real documentado:
//
//   GET /api/v1/sales_assistant — análise diária (roda às 4h no CRM) do
//   funil: total de conversas, quebra por etapa, gargalo (etapa mais
//   travada) e a lista de conversas travadas com motivo/sugestão. Antes da
//   primeira rodada, `gerado_em` vem `null` e as listas vazias — não é erro,
//   é "ainda não analisado".
//
//   GET /api/v1/sales_playbook — status do agente de IA de vendas: se está
//   ativo, se está pronto (3+ vendas aprendidas), e quantas faltam. Só
//   leitura aqui — ativar o agente (PATCH) fica fora de escopo por ora.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crmFetch } from "../_shared/crm-auth.ts";
import { unwrap } from "../_shared/crm-client.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function handleGetSalesAssistant(ownerId: string) {
  const res = await crmFetch(supabase, ownerId, "/api/v1/sales_assistant");
  return { ok: true, assistant: unwrap(res) };
}

async function handleGetSalesPlaybook(ownerId: string) {
  const res = await crmFetch(supabase, ownerId, "/api/v1/sales_playbook");
  return { ok: true, playbook: unwrap(res) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  try {
    const { ownerId, action } = (await req.json()) as { ownerId?: string; action?: string };
    if (!ownerId || !action) {
      return new Response(JSON.stringify({ error: "ownerId e action são obrigatórios" }), { status: 400 });
    }

    let result: unknown;
    if (action === "get-sales-assistant") result = await handleGetSalesAssistant(ownerId);
    else if (action === "get-sales-playbook") result = await handleGetSalesPlaybook(ownerId);
    else return new Response(JSON.stringify({ error: `action desconhecida: ${action}` }), { status: 400 });

    return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
  } catch (e) {
    console.error("[crm-insights]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
