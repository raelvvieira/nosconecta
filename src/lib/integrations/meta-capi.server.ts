// Server-only: dispara a avaliação dos gatilhos da Conversions API usando o
// service role key. Precisa ser importado dinamicamente de dentro de um
// handler (nunca no topo do módulo) a partir de *.functions.ts, já que esses
// arquivos vão para o bundle do cliente — mesma regra de
// src/lib/agenda/notifications.server.ts.

export interface MetaCapiDispatchContext {
  /**
   * Id estável do registro que converteu (transação, agendamento, paciente,
   * card do funil). Compõe o `event_id` mandado à Meta, que é o que permite
   * reenviar o mesmo evento sem a conversão ser contada duas vezes.
   */
  entityId?: string | null;
  /** Paciente local — de onde saem nome/e-mail/telefone para o hash. */
  patientId?: string | null;
  /** Contato do CRM externo; resolvido via patients.crm_contact_id. */
  crmContactId?: string | null;
  /** Nome solto, quando não há paciente correspondente (ex.: card do funil). */
  contactName?: string | null;
  /** Condição do gatilho: etapa de destino no funil. */
  stageId?: string | null;
  /** Condição do gatilho: novo status do agendamento. */
  status?: string | null;
  /** Condição do gatilho: negociação marcada como ganha/perdida. */
  dealStatus?: string | null;
  /** Valor usado quando o gatilho está configurado como "valor do evento". */
  amount?: number | null;
}

export async function dispatchMetaCapiEvent(
  ownerId: string,
  systemEvent: string,
  context: MetaCapiDispatchContext = {},
): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("[meta-capi] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes; evento não enviado.");
    return;
  }
  // Aguardado (não fire-and-forget): no Cloudflare Workers uma promise ainda
  // pendente quando a resposta é enviada é cancelada. Mas o erro é engolido —
  // uma indisponibilidade da Meta nunca pode derrubar a gravação do negócio
  // que originou o evento.
  try {
    await fetch(`${url}/functions/v1/meta-capi`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ ownerId, action: "dispatch", systemEvent, context }),
    });
  } catch (e) {
    console.error("[meta-capi] falha ao disparar evento:", e);
  }
}
