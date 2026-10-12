// Cota diária de envio de WhatsApp da clínica.
//
// A MESMA conta vive em `src/lib/atendimentos/cota.ts`, que a tela usa. Deno e
// `src/` não se importam entre si, e as duas precisam responder igual: a tela
// mostra o número e esta aqui decide se o envio sai. Divergindo, a tela diria
// que ainda há cota e o envio recusaria.
//
// Extraída de `whatsapp-broadcast/index.ts` (onde nasceu) porque as
// automações também precisam respeitá-la: o WhatsApp é um só, e dois
// contadores separados deixariam o número exposto ao dobro do que a clínica
// escolheu como limite — exatamente o que o comentário do disparo já dizia.
//
// `supabase` é parâmetro explícito, nunca client de módulo por closure, pelo
// mesmo motivo de `_shared/whatsapp-send.ts`: este arquivo é importado por
// mais de uma function, e cada uma tem o seu.

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

/**
 * O começo e o fim de um dia da clínica, como instantes.
 *
 * ── Por que não `new Date(dia + "T00:00:00-03:00")` ──────────────────────
 *
 * Cravar o deslocamento é o que quebra calado se o horário de verão voltar. O
 * Brasil não tem hoje, mas é decisão política e o código não deveria depender
 * dela. Aqui o offset nunca aparece: meio-dia UTC cai com folga dentro do dia
 * em qualquer deslocamento brasileiro, e de lá `inicioDoDiaDaClinica` encontra
 * a meia-noite consultando o relógio do fuso.
 *
 * O fim é o COMEÇO DO DIA SEGUINTE, e a comparação de quem usa é `<`, não
 * `<=`: assim um envio às 23:59:59.999 entra e o primeiro instante do dia
 * seguinte não. Somar 24 horas erraria num dia de 23 ou 25.
 */
export function janelaDoDiaDaClinica(dia: string): { de: Date; ate: Date } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dia ?? "").trim());
  if (!m) return null;
  const meioDia = new Date(`${dia}T12:00:00Z`);
  if (Number.isNaN(meioDia.getTime())) return null;
  const de = inicioDoDiaDaClinica(meioDia);
  // 36 horas à frente é meio-dia do dia seguinte em qualquer offset brasileiro.
  const ate = inicioDoDiaDaClinica(new Date(meioDia.getTime() + 36 * 3600 * 1000));
  return { de, ate };
}

/** O dia da clínica, "AAAA-MM-DD", para um instante. */
export function diaDaClinica(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

export async function getDailyUsage(
  supabase: any,
  ownerId: string,
  /**
   * De qual dia. Ausente = hoje.
   *
   * Existe porque campanha programada reserva a cota do dia em que VAI sair,
   * não do dia em que foi criada. Sem isto, deixar o mês inteiro programado
   * gastaria a cota de hoje quatro vezes e a segunda campanha seria recusada.
   */
  dia?: string,
): Promise<{ limit: number; usedToday: number }> {
  // O limite morava numa coluna de `crm_credentials` — a tabela das credenciais
  // do CRM, que vai ser apagada. Ele nunca teve a ver com credencial nenhuma:
  // é uma decisão da clínica sobre o próprio número de WhatsApp.
  const { data: ajuste } = await supabase
    .from("whatsapp_send_settings")
    .select("daily_send_limit")
    .eq("owner_id", ownerId)
    .maybeSingle();
  const limit = ajuste?.daily_send_limit ?? 200;
  const janela = dia ? janelaDoDiaDaClinica(dia) : null;
  const de = janela?.de ?? inicioDoDiaDaClinica();
  // ── O teto, que faltava ──────────────────────────────────────────────
  //
  // A consulta era só `gte(início do dia)`, sem fim. Enquanto nada era
  // marcado para o futuro isso não aparecia; com campanha programada, a
  // reserva do dia 20 entraria na conta de hoje e o limite de hoje pareceria
  // estourado sem nada ter sido enviado.
  const ate = janela?.ate ?? janelaDoDiaDaClinica(diaDaClinica())?.ate ?? null;
  let q = supabase
    .from("crm_campaign_sends")
    .select("recipient_count")
    .eq("owner_id", ownerId)
    .gte("executed_at", de.toISOString());
  if (ate) q = q.lt("executed_at", ate.toISOString());
  const { data: sends } = await q;
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
  /** Em que dia a cota é consumida, "AAAA-MM-DD". Ausente = agora.
   *
   *  Uma leva marcada para o dia 21 precisa debitar o dia 21: é isso que faz
   *  a divisão em dias funcionar e que impede a campanha seguinte de ocupar
   *  um dia que já está cheio. Grava meio-dia do dia, que cai dentro da
   *  janela em qualquer deslocamento. */
  dia?: string,
): Promise<void> {
  await supabase.from("crm_campaign_sends").insert({
    owner_id: ownerId,
    campaign_id: campaignId,
    recipient_count: quantidade,
    ...(dia ? { executed_at: new Date(`${dia}T12:00:00Z`).toISOString() } : {}),
  });
}
