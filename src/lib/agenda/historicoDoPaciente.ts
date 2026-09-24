// O histórico de consultas de uma pessoa: o que já foi, o que vem, e o resumo.
//
// ── Por que isto existe ────────────────────────────────────────────────
//
// "Quando eu vi essa pessoa pela última vez?" é a primeira pergunta de quem
// abre um agendamento. Hoje o sistema não responde: `getPatientDetail` devolve
// `nextAppointment: null` e `lastAppointment: null` **fixos no código**, então
// o card Agenda do painel do chat está vazio desde que foi escrito.
//
// A conta é a mesma nos dois lugares que precisam dela — a agenda, que já tem
// todos os agendamentos na memória, e a ficha, que lê do banco. Por isso mora
// aqui, pura: duas implementações divergiriam no que conta como "aconteceu", e
// aí a mesma pessoa teria duas últimas consultas diferentes em duas telas.
//
// ── Por que a comparação é de TEXTO ────────────────────────────────────
//
// `date` e `start_time` são colunas separadas. Juntá-las num `Date` obriga a
// escolher um fuso duas vezes: o do Worker, que roda em UTC, e o do navegador
// de quem abriu. É o erro que este projeto já pagou — ver o comentário no topo
// de `src/lib/date.ts`.
//
// Como os dois campos são zero-padded, `"2026-09-05T09:00"` é menor que
// `"2026-09-12T08:00"` comparando como texto puro, sem fuso no meio.

import type { AppointmentStatus } from "@/components/agenda/types";

/**
 * Uma consulta, como as duas fontes a entregam.
 *
 * O tipo é estrutural de propósito: o `Appointment` da agenda já o satisfaz
 * sem adaptação nenhuma, e a linha crua de `appointments` vira isto com um
 * map de nove campos.
 */
export interface ConsultaDoHistorico {
  id: string;
  patientId?: string | null;
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:MM" ou "HH:MM:SS" — normalizado aqui dentro. */
  startTime: string;
  status: AppointmentStatus;
  /** Já vem como resumo: "Limpeza + Restauração". */
  procedureName: string;
  professionalName: string;
  expectedRevenue: number;
  actualRevenue?: number | null;
}

export interface ContagemDoHistorico {
  realizadas: number;
  faltas: number;
  canceladas: number;
  futuras: number;
}

export interface HistoricoDoPaciente {
  proxima: ConsultaDoHistorico | null;
  ultima: ConsultaDoHistorico | null;
  /** Da mais recente para a mais antiga, com as futuras no topo. */
  historico: ConsultaDoHistorico[];
  contagem: ContagemDoHistorico;
  /** Soma do que foi de fato cobrado nas realizadas. */
  totalRealizado: number;
}

/**
 * O que conta como "eu vi essa pessoa".
 *
 * `completed` sozinho não serve: a clínica raramente clica em "Concluir" — são
 * 24 agendamentos em `pending` contra 20 em `completed`, muitos deles no
 * passado. Restringir a `completed` deixaria o card vazio para quase todo
 * mundo, ou seja, reproduziria exatamente o defeito que este módulo conserta.
 */
export const ACONTECEU: readonly AppointmentStatus[] = [
  "completed",
  "in_progress",
  "confirmed",
  "pending",
];

/**
 * O que NÃO conta.
 *
 * Falta e cancelamento ficam fora do destaque porque "última consulta" é lido
 * como *quando eu atendi essa pessoa*. Uma falta exibida ali faria a doutora
 * abrir a conversa achando que examinou alguém que não apareceu.
 *
 * Os dois continuam no `historico` e na `contagem` — "faltou duas vezes" é
 * informação valiosa, mas pertence à lista, não ao destaque.
 */
export const NAO_ACONTECEU: readonly AppointmentStatus[] = ["cancelled", "missed"];

/** "2026-09-24T14:30" — data e hora num texto que ordena certo. */
export function marcoDaConsulta(c: { date: string; startTime: string }): string {
  const hora = String(c.startTime ?? "").slice(0, 5);
  return `${c.date}T${hora}`;
}

/**
 * Separa o que já foi do que vem, para uma pessoa.
 *
 * `agora` entra como texto no mesmo formato (ver `clinicNowStamp` em
 * `src/lib/date.ts`) — é o que torna esta função pura e testável sem relógio.
 */
export function historicoDoPaciente(
  consultas: readonly ConsultaDoHistorico[],
  patientId: string | null | undefined,
  agora: string,
): HistoricoDoPaciente {
  const vazio: HistoricoDoPaciente = {
    proxima: null,
    ultima: null,
    historico: [],
    contagem: { realizadas: 0, faltas: 0, canceladas: 0, futuras: 0 },
    totalRealizado: 0,
  };

  // Sem ficha não há histórico — e é o caso de cinco agendamentos hoje. Filtrar
  // por `undefined` juntaria todos eles num histórico só, de gente diferente.
  const id = String(patientId ?? "").trim();
  if (!id) return vazio;

  const minhas = consultas.filter((c) => String(c.patientId ?? "") === id);
  if (!minhas.length) return vazio;

  // Da mais recente para a mais antiga. É a ordem de leitura de um histórico:
  // o que importa é o que acabou de acontecer.
  const ordenadas = [...minhas].sort((a, b) =>
    marcoDaConsulta(b).localeCompare(marcoDaConsulta(a)),
  );

  const contagem: ContagemDoHistorico = {
    realizadas: 0,
    faltas: 0,
    canceladas: 0,
    futuras: 0,
  };
  let totalRealizado = 0;
  let proxima: ConsultaDoHistorico | null = null;
  let ultima: ConsultaDoHistorico | null = null;

  for (const c of ordenadas) {
    const futura = marcoDaConsulta(c) >= agora;
    const cancelada = c.status === "cancelled";
    const faltou = c.status === "missed";

    if (cancelada) contagem.canceladas++;
    else if (faltou) contagem.faltas++;
    else if (futura) contagem.futuras++;
    else {
      contagem.realizadas++;
      // O PREVISTO não entra: ele é uma estimativa de quando o agendamento foi
      // criado. Somá-lo aqui faria "já pagou" mostrar dinheiro que ninguém
      // cobrou.
      totalRealizado += Number(c.actualRevenue ?? 0);
    }

    if (NAO_ACONTECEU.includes(c.status)) continue;

    // A lista vem em ordem decrescente: a ÚLTIMA futura que o laço vê é a mais
    // próxima de agora, e a PRIMEIRA passada é a mais recente.
    if (futura) proxima = c;
    else if (!ultima && ACONTECEU.includes(c.status)) ultima = c;
  }

  return { proxima, ultima, historico: ordenadas, contagem, totalRealizado };
}
