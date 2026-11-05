// Os dois números do topo da Agenda: quantos agendamentos NOVOS a recepção já
// registrou no mês (contra a meta) e como a agenda se comporta — quem veio, quem
// faltou, quem cancelou e quem remarcou. Puro: quem busca é a rota.

/** O mínimo que a clínica pede da recepção: 5 novos por dia útil. */
export const META_DIARIA = 5;

const fmtClinica = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const fmtHora = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const diaDaClinica = (iso: string | Date) => fmtClinica.format(new Date(iso));

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

/** Primeiro e último dia do mês de `dia`. */
export function mesDe(dia: string): { de: string; ate: string } {
  const [a, m] = dia.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { de: `${a}-${mm}-01`, ate: `${a}-${mm}-${String(ultimo).padStart(2, "0")}` };
}

/** Dias úteis (segunda a sexta) entre duas datas, inclusive. Feriado não entra
 *  na conta: a clínica ajusta a meta do mês quando for o caso. */
export function diasUteisEntre(de: string, ate: string): number {
  let n = 0;
  for (let d = de; d <= ate; d = somarDias(d, 1)) if (indiceNaSemana(d) < 5) n++;
  return n;
}

export interface AgendamentoDoResumo {
  date: string;
  endTime: string;
  status: string;
  /** Quando o agendamento foi registrado (ISO). */
  criadoEm?: string | null;
  /** Última alteração (ISO) — num cancelado, é quando cancelou. */
  atualizadoEm?: string | null;
}

export interface NovosDoMes {
  total: number;
  hoje: number;
  /** Da semana de hoje (só para referência). */
  semana: number;
  meta: number;
  metaDiaria: number;
  diasUteisDoMes: number;
  /** Quanto a recepção já deveria ter até o fim de hoje, no ritmo de 5 por dia útil. */
  esperadoAteHoje: number;
  /** Positivo = adiantada; negativo = devendo. */
  saldo: number;
  noRitmo: boolean;
  atingida: boolean;
  /** Dias úteis que restam, contando hoje. */
  diasUteisRestantes: number;
  /** Quantos por dia útil, daqui para a frente, para fechar a meta. */
  precisaPorDia: number;
}

/**
 * A meta é do MÊS: 5 por dia útil, mas o que falta num dia pode ser
 * compensado no outro — e o número que importa é quanto falta por dia daqui
 * para a frente. Conta agendamentos registrados e não cancelados.
 */
export function novosNoMes(agendamentos: AgendamentoDoResumo[], hoje: string): NovosDoMes {
  const mes = mesDe(hoje);
  const semana = semanaDe(hoje);
  let total = 0;
  let doDia = 0;
  let daSemana = 0;
  for (const a of agendamentos) {
    if (!a.criadoEm || a.status === "cancelled") continue;
    const dia = diaDaClinica(a.criadoEm);
    if (dia >= semana.de && dia <= semana.ate) daSemana++;
    if (dia < mes.de || dia > mes.ate) continue;
    total++;
    if (dia === hoje) doDia++;
  }
  const diasUteisDoMes = diasUteisEntre(mes.de, mes.ate);
  const meta = META_DIARIA * diasUteisDoMes;
  const esperadoAteHoje = META_DIARIA * diasUteisEntre(mes.de, hoje);
  const diasUteisRestantes = diasUteisEntre(hoje, mes.ate);
  return {
    total,
    hoje: doDia,
    semana: daSemana,
    meta,
    metaDiaria: META_DIARIA,
    diasUteisDoMes,
    esperadoAteHoje,
    saldo: total - esperadoAteHoje,
    noRitmo: total >= esperadoAteHoje,
    atingida: total >= meta,
    diasUteisRestantes,
    precisaPorDia:
      total >= meta || diasUteisRestantes === 0
        ? 0
        : Math.ceil((meta - total) / diasUteisRestantes),
  };
}

export interface ComoFoiAAgenda {
  compareceram: number;
  faltaram: number;
  /** Já passaram do horário e ninguém marcou se foi ou faltou. */
  semBaixa: number;
  cancelaram: number;
  /** Cancelaram no próprio dia da consulta ou depois: o horário se perdeu. */
  cancelaramNoDia: number;
  /** Compareceram ÷ (compareceram + faltaram). Nulo sem nenhum resultado. */
  comparecimentoPct: number | null;
  /** Cancelados ÷ marcados (os que já chegaram na data). Nulo sem marcados. */
  cancelamentoPct: number | null;
}

/**
 * O mês até agora, separado em quem veio, quem faltou e quem cancelou.
 *
 * Comparecimento NÃO inclui quem cancelou: quem avisa antes liberou o horário
 * e não é falta — misturar os dois faz a taxa culpar o paciente por algo que a
 * recepção ainda podia ter preenchido. Cancelamento é medido à parte, contra
 * tudo o que foi marcado. Quem passou do horário sem baixa fica fora das duas.
 */
export function comoFoiAAgenda(
  agendamentos: AgendamentoDoResumo[],
  hoje: string,
  agoraHHMM: string,
): ComoFoiAAgenda {
  const mes = mesDe(hoje);
  let compareceram = 0;
  let faltaram = 0;
  let semBaixa = 0;
  let cancelaram = 0;
  let cancelaramNoDia = 0;
  let marcados = 0;
  for (const a of agendamentos) {
    if (a.date < mes.de || a.date > hoje) continue;
    marcados++;
    if (a.status === "cancelled") {
      cancelaram++;
      if (a.atualizadoEm && diaDaClinica(a.atualizadoEm) >= a.date) cancelaramNoDia++;
      continue;
    }
    const passou = a.date < hoje || a.endTime <= agoraHHMM;
    if (a.status === "completed") compareceram++;
    else if (a.status === "missed") faltaram++;
    else if (passou) semBaixa++;
  }
  const base = compareceram + faltaram;
  return {
    compareceram,
    faltaram,
    semBaixa,
    cancelaram,
    cancelaramNoDia,
    comparecimentoPct: base ? (compareceram / base) * 100 : null,
    cancelamentoPct: marcados ? (cancelaram / marcados) * 100 : null,
  };
}

/** Os dois juntos, para o relógio da clínica no instante `agora`. */
export function resumoDaAgenda(agendamentos: AgendamentoDoResumo[], agora = new Date()) {
  const hoje = fmtClinica.format(agora);
  return {
    novos: novosNoMes(agendamentos, hoje),
    agenda: comoFoiAAgenda(agendamentos, hoje, fmtHora.format(agora)),
  };
}
