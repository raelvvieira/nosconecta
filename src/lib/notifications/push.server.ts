// Server-only: dispara push para os aparelhos da clínica usando o service
// role key. Precisa ser importado dinamicamente de dentro de um handler
// (nunca no topo do módulo) a partir de *.functions.ts — esses arquivos vão
// para o bundle do cliente. Mesma regra de meta-capi.server.ts.

export type PushType =
  | "whatsapp_message"
  | "daily_agenda"
  | "appointment_reply"
  | "deal_result"
  | "automation";

export async function sendPushToOwner(
  ownerId: string,
  type: PushType,
  notification: { title: string; body: string; url?: string },
): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("[push] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes; push não enviado.");
    return;
  }
  // Aguardado (não fire-and-forget): no Cloudflare Workers uma promise ainda
  // pendente quando a resposta é enviada é cancelada. O erro é engolido —
  // push fora do ar jamais pode derrubar a operação que gerou o evento.
  try {
    await fetch(`${url}/functions/v1/push-send`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ ownerId, action: "send", type, ...notification }),
    });
  } catch (e) {
    console.error("[push] falha ao enviar:", e);
  }
}
