// As contas do painel de Gestão.
//
// ── Por que um módulo puro ──────────────────────────────────────────────
//
// Porque é aqui que um número vira "o que a clínica acha que está
// acontecendo". Ocupação de 76% e ocupação de 31% saem da mesma agenda,
// dependendo de como se conta a capacidade — e a diferença só aparece quando
// alguém decide errado por causa dela. As regras ficam escritas num lugar,
// com teste, em vez de espalhadas pela busca no banco.
//
// Nada daqui lê o banco: `gestao.functions.ts` busca, este arquivo calcula.

export interface Variacao {
  atual: number | null;
  anterior: number | null;
  /** Mudança relativa, em %. Nula se não há base de comparação (anterior zero
   *  ou ausente): "+∞%" não informa nada. */
  deltaPct: number | null;
  /** Diferença absoluta. Em indicadores que já são %, é a mudança em pontos
   *  percentuais (p.p.), que é como a margem e a ocupação devem ser lidas. */
  deltaAbs: number | null;
}

export function variacao(atual: number | null, anterior: number | null): Variacao {
  const temAmbos = atual !== null && anterior !== null;
  return {
    atual,
    anterior,
    // Pela base em módulo: de −10 para −5 melhorou, e a conta crua diria −50%.
    deltaPct: temAmbos && anterior !== 0 ? ((atual - anterior) / Math.abs(anterior)) * 100 : null,
    deltaAbs: temAmbos ? atual - anterior : null,
  };
}

/** Margem em %. Nula sem receita: margem de zero sobre zero não existe. */
export function margemEmPct(resultado: number, receita: number): number | null {
  return receita > 0 ? (resultado / receita) * 100 : null;
}

// ── Capacidade e ocupação da agenda ─────────────────────────────────────

export interface HorarioDoDia {
  /** 0 = domingo. */
  weekday: number;
  modo: string;
  /** "HH:MM" ou "HH:MM:SS". */
  opens: string | null;
  closes: string | null;
}

export interface UnidadeParaCapacidade {
  id: string;
  /** Cadeiras ativas. Sem nenhuma cadastrada conta como uma: a unidade
   *  atende, mesmo que ninguém tenha cadastrado onde. */
  cadeiras: number;
  horarios: HorarioDoDia[];
  /** Unidade que só atende em DATAS marcadas (a de viagem, como Porto Alegre):
   *  as datas, "AAAA-MM-DD". `null`/ausente = atende pelos dias da semana. Uma
   *  unidade "por data" sem nenhuma data cadastrada não oferece horário
   *  nenhum — é o que o sistema já assume ao oferecer vaga ao paciente. */
  diasMarcados?: string[] | null;
}

function emMinutos(hora: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hora ?? ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Quantos dias tem o mês "AAAA-MM". */
export function diasDoMes(mes: string): number {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

/**
 * Minutos de atendimento que a clínica OFERECE no mês, até `ateDia`.
 *
 * Soma, por unidade e por dia aberto, as horas de funcionamento vezes as
 * cadeiras. `ateDia` existe porque no mês corrente os dias que ainda não
 * aconteceram não são capacidade desperdiçada: contar o mês inteiro faria a
 * ocupação do dia 10 parecer um terço do que é.
 */
export function minutosDeCapacidade(
  mes: string,
  ateDia: string,
  unidades: UnidadeParaCapacidade[],
): number {
  const [ano, m] = mes.split("-").map(Number);
  let total = 0;
  for (let dia = 1; dia <= diasDoMes(mes); dia++) {
    const iso = `${mes}-${String(dia).padStart(2, "0")}`;
    if (iso > ateDia) break;
    const semana = new Date(Date.UTC(ano, m - 1, dia)).getUTCDay();
    for (const u of unidades) {
      if (u.diasMarcados && !u.diasMarcados.includes(iso)) continue;
      const h = u.horarios.find((x) => x.weekday === semana && x.modo === "aberto");
      const ini = emMinutos(h?.opens);
      const fim = emMinutos(h?.closes);
      if (ini === null || fim === null || fim <= ini) continue;
      total += (fim - ini) * Math.max(1, u.cadeiras);
    }
  }
  return total;
}

export interface AtendimentoDoPainel {
  id: string;
  unitId: string | null;
  patientId: string | null;
  /** AAAA-MM-DD */
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  receita: number;
}

/** Os status que ocupam a cadeira. Cancelado e falta liberam o horário (ou
 *  melhor: ele ficou vazio), e é isso que a ocupação mede. */
const OCUPAM = new Set(["pending", "confirmed", "in_progress", "completed"]);
const PERDIDOS = new Set(["cancelled", "missed"]);

export function minutosAgendados(atendimentos: AtendimentoDoPainel[]): number {
  let total = 0;
  for (const a of atendimentos) {
    if (!OCUPAM.has(a.status)) continue;
    const ini = emMinutos(a.startTime);
    const fim = emMinutos(a.endTime);
    if (ini !== null && fim !== null && fim > ini) total += fim - ini;
  }
  return total;
}

/** Ocupação em %. Nula sem capacidade (horário de funcionamento não
 *  cadastrado): "0%" afirmaria uma agenda vazia que ninguém mediu. */
export function ocupacaoEmPct(agendado: number, capacidade: number): number | null {
  return capacidade > 0 ? (agendado / capacidade) * 100 : null;
}

/** Faltas e cancelamentos, em % dos atendimentos que já deviam ter acontecido. */
export function taxaDePerdidos(atendimentos: AtendimentoDoPainel[], ateDia: string): number | null {
  const jaDeviam = atendimentos.filter((a) => a.date <= ateDia);
  if (!jaDeviam.length) return null;
  return (jaDeviam.filter((a) => PERDIDOS.has(a.status)).length / jaDeviam.length) * 100;
}

// ── Pacientes ───────────────────────────────────────────────────────────

export interface AtendimentoConcluido {
  patientId: string;
  unitId: string | null;
  date: string;
}

/** A data do primeiro atendimento concluído de cada paciente. É o que o
 *  painel chama de "paciente novo": quem fez o primeiro atendimento no mês,
 *  não quem foi cadastrado (a base tem milhares de fichas que nunca vieram). */
export function primeiroAtendimento(
  concluidos: AtendimentoConcluido[],
): Map<string, { date: string; unitId: string | null }> {
  const mapa = new Map<string, { date: string; unitId: string | null }>();
  for (const c of concluidos) {
    if (!c.patientId) continue;
    const atual = mapa.get(c.patientId);
    if (!atual || c.date < atual.date) mapa.set(c.patientId, { date: c.date, unitId: c.unitId });
  }
  return mapa;
}

export interface NovosERecorrentes {
  novos: number;
  recorrentes: number;
  receitaNovos: number;
  receitaRecorrentes: number;
}

/**
 * Entre quem foi atendido no mês: quem veio pela primeira vez e quem já tinha
 * vindo antes, com a receita de cada grupo.
 *
 * `unitId` filtra pela unidade DO ATENDIMENTO do mês, para os dois grupos
 * baterem com o resto da tela quando uma unidade está escolhida.
 */
export function novosERecorrentes(
  concluidosDoMes: AtendimentoDoPainel[],
  primeiros: Map<string, { date: string; unitId: string | null }>,
  mes: string,
): NovosERecorrentes {
  const novos = new Set<string>();
  const recorrentes = new Set<string>();
  let receitaNovos = 0;
  let receitaRecorrentes = 0;
  for (const a of concluidosDoMes) {
    if (a.status !== "completed" || !a.patientId) continue;
    const primeiro = primeiros.get(a.patientId)?.date;
    const ehNovo = !primeiro || primeiro.slice(0, 7) === mes;
    if (ehNovo) {
      novos.add(a.patientId);
      receitaNovos += a.receita;
    } else {
      recorrentes.add(a.patientId);
      receitaRecorrentes += a.receita;
    }
  }
  return {
    novos: novos.size,
    recorrentes: recorrentes.size,
    receitaNovos,
    receitaRecorrentes,
  };
}

/** Receita média por atendimento concluído. Nula sem atendimentos. */
export function ticketMedio(concluidos: AtendimentoDoPainel[]): number | null {
  const feitos = concluidos.filter((a) => a.status === "completed");
  if (!feitos.length) return null;
  return feitos.reduce((soma, a) => soma + a.receita, 0) / feitos.length;
}
