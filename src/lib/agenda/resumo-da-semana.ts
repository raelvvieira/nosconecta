// Os dois números da semana no topo da Agenda: quantos agendamentos NOVOS a
// recepção já registrou (com a meta) e quantos dos que já aconteceram
// compareceram. Puro: quem busca é a rota, que já tem os agendamentos.

/** O mínimo que a clínica pede da recepção: 5 novos por dia útil, 25 por semana. */
export const META_DIARIA = 5;
export const META_SEMANAL = 25;

/** Dia "AAAA-MM-DD" -> o mesmo dia somado de `n` dias, sem fuso no meio. */
function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = segunda … 6 = domingo. */
function indiceNaSemana(dia: string): number {
  return (new Date(`${dia}T12:00:00Z`).getUTCDay() + 6) % 7;
}

/** A semana (segunda a domingo) que contém `dia`. */
export function semanaDe(dia: string): { de: string; ate: string } {
  const de = somarDias(dia, -indiceNaSemana(dia));
  return { de, ate: somarDias(de, 6) };
}

const fmtClinica = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export interface AgendamentoDoResumo {
  date: string;
  endTime: string;
  status: string;
  /** Quando o agendamento foi registrado (ISO). */
  criadoEm?: string | null;
}

export interface NovosDaSemana {
  total: number;
  hoje: number;
  meta: number;
  metaDiaria: number;
  /** Quantos a recepção já deveria ter até o fim de hoje, no ritmo de 5 por dia útil. */
  esperadoAteHoje: number;
  atingida: boolean;
  noRitmo: boolean;
}

/** Agendamentos registrados (não cancelados) na semana de `hoje`. */
export function novosNaSemana(agendamentos: AgendamentoDoResumo[], hoje: string): NovosDaSemana {
  const { de, ate } = semanaDe(hoje);
  let total = 0;
  let doDia = 0;
  for (const a of agendamentos) {
    if (!a.criadoEm || a.status === "cancelled") continue;
    const dia = fmtClinica.format(new Date(a.criadoEm));
    if (dia < de || dia > ate) continue;
    total++;
    if (dia === hoje) doDia++;
  }
  const diasUteis = Math.min(indiceNaSemana(hoje) + 1, 5);
  const esperadoAteHoje = META_DIARIA * diasUteis;
  return {
    total,
    hoje: doDia,
    meta: META_SEMANAL,
    metaDiaria: META_DIARIA,
    esperadoAteHoje,
    atingida: total >= META_SEMANAL,
    noRitmo: total >= esperadoAteHoje,
  };
}

export interface Comparecimento {
  compareceram: number;
  faltaram: number;
  /** Já passaram do horário e ninguém marcou se foi ou faltou. */
  semBaixa: number;
  /** Em %. Nulo sem nenhum atendimento com resultado. */
  pct: number | null;
}

/**
 * Dos agendamentos da semana que já passaram do horário, quantos
 * compareceram (concluídos) contra quantos faltaram. Os que passaram e
 * continuam "confirmado"/"pendente" ficam de fora da taxa e aparecem à parte
 * como "sem baixa": contá-los como falta ou como presença seria chute.
 */
export function comparecimentoDaSemana(
  agendamentos: AgendamentoDoResumo[],
  hoje: string,
  agoraHHMM: string,
): Comparecimento {
  const { de, ate } = semanaDe(hoje);
  let compareceram = 0;
  let faltaram = 0;
  let semBaixa = 0;
  for (const a of agendamentos) {
    if (a.date < de || a.date > ate || a.status === "cancelled") continue;
    const passou = a.date < hoje || (a.date === hoje && a.endTime <= agoraHHMM);
    if (a.status === "completed") compareceram++;
    else if (a.status === "missed") faltaram++;
    else if (passou) semBaixa++;
  }
  const base = compareceram + faltaram;
  return { compareceram, faltaram, semBaixa, pct: base ? (compareceram / base) * 100 : null };
}

const fmtHora = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Os dois números juntos, para o relógio da clínica no instante `agora`. */
export function resumoDaSemana(agendamentos: AgendamentoDoResumo[], agora = new Date()) {
  const hoje = fmtClinica.format(agora);
  return {
    novos: novosNaSemana(agendamentos, hoje),
    comparecimento: comparecimentoDaSemana(agendamentos, hoje, fmtHora.format(agora)),
  };
}
