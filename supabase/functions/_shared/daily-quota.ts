// Cota diária de envio de WhatsApp da clínica.
//
// Extraída de `whatsapp-broadcast/index.ts` (onde nasceu) porque as
// automações também precisam respeitá-la: o WhatsApp é um só, e dois
// contadores separados deixariam o número exposto ao dobro do que a clínica
// escolheu como limite — exatamente o que o comentário do disparo já dizia.
//
// `supabase` é parâmetro explícito, nunca client de módulo por closure, pelo
// mesmo motivo de `_shared/crm-auth.ts` e `_shared/whatsapp-send.ts`: este
// arquivo é importado por mais de uma function, e cada uma tem o seu.

export async function getDailyUsage(
  supabase: any,
  ownerId: string,
): Promise<{ limit: number; usedToday: number }> {
  const { data: cred } = await supabase
    .from("crm_credentials")
    .select("daily_send_limit")
    .eq("owner_id", ownerId)
    .maybeSingle();
  const limit = cred?.daily_send_limit ?? 200;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { data: sends } = await supabase
    .from("crm_campaign_sends")
    .select("recipient_count")
    .eq("owner_id", ownerId)
    .gte("executed_at", startOfDay.toISOString());
  const usedToday = (sends ?? []).reduce((s: number, r: any) => s + (r.recipient_count ?? 0), 0);
  return { limit, usedToday };
}

/** Debita `quantidade` no mesmo ledger que campanhas e disparos usam.
 *  `campaignId` é a etiqueta de origem — "broadcast:<id>", "automation:<id>". */
export async function debitDailyUsage(
  supabase: any,
  ownerId: string,
  campaignId: string,
  quantidade: number,
): Promise<void> {
  await supabase
    .from("crm_campaign_sends")
    .insert({ owner_id: ownerId, campaign_id: campaignId, recipient_count: quantidade });
}
