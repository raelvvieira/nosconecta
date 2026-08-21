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

/** Meia-noite de HOJE no fuso da clínica, em UTC.
 *
 *  Era `new Date(); setHours(0,0,0,0)`. Edge Function roda em UTC, então isso
 *  dava meia-noite UTC — 21:00 de Brasília do dia anterior. Na prática o limite
 *  diário valia numa janela 21h→21h: mensagem enviada às 22h já contava para o
 *  dia seguinte, e o contador da tela zerava três horas antes da virada.
 *
 *  Mesma família da janela de horário das automações e de `clinicTodayStr` em
 *  src/lib/date.ts: o fuso é declarado, nunca deduzido do runtime. */
const fmtRelogioClinica = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  hour12: false,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function inicioDoDiaDaClinica(agora = new Date()): Date {
  // Subtrai do instante atual quanto já se passou do dia NO RELÓGIO da clínica.
  //
  // Escrito assim, e não montando a string "YYYY-MM-DDT00:00:00-03:00", porque
  // cravar o deslocamento é o que quebra em silêncio se o horário de verão
  // voltar: o Brasil não tem hoje, mas a decisão é política e o código não
  // deveria depender dela. Aqui o offset nunca aparece — o relógio do fuso é
  // consultado e a conta sai sozinha.
  const p = Object.fromEntries(
    fmtRelogioClinica.formatToParts(agora).map((x) => [x.type, x.value]),
  );
  // hour12:false devolve "24" à meia-noite em alguns runtimes; normalizar
  // evita voltar um dia inteiro por causa disso.
  const hora = Number(p.hour) % 24;
  const decorrido = (hora * 3600 + Number(p.minute) * 60 + Number(p.second)) * 1000;
  return new Date(agora.getTime() - decorrido);
}

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
  const startOfDay = inicioDoDiaDaClinica();
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
