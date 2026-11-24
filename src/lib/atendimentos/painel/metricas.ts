// As contas do painel de Atendimento.
//
// Puro, como `gestao/indicadores.ts`: quem busca no banco é `montar.ts`; aqui
// só se calcula. O pareamento "mensagem do paciente → resposta da clínica" e o
// fuso do horário de pico são exatamente o tipo de conta que sai errada sem
// ninguém perceber — por isso ficam com teste.

import { foneCanonico } from "../../../../supabase/functions/_shared/inteligencia-do-lead.ts";

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;
const TZ = "America/Sao_Paulo";

// ── Períodos ────────────────────────────────────────────────────────────

export type FiltroDePeriodo = "hoje" | "ontem" | "7d" | "30d" | "mes" | "mes_passado" | "90d";

export interface Janela {
  /** Instante inicial, em ms (inclusive). */
  de: number;
  /** Instante final, em ms (exclusive). */
  ate: number;
}

export interface Periodos {
  atual: Janela;
  /** A janela de comparação, do MESMO tamanho: no "hoje", ontem até a mesma
   *  hora; sem isso, hoje às 10h seria comparado com ontem inteiro. */
  anterior: Janela;
}

/** O deslocamento do fuso da clínica NAQUELE dia, em minutos ("GMT-03:00"). */
function deslocamentoDoFuso(instante: Date): number {
  const nome = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" })
    .formatToParts(instante)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(nome ?? "");
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

/** O instante (ms) de "dia + hora" no relógio da clínica. */
export function instanteDaClinica(dia: string, hora = "00:00"): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(hora);
  const base = new Date(`${dia}T${(m?.[1] ?? "0").padStart(2, "0")}:${m?.[2] ?? "00"}:00Z`);
  return base.getTime() - deslocamentoDoFuso(base) * MINUTO;
}

/** "AAAA-MM-DD" do instante, no relógio da clínica. */
export function diaDaClinica(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

/** "AAAA-MM-01" do mês que fica `meses` meses antes do mês do dia dado. */
function primeiroDiaDoMes(dia: string, meses = 0): string {
  const [a, m] = dia.split("-").map(Number);
  const total = a * 12 + (m - 1) - meses;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}

export function periodosDoFiltro(filtro: FiltroDePeriodo, agora: number): Periodos {
  const inicioDeHoje = instanteDaClinica(diaDaClinica(agora));
  switch (filtro) {
    case "hoje":
      return {
        atual: { de: inicioDeHoje, ate: agora },
        anterior: { de: inicioDeHoje - DIA, ate: agora - DIA },
      };
    case "ontem":
      return {
        atual: { de: inicioDeHoje - DIA, ate: inicioDeHoje },
        anterior: { de: inicioDeHoje - 2 * DIA, ate: inicioDeHoje - DIA },
      };
    case "7d":
      return {
        atual: { de: agora - 7 * DIA, ate: agora },
        anterior: { de: agora - 14 * DIA, ate: agora - 7 * DIA },
      };
    case "30d":
      return {
        atual: { de: agora - 30 * DIA, ate: agora },
        anterior: { de: agora - 60 * DIA, ate: agora - 30 * DIA },
      };
    case "90d":
      return {
        atual: { de: agora - 90 * DIA, ate: agora },
        anterior: { de: agora - 180 * DIA, ate: agora - 90 * DIA },
      };
    case "mes": {
      // Do dia 1º até agora, contra o mês anterior ATÉ O MESMO PONTO: no dia 4,
      // comparar com o mês passado inteiro faria todo número parecer ter caído.
      const dia = diaDaClinica(agora);
      const inicio = instanteDaClinica(primeiroDiaDoMes(dia));
      const inicioAnterior = instanteDaClinica(primeiroDiaDoMes(dia, 1));
      return {
        atual: { de: inicio, ate: agora },
        anterior: { de: inicioAnterior, ate: Math.min(inicioAnterior + (agora - inicio), inicio) },
      };
    }
    case "mes_passado": {
      const dia = diaDaClinica(agora);
      return {
        atual: {
          de: instanteDaClinica(primeiroDiaDoMes(dia, 1)),
          ate: instanteDaClinica(primeiroDiaDoMes(dia)),
        },
        anterior: {
          de: instanteDaClinica(primeiroDiaDoMes(dia, 2)),
          ate: instanteDaClinica(primeiroDiaDoMes(dia, 1)),
        },
      };
    }
  }
}

const dentro = (ms: number, j: Janela) => ms >= j.de && ms < j.ate;

// ── Mensagens ───────────────────────────────────────────────────────────

export interface Mensagem {
  conversa: string;
  /** Mandada pela clínica (a assistente ou a equipe). */
  daClinica: boolean;
  /** Instante, em ms. */
  em: number;
  /** Só para mensagens da clínica: foi a assistente (a Luna) que mandou. */
  luna: boolean;
}

/** Conversa com uma pessoa: grupo (`@g.us`) e conversa antiga do CRM (UUID) não
 *  são atendimento de paciente. */
export function ehConversaDePessoa(conversa: string): boolean {
  return conversa.endsWith("@s.whatsapp.net");
}

function porConversa(mensagens: Mensagem[]): Map<string, Mensagem[]> {
  const mapa = new Map<string, Mensagem[]>();
  for (const m of mensagens) {
    if (!ehConversaDePessoa(m.conversa)) continue;
    const lista = mapa.get(m.conversa);
    if (lista) lista.push(m);
    else mapa.set(m.conversa, [m]);
  }
  for (const lista of mapa.values()) lista.sort((a, b) => a.em - b.em);
  return mapa;
}

// ── Novas conversas e atendidas ─────────────────────────────────────────

export interface PrimeiraEntrada {
  conversa: string;
  em: number;
}

/** Quem chamou pela primeira vez dentro da janela. */
export function novasConversas(entradas: PrimeiraEntrada[], janela: Janela): PrimeiraEntrada[] {
  return entradas.filter((e) => ehConversaDePessoa(e.conversa) && dentro(e.em, janela));
}

export interface Atendidas {
  total: number;
  /** Só a assistente respondeu. */
  luna: number;
  /** Alguém da equipe respondeu (ainda que a assistente também tenha). */
  equipe: number;
}

/** Conversas em que a clínica falou dentro da janela. */
export function atendidas(mensagens: Mensagem[], janela: Janela): Atendidas {
  let luna = 0;
  let equipe = 0;
  for (const lista of porConversa(mensagens).values()) {
    const dela = lista.filter((m) => m.daClinica && dentro(m.em, janela));
    if (!dela.length) continue;
    if (dela.some((m) => !m.luna)) equipe++;
    else luna++;
  }
  return { total: luna + equipe, luna, equipe };
}

// ── Tempo de resposta ───────────────────────────────────────────────────

export interface Resposta {
  /** Quando o paciente escreveu. */
  entrada: number;
  /** Quanto a clínica levou, em ms. */
  ms: number;
  luna: boolean;
}

/**
 * Cada vez que o paciente escreve e a clínica responde.
 *
 * Quando o paciente manda várias mensagens seguidas, conta a PRIMEIRA: é desde
 * ali que ele espera. A resposta tem de vir de uma mensagem da clínica; uma
 * espera que passa de `teto` (24h) não entra — é conversa que ficou para o dia
 * seguinte, e não um tempo de resposta.
 */
export function respostas(mensagens: Mensagem[], janela: Janela, teto = DIA): Resposta[] {
  const saida: Resposta[] = [];
  for (const lista of porConversa(mensagens).values()) {
    let esperaDesde: number | null = null;
    for (const m of lista) {
      if (!m.daClinica) {
        if (esperaDesde === null) esperaDesde = m.em;
      } else if (esperaDesde !== null) {
        const ms = m.em - esperaDesde;
        if (dentro(esperaDesde, janela) && ms <= teto) {
          saida.push({ entrada: esperaDesde, ms, luna: m.luna });
        }
        esperaDesde = null;
      }
    }
  }
  return saida;
}

export function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

export interface ResumoDeResposta {
  medianaMs: number | null;
  medianaLunaMs: number | null;
  medianaEquipeMs: number | null;
  /** Em %: quantas foram respondidas em até 5 minutos. */
  ate5minPct: number | null;
  total: number;
}

export function resumoDeResposta(lista: Resposta[]): ResumoDeResposta {
  return {
    medianaMs: mediana(lista.map((r) => r.ms)),
    medianaLunaMs: mediana(lista.filter((r) => r.luna).map((r) => r.ms)),
    medianaEquipeMs: mediana(lista.filter((r) => !r.luna).map((r) => r.ms)),
    ate5minPct: lista.length
      ? (lista.filter((r) => r.ms <= 5 * MINUTO).length / lista.length) * 100
      : null,
    total: lista.length,
  };
}

// ── Horário ─────────────────────────────────────────────────────────────

const formatoDeHora = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hour: "numeric",
  hour12: false,
  weekday: "short",
});
const SEMANA = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Hora (0–23) e dia da semana (0 = domingo) no relógio da clínica. */
export function horaEDia(ms: number): { hora: number; dia: number } {
  const partes = formatoDeHora.formatToParts(new Date(ms));
  // `hour12: false` devolve "24" à meia-noite em alguns ambientes.
  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const dia = SEMANA.indexOf(partes.find((p) => p.type === "weekday")?.value ?? "");
  return { hora, dia: Math.max(0, dia) };
}

/** Mensagens RECEBIDAS por hora do dia dentro da janela: 24 posições. */
export function movimentoPorHora(mensagens: Mensagem[], janela: Janela): number[] {
  const horas = Array.from({ length: 24 }, () => 0);
  for (const m of mensagens) {
    if (m.daClinica || !ehConversaDePessoa(m.conversa) || !dentro(m.em, janela)) continue;
    horas[horaEDia(m.em).hora]++;
  }
  return horas;
}

export interface PicoDaSemana {
  /** `celulas[dia][hora]`, com dia 0 = domingo. */
  celulas: number[][];
  maximo: number;
  /** A célula mais movimentada. Nula sem nenhuma mensagem. */
  pico: { dia: number; hora: number; mensagens: number } | null;
}

export function picoDaSemana(recebidasEm: number[]): PicoDaSemana {
  const celulas = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  let pico: PicoDaSemana["pico"] = null;
  let maximo = 0;
  for (const ms of recebidasEm) {
    const { hora, dia } = horaEDia(ms);
    celulas[dia][hora]++;
    if (celulas[dia][hora] > maximo) {
      maximo = celulas[dia][hora];
      pico = { dia, hora, mensagens: maximo };
    }
  }
  return { celulas, maximo, pico };
}

// ── Conversão em agendamento ────────────────────────────────────────────

export interface AgendamentoCriado {
  /** Telefone de quem foi agendado. */
  fone: string | null;
  /** O vínculo da ficha com a conversa (`crm_contact_id`), se houver. */
  contato: string | null;
  /** Quando o agendamento foi criado, em ms. */
  criadoEm: number;
}

export interface Conversao {
  novas: number;
  agendaram: number;
  /** Em %. Nula sem nenhuma conversa nova. */
  pct: number | null;
}

/**
 * Das pessoas que chamaram pela primeira vez, quantas já têm agendamento criado
 * DEPOIS do primeiro contato. É uma coorte, de propósito: o contrário (agendamentos
 * do dia sobre conversas do dia) mistura quem chamou semana passada com quem
 * chamou hoje. O custo é que "hoje" ainda vai subir: quem chamou de manhã pode
 * agendar amanhã.
 */
export function conversao(novas: PrimeiraEntrada[], agendamentos: AgendamentoCriado[]): Conversao {
  // O último agendamento criado de cada telefone (e de cada contato): basta
  // que ele seja posterior ao primeiro contato. Evita comparar todos com todos.
  const ultimoPorFone = new Map<string, number>();
  const ultimoPorContato = new Map<string, number>();
  for (const a of agendamentos) {
    const f = a.fone ? foneCanonico(a.fone) : null;
    if (f) ultimoPorFone.set(f, Math.max(ultimoPorFone.get(f) ?? 0, a.criadoEm));
    if (a.contato)
      ultimoPorContato.set(a.contato, Math.max(ultimoPorContato.get(a.contato) ?? 0, a.criadoEm));
  }
  let agendaram = 0;
  for (const n of novas) {
    const fone = foneCanonico(n.conversa.split("@")[0]);
    const porFone = fone ? ultimoPorFone.get(fone) : undefined;
    const porContato = ultimoPorContato.get(n.conversa);
    if (
      (porFone !== undefined && porFone >= n.em) ||
      (porContato !== undefined && porContato >= n.em)
    )
      agendaram++;
  }
  return {
    novas: novas.length,
    agendaram,
    pct: novas.length ? (agendaram / novas.length) * 100 : null,
  };
}

// ── Espera de agora ─────────────────────────────────────────────────────

export interface Aguardando {
  total: number;
  /** Há quantos minutos a mais antiga espera. Nulo sem ninguém esperando. */
  maisAntigaMin: number | null;
}

/** Conversas cuja última mensagem é do paciente e ainda não foi respondida. */
export function aguardando(ultimasDoPaciente: number[], agora: number): Aguardando {
  if (!ultimasDoPaciente.length) return { total: 0, maisAntigaMin: null };
  return {
    total: ultimasDoPaciente.length,
    maisAntigaMin: Math.max(0, Math.round((agora - Math.min(...ultimasDoPaciente)) / MINUTO)),
  };
}

// ── Atendimentos por dentista ───────────────────────────────────────────

export interface AtendimentoDoDentista {
  professionalId: string | null;
  professionalName: string | null;
  /** Só os concluídos entram: o resto ainda não aconteceu ou não vai acontecer. */
  status: string;
  /** O valor cobrado no atendimento (já com o sinal dentro). */
  receita: number | null;
}

export interface LinhaPorDentista {
  nome: string;
  atendimentos: number;
  /** `null` quando quem vê não tem acesso ao financeiro. */
  receita: number | null;
}

/**
 * Atendimentos concluídos e receita de cada dentista, do que mais atendeu para
 * o que menos. Empate pela receita, depois pelo nome.
 *
 * A chave é o id do profissional (ver abaixo). Atendimento sem nome vira
 * "Sem dentista" — sumir da conta seria pior: o total não bateria com
 * a agenda.
 */
export function porDentista(
  linhas: AtendimentoDoDentista[],
  mostrarReceita: boolean,
): LinhaPorDentista[] {
  const minusculo = (t: string) => t.trim().toLocaleLowerCase("pt-BR");
  // Quem tem id vale pelo id (o mesmo dentista aparece com "Dra. Mariane Botti" e
  // "Mariane Botti" no nome gravado). Quem não tem id vale pelo nome, e se esse
  // nome é de um dentista que tem id em outro atendimento, junta-se a ele.
  const idPorNome = new Map<string, string>();
  for (const l of linhas) {
    if (l.professionalId && l.professionalName?.trim())
      idPorNome.set(minusculo(l.professionalName), l.professionalId);
  }
  const mapa = new Map<
    string,
    { nomes: Map<string, number>; atendimentos: number; receita: number }
  >();
  for (const l of linhas) {
    if (l.status !== "completed") continue;
    const nome = l.professionalName?.trim() || "Sem dentista";
    const chave = l.professionalId ?? idPorNome.get(minusculo(nome)) ?? `nome:${minusculo(nome)}`;
    const atual = mapa.get(chave) ?? { nomes: new Map(), atendimentos: 0, receita: 0 };
    atual.nomes.set(nome, (atual.nomes.get(nome) ?? 0) + 1);
    atual.atendimentos += 1;
    atual.receita += Number(l.receita ?? 0) || 0;
    mapa.set(chave, atual);
  }
  return [...mapa.values()]
    .map((d) => ({
      // O nome mais usado nos atendimentos dele; no empate, o mais completo.
      nome: [...d.nomes.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0],
      atendimentos: d.atendimentos,
      receita: d.receita,
    }))
    .sort(
      (a, b) =>
        b.atendimentos - a.atendimentos ||
        b.receita - a.receita ||
        a.nome.localeCompare(b.nome, "pt-BR"),
    )
    .map((d) => ({
      nome: d.nome,
      atendimentos: d.atendimentos,
      receita: mostrarReceita ? Math.round(d.receita * 100) / 100 : null,
    }));
}
