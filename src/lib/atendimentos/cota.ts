// Onde começa o dia da cota de envio.
//
// ── Por que isto não é `new Date().setHours(0,0,0,0)` ────────────────────
//
// O servidor roda em UTC, e a meia-noite de lá são 21h de Brasília. Com o
// corte errado, o limite diário valia numa janela 21h→21h: a mensagem enviada
// às 22h já contava para o dia seguinte e o contador da tela zerava três horas
// antes da virada. Não dá erro nenhum — só um número que não bate com o dia.
//
// ── Por que existe dos dois lados ────────────────────────────────────────
//
// A mesma conta vive em `supabase/functions/_shared/daily-quota.ts`, que roda
// em Deno. Deno e `src/` não se importam entre si, e as duas precisam
// responder a MESMA coisa: a tela mostra o número, e a Edge Function decide se
// o envio sai. Divergindo, a tela diria que ainda há cota e o envio recusaria.
// É cópia consciente, do mesmo jeito que `lista-paginada.ts` já é.

/**
 * O relógio da clínica.
 *
 * Declarado, nunca deduzido do runtime — mesma família da janela de horário
 * das automações e de `clinicTodayStr` em `src/lib/date.ts`.
 */
const fmtRelogioClinica = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  hour12: false,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Meia-noite de HOJE no fuso da clínica, como instante UTC. */
export function inicioDoDiaDaClinica(agora: Date = new Date()): Date {
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
