// Em que pé está um disparo, do ponto de vista de quem olha a tela.
//
// A tabela guarda só `running | done | cancelled`. Campanha agendada é uma
// campanha NORMAL com os horários no futuro — o status no banco continua
// `running`, porque o tick descarta qualquer alvo cujo lote não esteja assim.
// Então quem separa "programada para o dia 20" de "começa no próximo minuto"
// é esta conta, e errar aqui faz as duas aparecerem iguais por oito dias.
import { progressoDoDisparo, quandoPorExtenso } from "../src/lib/atendimentos/statusDoDisparo";
import type { BroadcastResumo } from "../src/lib/atendimentos/broadcast.types";

let feitas = 0;
function conferir(oQue: string, real: unknown, esperado: unknown) {
  feitas++;
  if (real !== esperado) {
    console.error(`FALHOU ${oQue}: esperava ${String(esperado)}, veio ${String(real)}`);
    process.exit(1);
  }
}

// Meio-dia de Brasília, para nenhuma conta de dia esbarrar na virada.
const AGORA = new Date("2026-10-12T15:00:00Z").getTime();
const HORA = 3_600_000;

const base: BroadcastResumo = {
  id: "b1",
  name: "Botox",
  message: "oi",
  status: "running",
  total: 196,
  enviados: 0,
  falhas: 0,
  pendentes: 196,
  createdAt: "2026-10-12T15:00:00Z",
  terminaEm: null,
  proximoEnvioEm: null,
  diasRestantes: 1,
};

// ── Agendada ────────────────────────────────────────────────────────────────

{
  const d = { ...base, proximoEnvioEm: new Date(AGORA + 8 * 24 * HORA).toISOString() };
  const p = progressoDoDisparo(d, AGORA);
  conferir("daqui a oito dias é agendada", p.estado, "agendado");
  conferir("e diz a data", p.rotulo, "Agendada para 20/10 às 12:00");
  // Não vale consultar de novo a cada 5 segundos por oito dias.
  conferir("não fica em andamento", p.emAndamento, false);
}
conferir(
  "hoje mais tarde",
  progressoDoDisparo({ ...base, proximoEnvioEm: new Date(AGORA + 2 * HORA).toISOString() }, AGORA)
    .rotulo,
  "Agendada para hoje às 14:00",
);
conferir(
  "amanhã",
  progressoDoDisparo({ ...base, proximoEnvioEm: new Date(AGORA + 25 * HORA).toISOString() }, AGORA)
    .rotulo,
  "Agendada para amanhã às 13:00",
);

// ── Na fila: o horário já venceu, só o cron ainda não passou ────────────────
//
// É a diferença que importa: "já era para ter saído" não é "programada".

conferir(
  "horário no passado é fila, não agendamento",
  progressoDoDisparo({ ...base, proximoEnvioEm: new Date(AGORA - 60_000).toISOString() }, AGORA)
    .estado,
  "na_fila",
);
conferir(
  "sem próximo envio é fila",
  progressoDoDisparo({ ...base, proximoEnvioEm: null }, AGORA).estado,
  "na_fila",
);
conferir(
  "data inválida não vira agendamento",
  progressoDoDisparo({ ...base, proximoEnvioEm: "amanhã cedo" }, AGORA).estado,
  "na_fila",
);
// Já começou a sair: nunca mais é "agendada", mesmo que o resto esteja no
// futuro — e o resto SEMPRE está, porque a fila é espaçada.
conferir(
  "com um enviado já não é agendada",
  progressoDoDisparo(
    { ...base, enviados: 1, proximoEnvioEm: new Date(AGORA + 8 * 24 * HORA).toISOString() },
    AGORA,
  ).estado,
  "enviando",
);

// ── Dividida em dias ────────────────────────────────────────────────────────

conferir(
  "diz quando continua",
  progressoDoDisparo(
    {
      ...base,
      total: 500,
      enviados: 200,
      pendentes: 300,
      diasRestantes: 2,
      proximoEnvioEm: new Date(AGORA + 25 * HORA).toISOString(),
    },
    AGORA,
  ).rotulo,
  "Enviando · continua amanhã às 13:00",
);
conferir(
  "um dia só não ganha a frase",
  progressoDoDisparo({ ...base, enviados: 5, diasRestantes: 1 }, AGORA).rotulo,
  "Enviando",
);

// ── O que já era ────────────────────────────────────────────────────────────
//
// Concluído e cancelado mandam antes de qualquer conta de horário: um lote
// cancelado com alvos marcados para o futuro não é "agendado".

conferir(
  "cancelado manda",
  progressoDoDisparo(
    { ...base, status: "cancelled", proximoEnvioEm: new Date(AGORA + 24 * HORA).toISOString() },
    AGORA,
  ).estado,
  "cancelado",
);
conferir(
  "concluído manda",
  progressoDoDisparo({ ...base, status: "done", enviados: 196, pendentes: 0 }, AGORA).estado,
  "concluido",
);
conferir(
  "concluído com falhas",
  progressoDoDisparo({ ...base, status: "done", enviados: 194, falhas: 2, pendentes: 0 }, AGORA)
    .estado,
  "concluido_com_falhas",
);

// ── O texto da data ─────────────────────────────────────────────────────────

conferir("hoje", quandoPorExtenso(new Date(AGORA + HORA), new Date(AGORA)), "hoje às 13:00");
conferir(
  "amanhã",
  quandoPorExtenso(new Date(AGORA + 25 * HORA), new Date(AGORA)),
  "amanhã às 13:00",
);
conferir(
  "outro dia leva a data",
  quandoPorExtenso(new Date(AGORA + 8 * 24 * HORA), new Date(AGORA)),
  "20/10 às 12:00",
);
// 23h de Brasília é o dia seguinte em UTC: contar o dia pela string ISO diria
// "amanhã" para algo que é hoje à noite.
conferir(
  "23h de hoje ainda é hoje",
  quandoPorExtenso(new Date("2026-10-13T02:00:00Z"), new Date("2026-10-12T15:00:00Z")),
  "hoje às 23:00",
);

console.log(`ok — ${feitas} checagens do status do disparo`);
