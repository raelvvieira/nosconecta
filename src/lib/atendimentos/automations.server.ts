// Server-only: dispara a avaliação das automações personalizadas usando o
// service role key. Precisa ser importado dinamicamente de dentro de um
// handler (nunca no topo do módulo) a partir de *.functions.ts — mesma regra
// de src/lib/integrations/meta-capi.server.ts, de onde este arquivo é irmão:
// os mesmos 6 pontos que despacham pra Meta CAPI também despacham pra cá,
// mas cada chamada é independente (uma falhar nunca afeta a outra, e nenhuma
// das duas pode derrubar a operação de negócio que originou o evento).

export interface AutomationDispatchContext {
  /** Id estável do registro que originou o evento (mesmo papel de
   *  MetaCapiDispatchContext.entityId — pode ser composto, ex. "itemId:status"). */
  entityId?: string | null;
  /** Id "limpo" do card do funil, quando o evento tem um — usado pela ação
   *  "mover para etapa", que precisa de um id direto, não composto. */
  itemId?: string | null;
  patientId?: string | null;
  crmContactId?: string | null;
  contactName?: string | null;
  stageId?: string | null;
  status?: string | null;
  dealStatus?: string | null;
  amount?: number | null;
}

/**
 * `depth` existe pro dia em que uma ação de automação voltar a disparar um
 * SYSTEM_EVENT — hoje NENHUMA faz isso (a ação de mover etapa chama a Edge
 * Function `crm-pipeline` direto, justamente pra não re-disparar o evento),
 * então ele é sempre 0 e o teto no executor nunca é atingido. Ou seja: não é
 * ele que impede loop hoje. Quem impede é (a) essa escolha de furar o server
 * function e (b) as recusas no validador de `saveAutomation`. Mantido pra
 * quando a cadeia existir de verdade — mas não conte com ele.
 */
export async function dispatchAutomationEvent(
  ownerId: string,
  systemEvent: string,
  context: AutomationDispatchContext = {},
  depth = 0,
): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("[automations] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes; evento não avaliado.");
    return;
  }
  // Aguardado (não fire-and-forget) pelo mesmo motivo de dispatchMetaCapiEvent:
  // no Cloudflare Workers uma promise ainda pendente quando a resposta é
  // enviada é cancelada. Erro sempre engolido — automação fora do ar nunca
  // pode quebrar o cadastro/agendamento/negociação que a originou.
  try {
    await fetch(`${url}/functions/v1/atendimento-automations`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ ownerId, action: "dispatch", systemEvent, context, depth }),
    });
  } catch (e) {
    console.error("[automations] falha ao disparar evento:", e);
  }
}
