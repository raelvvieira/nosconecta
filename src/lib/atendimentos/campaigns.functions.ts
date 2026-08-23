import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";

/**
 * O que sobrou do módulo de campanhas.
 *
 * Este arquivo já teve o CRUD inteiro do motor de campanhas do CRM — criar,
 * listar, executar, estimar destinatários, mover contatos de etapa depois do
 * envio. Aquele motor **nunca enviou nada**: o time do CRM confirmou em 18/08
 * olhando o próprio banco (5 campanhas criadas, 0 executadas), porque o
 * servidor que ele exige não está implantado. Código que não tem como rodar é
 * o que faz a próxima auditoria custar caro, então saiu — o git guarda, se um
 * dia o cenário mudar.
 *
 * Ficaram as duas coisas que servem ao caminho que entrega de verdade (o
 * disparo por seleção de contatos): os modelos de mensagem, usados no chat e
 * na revisão de disparo, e a cota diária, que é o mesmo contador debitado
 * pelos disparos e pelas automações.
 */

export interface MessageTemplate {
  id: string;
  name: string;
  content: string;
}

export interface DailyUsage {
  limit: number;
  usedToday: number;
}

async function callTemplates(body: unknown) {
  return callEdgeFunction("crm-templates", body);
}
async function callCampaigns(body: unknown) {
  return callEdgeFunction("crm-campaigns", body);
}

async function callEdgeFunction(name: string, body: unknown) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");
  const res = await fetch(`${url}/functions/v1/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `Falha ao chamar ${name} (${res.status})`);
  return json;
}

function mapTemplate(row: any): MessageTemplate {
  return { id: String(row?.id), name: row?.name ?? "Sem nome", content: row?.content ?? "" };
}

export const getMessageTemplates = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<MessageTemplate[]> => {
    const json = await callTemplates({ ownerId: context.ownerId, action: "list" });
    return (json.templates ?? []).map(mapTemplate);
  });

export const saveMessageTemplate = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { id?: string; name: string; content: string; mediaUrl?: string }) => {
    // Mesma regra que já vale pro disparo por seleção (criarDisparo) — texto
    // ou imagem, nunca os dois vazios. A tela já trava isto antes de chegar
    // aqui; isto é rede de segurança para quem bater direto no endpoint.
    if (!input.content?.trim() && !input.mediaUrl) {
      throw new Error("A mensagem precisa ter texto ou imagem.");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const json = await callTemplates({ ownerId: context.ownerId, action: "save", template: data });
    return { ok: true, template: json.template ? mapTemplate(json.template) : null };
  });

/**
 * Cota diária de disparo.
 *
 * O mesmo contador é debitado pelo disparo por seleção e pelas automações —
 * é por isso que a tela de Campanhas e o card de prontidão do editor de
 * automações mostram sempre o mesmo número.
 */
export const getDailySendUsage = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<DailyUsage> => {
    const json = await callCampaigns({ ownerId: context.ownerId, action: "get-usage" });
    return json.usage ?? { limit: 200, usedToday: 0 };
  });

export const setDailySendLimit = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { limit: number }) => input)
  .handler(async ({ data, context }) => {
    await callCampaigns({ ownerId: context.ownerId, action: "set-limit", limit: data.limit });
    return { ok: true };
  });
