// Checagens do histórico de consultas de um paciente.
//
// O que está em jogo: este é o texto que a doutora lê no segundo antes de
// atender. "Última consulta: 12/08, limpeza" muda como ela abre a conversa.
//
// Os três modos de errar, todos silenciosos:
//
//   **Misturar gente.** Filtrar mal por paciente junta o histórico de duas
//   pessoas. Cinco agendamentos na base não têm ficha — se `undefined` casasse
//   com `undefined`, todos eles virariam o histórico de um paciente só.
//
//   **Chamar de "atendida" quem faltou.** Uma falta exibida como última
//   consulta faz a doutora abrir a conversa achando que examinou alguém que
//   não apareceu.
//
//   **Comparar só a data.** Duas consultas no mesmo dia, uma de manhã e uma à
//   tarde: sem a hora, as duas são "hoje" e a próxima vira a que já passou.
import {
  ACONTECEU,
  NAO_ACONTECEU,
  historicoDoPaciente,
  marcoDaConsulta,
  type ConsultaDoHistorico,
} from "../src/lib/agenda/historicoDoPaciente.ts";
import { clinicNowStamp } from "../src/lib/date.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

const AGORA = "2026-09-24T14:30";
const ANA = "paciente-ana";

function consulta(p: Partial<ConsultaDoHistorico> & { id: string }): ConsultaDoHistorico {
  return {
    id: p.id,
    patientId: p.patientId === undefined ? ANA : p.patientId,
    date: p.date ?? "2026-09-01",
    startTime: p.startTime ?? "10:00",
    status: p.status ?? "completed",
    procedureName: p.procedureName ?? "Limpeza",
    professionalName: p.professionalName ?? "Dra. Mariane",
    expectedRevenue: p.expectedRevenue ?? 200,
    actualRevenue: p.actualRevenue === undefined ? 200 : p.actualRevenue,
  };
}
const idDe = (c: { id: string } | null) => c?.id ?? null;

// ── Sem ficha, sem histórico ─────────────────────────────────────────────
// São 5 agendamentos assim na base hoje.
{
  const r = historicoDoPaciente([consulta({ id: "a", patientId: null })], null, AGORA);
  conferir("sem patientId devolve vazio", r.historico.length, 0);
  conferir("e a contagem zera", r.contagem, {
    realizadas: 0,
    faltas: 0,
    canceladas: 0,
    futuras: 0,
  });
}
conferir(
  "patientId só com espaços também é vazio",
  historicoDoPaciente([consulta({ id: "a" })], "   ", AGORA).historico.length,
  0,
);
// O caso perigoso: dois agendamentos SEM ficha não podem virar o histórico um
// do outro.
conferir(
  "órfão não casa com órfão",
  historicoDoPaciente(
    [consulta({ id: "a", patientId: null }), consulta({ id: "b", patientId: undefined })],
    null,
    AGORA,
  ).historico.length,
  0,
);

// ── Histórico de outra pessoa nunca vaza ────────────────────────────────
conferir(
  "só as consultas dela",
  historicoDoPaciente(
    [consulta({ id: "dela" }), consulta({ id: "de-outro", patientId: "paciente-bruno" })],
    ANA,
    AGORA,
  ).historico.map((c) => c.id),
  ["dela"],
);

// ── A HORA importa, não só o dia ─────────────────────────────────────────
// Duas no mesmo dia de hoje: 09:00 já passou, 16:00 ainda vem.
{
  const r = historicoDoPaciente(
    [
      consulta({ id: "manha", date: "2026-09-24", startTime: "09:00" }),
      consulta({ id: "tarde", date: "2026-09-24", startTime: "16:00", status: "pending" }),
    ],
    ANA,
    AGORA,
  );
  conferir("a da manhã é a última", idDe(r.ultima), "manha");
  conferir("a da tarde é a próxima", idDe(r.proxima), "tarde");
}

// Marco exatamente igual a agora conta como PRÓXIMA, nunca como última: a
// consulta que começa neste minuto ainda não aconteceu.
{
  const r = historicoDoPaciente(
    [consulta({ id: "agora", date: "2026-09-24", startTime: "14:30", status: "confirmed" })],
    ANA,
    AGORA,
  );
  conferir("o marco igual a agora é próxima", idDe(r.proxima), "agora");
  conferir("e não é última", idDe(r.ultima), null);
}

// ── Falta e cancelamento não viram destaque ─────────────────────────────
{
  const r = historicoDoPaciente(
    [
      consulta({ id: "faltou", date: "2026-09-20", status: "missed" }),
      consulta({ id: "veio", date: "2026-09-10", status: "completed" }),
      consulta({ id: "cancelou", date: "2026-10-01", status: "cancelled" }),
      consulta({ id: "marcada", date: "2026-10-05", status: "pending" }),
    ],
    ANA,
    AGORA,
  );
  conferir("a falta não é a última consulta", idDe(r.ultima), "veio");
  conferir("o cancelado não é a próxima", idDe(r.proxima), "marcada");
  // Mas os dois continuam na lista — "faltou duas vezes" importa.
  conferir("tudo continua no histórico", r.historico.length, 4);
  conferir("e a contagem separa", r.contagem, {
    realizadas: 1,
    faltas: 1,
    canceladas: 1,
    futuras: 1,
  });
}

// ── Status que contam como atendimento ──────────────────────────────────
// A clínica quase não clica em "Concluir": são 24 em `pending` contra 20 em
// `completed`. Se só `completed` contasse, o card ficaria vazio para quase
// todo mundo — que é o bug que este módulo existe para consertar.
conferir(
  "consulta antiga em pending conta como última",
  idDe(historicoDoPaciente([consulta({ id: "p", status: "pending" })], ANA, AGORA).ultima),
  "p",
);
conferir("pending está na lista do que aconteceu", ACONTECEU.includes("pending"), true);
conferir("completed também", ACONTECEU.includes("completed"), true);
conferir("cancelled não", ACONTECEU.includes("cancelled"), false);
conferir("e está na lista do que não aconteceu", NAO_ACONTECEU.includes("missed"), true);

// ── Ordenação ───────────────────────────────────────────────────────────
conferir(
  "da mais recente para a mais antiga",
  historicoDoPaciente(
    [
      consulta({ id: "meio", date: "2026-09-10" }),
      consulta({ id: "velha", date: "2026-08-01" }),
      consulta({ id: "nova", date: "2026-09-20" }),
    ],
    ANA,
    AGORA,
  ).historico.map((c) => c.id),
  ["nova", "meio", "velha"],
);
// Zero-padding: setembro/05 é ANTES de setembro/12, mesmo com hora maior.
conferir(
  "dia 5 vem antes do dia 12",
  marcoDaConsulta({ date: "2026-09-05", startTime: "09:00" }) <
    marcoDaConsulta({ date: "2026-09-12", startTime: "08:00" }),
  true,
);
// `start_time` do Postgres vem com segundos; o marco corta em HH:MM.
conferir(
  "hora com segundos normaliza",
  marcoDaConsulta({ date: "2026-09-24", startTime: "09:00:00" }),
  "2026-09-24T09:00",
);

// ── O dinheiro ──────────────────────────────────────────────────────────
// Só o que foi de fato cobrado. O previsto é estimativa da criação do
// agendamento — somá-lo mostraria dinheiro que ninguém recebeu.
{
  const r = historicoDoPaciente(
    [
      consulta({ id: "cobrou", date: "2026-09-10", expectedRevenue: 200, actualRevenue: 180 }),
      consulta({ id: "nao-cobrou", date: "2026-09-11", expectedRevenue: 500, actualRevenue: null }),
      consulta({ id: "futura", date: "2026-10-10", status: "pending", actualRevenue: null }),
    ],
    ANA,
    AGORA,
  );
  conferir("soma só o cobrado", r.totalRealizado, 180);
}

// ── O "agora" da clínica ────────────────────────────────────────────────
// 02:30 UTC de 1º de janeiro ainda é 31 de dezembro em Brasília. Sem isso, a
// virada do ano mostraria a consulta de hoje como sendo de ontem.
conferir(
  "o fuso da clínica manda",
  clinicNowStamp(new Date("2026-01-01T02:30:00Z")),
  "2025-12-31T23:30",
);
// Meia-noite precisa sair como 00, nunca 24: "T24:10" ordenaria depois de todo
// o dia seguinte e a consulta da madrugada sumiria.
conferir(
  "meia-noite é 00, não 24",
  clinicNowStamp(new Date("2026-06-15T03:10:00Z")).slice(11, 13),
  "00",
);

// ── Lista vazia ─────────────────────────────────────────────────────────
conferir("sem consulta nenhuma", historicoDoPaciente([], ANA, AGORA).proxima, null);

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens do histórico do paciente`);
