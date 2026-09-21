// Checagens de onde começa o dia da cota de envio.
//
// O erro aqui não levanta exceção: devolve um número. A tela diz que ainda
// sobrou cota, o envio recusa — ou o contrário, e o número da clínica manda
// mais mensagem num dia do que ela escolheu.
//
// As duas cópias da conta (aqui e em `_shared/daily-quota.ts`, que roda em
// Deno) precisam responder igual. Esta suíte exercita a de `src/`; se um dia
// elas divergirem, é aqui que se vê primeiro.
import { inicioDoDiaDaClinica } from "../src/lib/atendimentos/cota.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

const iso = (d: Date) => d.toISOString();

// ── O caso que motivou a conta ───────────────────────────────────────────
// 22h de Brasília do dia 10 são 01h UTC do dia 11. Cortar o dia pela
// meia-noite do SERVIDOR jogaria esta mensagem no dia 11, e o contador da
// clínica zeraria às 21h.
conferir(
  "22h de Brasília ainda é o dia de hoje na clínica",
  iso(inicioDoDiaDaClinica(new Date("2026-09-11T01:00:00Z"))),
  "2026-09-10T03:00:00.000Z",
);

// Meia-noite e um minuto da clínica: o dia acabou de virar.
conferir(
  "logo depois da virada",
  iso(inicioDoDiaDaClinica(new Date("2026-09-11T03:01:00Z"))),
  "2026-09-11T03:00:00.000Z",
);

// Um minuto ANTES da virada ainda é o dia anterior.
conferir(
  "logo antes da virada",
  iso(inicioDoDiaDaClinica(new Date("2026-09-11T02:59:00Z"))),
  "2026-09-10T03:00:00.000Z",
);

// Meia-noite exata da clínica: o corte é o próprio instante. É o caso em que
// `hour12:false` devolve "24" em alguns runtimes — sem a normalização, isto
// voltaria um dia inteiro e a cota de ontem contaria como a de hoje.
conferir(
  "meia-noite em ponto",
  iso(inicioDoDiaDaClinica(new Date("2026-09-11T03:00:00Z"))),
  "2026-09-11T03:00:00.000Z",
);

// Meio-dia da clínica.
conferir(
  "meio-dia",
  iso(inicioDoDiaDaClinica(new Date("2026-09-11T15:00:00Z"))),
  "2026-09-11T03:00:00.000Z",
);

// ── O corte nunca fica no futuro, nem a mais de um dia atrás ─────────────
// Vale para qualquer instante: é o que garante que a soma do dia não pegue
// envio de ontem nem perca o de hoje.
{
  let forteDemais = 0;
  let fracoDemais = 0;
  const umDia = 24 * 60 * 60 * 1000;
  for (let h = 0; h < 48; h++) {
    const agora = new Date(Date.UTC(2026, 8, 11, h, 37, 13));
    const corte = inicioDoDiaDaClinica(agora);
    if (corte.getTime() > agora.getTime()) forteDemais++;
    if (agora.getTime() - corte.getTime() >= umDia) fracoDemais++;
  }
  conferir("o corte nunca fica no futuro", forteDemais, 0);
  conferir("nem a um dia inteiro de distância", fracoDemais, 0);
}

// ── A virada do mês e do ano ─────────────────────────────────────────────
conferir(
  "primeiro do mês, de madrugada na clínica",
  iso(inicioDoDiaDaClinica(new Date("2026-10-01T04:00:00Z"))),
  "2026-10-01T03:00:00.000Z",
);
// 21h do dia 31/12 em Brasília é 00h de 1º/01 em UTC — o ano já virou lá fora
// e não aqui.
conferir(
  "réveillon: o ano ainda não virou na clínica",
  iso(inicioDoDiaDaClinica(new Date("2027-01-01T00:00:00Z"))),
  "2026-12-31T03:00:00.000Z",
);

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens do dia da cota`);
