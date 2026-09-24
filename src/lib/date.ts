// Datas em "YYYY-MM-DD", que é como a agenda e o financeiro guardam tudo.
//
// O `T00:00:00` no construtor é o que impede a data de andar um dia: sem ele o
// JS interpreta "2026-08-10" como UTC e, em fuso negativo como o do Brasil,
// devolve o dia anterior.

/** "YYYY-MM-DD" no fuso de quem está usando o sistema.
 *
 *  `toISOString()` é UTC: aplicado a um `Date` de fim de dia local (23:59), em
 *  UTC-3 ele devolve o dia SEGUINTE, e a janela do dashboard passa a incluir
 *  um dia que ninguém pediu. Formatar a partir dos componentes locais é a
 *  única forma de não depender do horário em que a página foi aberta. */
export function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" no fuso da clínica, para código que roda no SERVIDOR.
 *
 *  `localDateStr` usa o fuso de quem executa — o que é certo no navegador da
 *  recepcionista e errado no Worker, que roda em UTC. Ali "hoje" adianta um dia
 *  às 21:00 de Brasília, e isso não é teórico: é o que decide se um
 *  recebimento vence hoje ou já está atrasado.
 *
 *  `en-CA` porque é o locale cujo formato de data já é YYYY-MM-DD — mesma
 *  técnica usada na Edge Function de automações, que precisa da mesma resposta
 *  em outro runtime. */
const fmtDataClinica = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function clinicTodayStr(d: Date = new Date()): string {
  return fmtDataClinica.format(d);
}

/**
 * "YYYY-MM-DDTHH:MM" no fuso da clínica — data e hora juntas, para COMPARAR.
 *
 * ── Por que texto, e não um `Date` ──────────────────────────────────────
 *
 * Na agenda, `date` e `start_time` são colunas separadas. Para saber se uma
 * consulta já passou é preciso juntar as duas — e montar um `Date` a partir
 * delas obriga a escolher um fuso duas vezes: o do Worker (UTC) e o do
 * navegador de quem abriu. É exatamente o erro que o comentário no topo deste
 * arquivo descreve.
 *
 * Como os dois campos são zero-padded, `"2026-09-05T09:00" < "2026-09-12T08:00"`
 * compara certo como texto puro, sem fuso nenhum no meio.
 *
 * `hourCycle: "h23"` não é detalhe: com `hour12: false` sozinho, alguns ICU
 * devolvem "24" para a meia-noite. Um "2026-09-24T24:10" ordena depois de
 * tudo do dia seguinte, e a consulta da madrugada sumiria da lista — um bug
 * que só aparece uma hora por dia.
 */
const fmtMarcoDaClinica = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function clinicNowStamp(d: Date = new Date()): string {
  const p: Record<string, string> = {};
  for (const parte of fmtMarcoDaClinica.formatToParts(d)) p[parte.type] = parte.value;
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/**
 * Uma data ISO para ler, em pt-BR.
 *
 * Mesma razão do `T00:00:00` explicada no topo: sem ele a data volta um dia.
 */
export function diaParaLer(iso: string): string {
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-BR");
}

/** Soma meses preservando o dia; 31/01 + 1 mês cai em 03/03 nos anos comuns,
 *  que é o comportamento nativo do Date e o mesmo já usado no financeiro. */
export function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  // `localDateStr` e não `toISOString`: a data foi construída à meia-noite
  // LOCAL, e converter para UTC devolve o dia anterior em qualquer fuso
  // positivo. No Brasil dava certo por sorte — a meia-noite local vira 03:00Z
  // do mesmo dia —, o que é exatamente o tipo de acerto que some quando
  // alguém abre o sistema de outro fuso.
  return localDateStr(d);
}

/** "09:00" → 540 */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** 540 → "09:00". Passa da meia-noite? Prende em 23:59 em vez de virar "25:30". */
export function minutesToTime(total: number): string {
  const capped = Math.max(0, Math.min(total, 23 * 60 + 59));
  const h = Math.floor(capped / 60);
  const m = capped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Fim de um evento a partir do início e da duração em minutos. */
export function endTimeFrom(startTime: string, durationMin: number): string {
  return minutesToTime(timeToMinutes(startTime) + Math.max(1, durationMin));
}

/** Duração implícita entre dois horários, para telas que ainda guardam fim. */
export function durationBetween(startTime: string, endTime: string): number {
  return Math.max(1, timeToMinutes(endTime) - timeToMinutes(startTime));
}

/** Duas faixas do mesmo dia se sobrepõem? Fim exclusivo: 09:00–10:00 e
 *  10:00–11:00 não colidem. */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return timeToMinutes(aStart) < timeToMinutes(bEnd) && timeToMinutes(bStart) < timeToMinutes(aEnd);
}
