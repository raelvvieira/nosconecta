// O Recovery Engine: QUANDO a Luna volta em quem parou de responder.
//
// ── A divisão que este arquivo existe para manter ───────────────────────
//
// O manual da Luna (V4.1, Parte D) diz COMO voltar: trilhas, intensidades,
// mecanismos, o que nunca fazer. Ele continua sendo a fonte do conteúdo e não é
// tocado aqui. Este arquivo decide o resto: em que trilha a conversa está,
// quando cada retomada vence, se ainda pode sair e quando a sequência acaba.
//
// Os tempos que o manual cita ("+20 a 30 min") são referência estratégica. A
// fonte operacional é a configuração salva na tela do Agente de IA, para não
// existirem duas regras de tempo lidas de jeitos diferentes pelo prompt e pelo
// código.
//
// ── Por que tudo aqui é puro ────────────────────────────────────────────
//
// Isto manda mensagem no WhatsApp de gente real, sozinho. Cada decisão
// (planejar, conferir antes de enviar, escolher o mecanismo) é uma função sem
// banco e sem relógio, com teste (`tests/recuperacao.ts`). Quem tem banco é o
// `agente-followup` e o `atendimento.ts`; eles só juntam os fatos e obedecem.

// ── Vocabulário do manual ───────────────────────────────────────────────

export const TRILHAS = [
  "INITIAL_NO_RESPONSE",
  "ACTIVE_CONVERSATION_DROP",
  "PRICE_SILENCE",
  "SCHEDULE_IGNORED",
  "SAID_WILL_THINK",
  "PROMISED_CALLBACK",
  "AWAITING_DATA",
  "AWAITING_RESERVATION",
  "STOP",
] as const;
export type Trilha = (typeof TRILHAS)[number];

export const MECANISMOS = [
  "PRESENCE_CHECK",
  "PATTERN_INTERRUPT",
  "OPEN_LOOP",
  "SOCIAL_PROOF",
  "USEFUL_INFORMATION",
  "OBJECTION_ISOLATION",
  "FRICTION_REDUCTION",
  "SCHEDULE_OPPORTUNITY",
  "SOCIAL_ACCOUNTABILITY",
  "BREAKUP",
] as const;
export type Mecanismo = (typeof MECANISMOS)[number];

export const INTENSIDADES = ["HIGH", "MEDIUM", "LOW", "PAUSED", "STOP"] as const;
export type Intensidade = (typeof INTENSIDADES)[number];

// ── A configuração, como a tela grava em `ai_agents.recovery_config` ─────

/**
 * Quando a etapa vence.
 *
 * `minutos` conta da mensagem ORIGINAL da Luna que ficou sem resposta, nunca da
 * etapa anterior: 20, 45, 165 e 345 querem dizer 10h20, 10h45, 12h45 e 15h45
 * para uma resposta das 10h. Somar faria a quarta sair às 19h35.
 *
 * `dia` é "N dias depois, a tal hora", no próximo dia em que o consultório
 * atende. É a despedida: ela não é antecipada para o mesmo dia só porque as
 * anteriores já saíram.
 *
 * `retorno` é a data que a pessoa combinou ("me chama quinta").
 */
export type Momento =
  | { tipo: "minutos"; minutos: number }
  | { tipo: "dia"; dias: number; hora: string }
  | { tipo: "retorno"; hora: string };

export interface EtapaConfig {
  momento: Momento;
  mecanismo: Mecanismo;
  ativa: boolean;
  /**
   * Só sai se couber na janela. Uma etapa condicional que cai fora do horário
   * é descartada, e não entra na retomada da manhã seguinte.
   */
  condicional: boolean;
}

export interface TrilhaConfig {
  ligada: boolean;
  intensidade: Intensidade;
  etapas: EtapaConfig[];
}

export interface ConfigDeRecuperacao {
  ligado: boolean;
  /** Quando foi ligado. Silêncio que começou antes disto não é acordado: ligar
   *  não pode virar disparo para o acervo inteiro. */
  ligadoDesde: string | null;
  fuso: string;
  /** Hora cheia, no fuso acima. Sai se `inicio <= hora < fim`. */
  janelaInicio: number;
  janelaFim: number;
  /** A hora da única retomada que substitui as etapas que a noite engoliu. */
  horaDaRetomada: string;
  /** Quanto atraso uma etapa de minutos tolera antes de ser descartada. */
  toleranciaMinutos: number;
  trilhas: Record<Trilha, TrilhaConfig>;
}

const LIMITE_DE_ETAPAS = 8;
/** Atraso tolerado das etapas de dia: elas não são de minuto, e uma despedida
 *  às 16h20 em vez das 16h continua sendo a despedida certa. */
const TOLERANCIA_DO_DIA_MIN = 120;

function hhmm(valor: unknown, padrao: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(valor ?? "").trim());
  if (!m) return padrao;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return padrao;
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

function inteiro(valor: unknown, min: number, max: number, padrao: number): number {
  const n = Math.round(Number(valor));
  if (!Number.isFinite(n)) return padrao;
  return Math.min(max, Math.max(min, n));
}

function deLista<T extends string>(lista: readonly T[], valor: unknown, padrao: T): T {
  return lista.includes(valor as T) ? (valor as T) : padrao;
}

/** A hora de uma etapa de dia precisa estar dentro da janela, senão ela nunca
 *  sairia. Fora dela, vai para o começo da janela. */
function horaNaJanela(hora: string, inicio: number, fim: number): string {
  const h = Number(hora.slice(0, 2));
  if (h >= inicio && h < fim) return hora;
  return `${String(inicio).padStart(2, "0")}:00`;
}

/**
 * A configuração como o banco a entrega, virando algo em que dá para confiar.
 *
 * `null` quando não há configuração: aí o motor está desligado. A tela é quem
 * cria a primeira, a partir dos presets; o motor nunca inventa uma cadência.
 */
export function normalizarConfig(bruto: unknown): ConfigDeRecuperacao | null {
  if (!bruto || typeof bruto !== "object") return null;
  const b = bruto as Record<string, unknown>;
  const janelaInicio = inteiro(b.janelaInicio, 0, 23, 9);
  const janelaFim = Math.max(janelaInicio + 1, inteiro(b.janelaFim, 1, 24, 19));
  const trilhasBrutas = (b.trilhas ?? {}) as Record<string, unknown>;

  const trilhas = {} as Record<Trilha, TrilhaConfig>;
  for (const t of TRILHAS) {
    const tb = (trilhasBrutas[t] ?? {}) as Record<string, unknown>;
    const etapas: EtapaConfig[] = [];
    for (const eb of (Array.isArray(tb.etapas) ? tb.etapas : []).slice(0, LIMITE_DE_ETAPAS)) {
      const e = (eb ?? {}) as Record<string, unknown>;
      const m = (e.momento ?? {}) as Record<string, unknown>;
      let momento: Momento;
      if (m.tipo === "dia") {
        momento = {
          tipo: "dia",
          dias: inteiro(m.dias, 1, 30, 1),
          hora: horaNaJanela(hhmm(m.hora, "16:00"), janelaInicio, janelaFim),
        };
      } else if (m.tipo === "retorno") {
        momento = {
          tipo: "retorno",
          hora: horaNaJanela(hhmm(m.hora, "10:00"), janelaInicio, janelaFim),
        };
      } else {
        // Até sete dias em minutos: mais que isso é etapa de dia.
        momento = { tipo: "minutos", minutos: inteiro(m.minutos, 1, 7 * 24 * 60, 20) };
      }
      etapas.push({
        momento,
        mecanismo: deLista(MECANISMOS, e.mecanismo, "OPEN_LOOP"),
        ativa: e.ativa !== false,
        condicional: e.condicional === true,
      });
    }
    trilhas[t] = {
      // STOP não volta em ninguém, nem se alguém configurar etapas nela.
      ligada: t !== "STOP" && tb.ligada !== false,
      intensidade: t === "STOP" ? "STOP" : deLista(INTENSIDADES, tb.intensidade, "MEDIUM"),
      etapas: t === "STOP" ? [] : etapas,
    };
  }

  return {
    ligado: b.ligado === true,
    ligadoDesde: typeof b.ligadoDesde === "string" ? b.ligadoDesde : null,
    fuso: typeof b.fuso === "string" && b.fuso ? b.fuso : "America/Sao_Paulo",
    janelaInicio,
    janelaFim,
    horaDaRetomada: horaNaJanela(hhmm(b.horaDaRetomada, "10:00"), janelaInicio, janelaFim),
    toleranciaMinutos: inteiro(b.toleranciaMinutos, 1, 120, 10),
    trilhas,
  };
}

// ── Relógio no fuso da operação ─────────────────────────────────────────

export interface PartesLocais {
  /** AAAA-MM-DD */
  data: string;
  hora: number;
  minuto: number;
  /** 0 = domingo, como `clinic_business_hours.weekday`. */
  diaDaSemana: number;
}

export function partesLocais(instante: Date, fuso: string): PartesLocais {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instante);
  const v = (t: string) => f.find((p) => p.type === t)?.value ?? "00";
  const data = `${v("year")}-${v("month")}-${v("day")}`;
  return {
    data,
    hora: Number(v("hour")),
    minuto: Number(v("minute")),
    // Meio-dia UTC: nenhum fuso empurra a data para o dia vizinho.
    diaDaSemana: new Date(`${data}T12:00:00Z`).getUTCDay(),
  };
}

/** O instante de "tal data, tal hora" no fuso. Duas passadas acertam a
 *  mudança de horário de verão, se um dia ela voltar. */
export function instanteLocal(data: string, hora: string, fuso: string): Date {
  const [a, m, d] = data.split("-").map(Number);
  const [h, mi] = hora.split(":").map(Number);
  const desejado = Date.UTC(a, m - 1, d, h, mi);
  let palpite = desejado;
  for (let i = 0; i < 2; i++) {
    const p = partesLocais(new Date(palpite), fuso);
    const [pa, pm, pd] = p.data.split("-").map(Number);
    const visto = Date.UTC(pa, pm - 1, pd, p.hora, p.minuto);
    palpite += desejado - visto;
  }
  return new Date(palpite);
}

function somarDias(data: string, dias: number): string {
  const t = new Date(`${data}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + dias);
  return t.toISOString().slice(0, 10);
}

/**
 * Pode sair mensagem neste instante?
 *
 * Só a janela de horário e os dias em que o consultório atende. O horário de
 * abertura de cada unidade fica de fora de propósito: uma retomada às 18h50
 * de quem a Luna respondeu às 18h30 é continuação da conversa, mesmo que a
 * recepção feche às 18h.
 *
 * Sem dia cadastrado nenhum, nada sai: falha fechada, como o follow-up antigo.
 */
export function janelaAberta(
  instante: Date,
  config: Pick<ConfigDeRecuperacao, "fuso" | "janelaInicio" | "janelaFim">,
  diasAbertos: readonly number[],
): boolean {
  const p = partesLocais(instante, config.fuso);
  return (
    p.hora >= config.janelaInicio &&
    p.hora < config.janelaFim &&
    diasAbertos.includes(p.diaDaSemana)
  );
}

/** A data (a partir de `data`) em que o consultório atende. `null` se não
 *  atende em nenhum dos próximos 14 dias. */
function proximoDiaAberto(data: string, diasAbertos: readonly number[]): string | null {
  for (let i = 0; i < 14; i++) {
    const d = somarDias(data, i);
    if (diasAbertos.includes(new Date(`${d}T12:00:00Z`).getUTCDay())) return d;
  }
  return null;
}

/** A primeira abertura da janela a partir deste instante (inclusive). */
function proximaAbertura(
  instante: Date,
  config: Pick<ConfigDeRecuperacao, "fuso" | "janelaInicio" | "janelaFim">,
  diasAbertos: readonly number[],
): string | null {
  const p = partesLocais(instante, config.fuso);
  const hoje = p.hora < config.janelaFim ? p.data : somarDias(p.data, 1);
  return proximoDiaAberto(hoje, diasAbertos);
}

// ── O plano de uma sequência ────────────────────────────────────────────

export interface EtapaPlanejada {
  /** 1, 2, 3… na ordem em que vencem. */
  passo: number;
  venceEm: string;
  mecanismo: Mecanismo;
  tipo: Momento["tipo"];
  /** Quantas etapas da noite esta retomada substitui. 0 nas normais. */
  juntou: number;
}

/**
 * O calendário da sequência, calculado UMA vez, quando ela nasce.
 *
 * Fica guardado na conversa. É isto que torna a configuração "versionada":
 * mudar os minutos na tela vale para as sequências que nascerem depois, e quem
 * já está no meio segue com o calendário com que começou.
 *
 * ── A noite ────────────────────────────────────────────────────────────
 *
 * Etapa de minutos que cai fora da janela não é empurrada para a manhã. Se
 * fosse, quem a Luna respondeu às 18h30 receberia três mensagens às 9h.
 *
 * As que caíram fora viram NO MÁXIMO uma retomada, na próxima abertura, e só
 * se aquele dia ainda não tiver nada marcado. Na trilha principal o dia
 * seguinte já tem a despedida, então a retomada nem nasce: a pessoa recebe uma
 * mensagem só no dia seguinte, que é a regra.
 */
export function planejarSequencia(p: {
  origem: Date;
  trilha: TrilhaConfig;
  config: ConfigDeRecuperacao;
  diasAbertos: readonly number[];
  /** AAAA-MM-DD, para a trilha de retorno combinado. */
  retornoEm?: string | null;
}): EtapaPlanejada[] {
  const { origem, trilha, config, diasAbertos } = p;
  if (!trilha.ligada || !diasAbertos.length) return [];

  const origemLocal = partesLocais(origem, config.fuso);
  type Bruta = Omit<EtapaPlanejada, "passo">;
  const planejadas: Bruta[] = [];
  const perdidas: { mecanismo: Mecanismo; vence: Date }[] = [];

  for (const e of trilha.etapas) {
    if (!e.ativa) continue;
    const m = e.momento;
    if (m.tipo === "minutos") {
      const vence = new Date(origem.getTime() + m.minutos * 60_000);
      if (janelaAberta(vence, config, diasAbertos)) {
        planejadas.push({
          venceEm: vence.toISOString(),
          mecanismo: e.mecanismo,
          tipo: "minutos",
          juntou: 0,
        });
      } else if (!e.condicional) {
        perdidas.push({ mecanismo: e.mecanismo, vence });
      }
    } else if (m.tipo === "dia") {
      const dia = proximoDiaAberto(somarDias(origemLocal.data, m.dias), diasAbertos);
      if (dia) {
        planejadas.push({
          venceEm: instanteLocal(dia, m.hora, config.fuso).toISOString(),
          mecanismo: e.mecanismo,
          tipo: "dia",
          juntou: 0,
        });
      }
    } else if (p.retornoEm && /^\d{4}-\d{2}-\d{2}$/.test(p.retornoEm)) {
      const dia = proximoDiaAberto(p.retornoEm, diasAbertos);
      if (dia) {
        planejadas.push({
          venceEm: instanteLocal(dia, m.hora, config.fuso).toISOString(),
          mecanismo: e.mecanismo,
          tipo: "retorno",
          juntou: 0,
        });
      }
    }
  }

  if (perdidas.length) {
    const dia = proximaAbertura(perdidas[0].vence, config, diasAbertos);
    const diaJaTemContato = planejadas.some(
      (e) => partesLocais(new Date(e.venceEm), config.fuso).data === dia,
    );
    if (dia && !diaJaTemContato) {
      const vence = instanteLocal(dia, config.horaDaRetomada, config.fuso);
      // A retomada substitui as perdidas; o mecanismo é o da primeira delas,
      // que é a que a pessoa teria recebido primeiro.
      if (vence > origem) {
        planejadas.push({
          venceEm: vence.toISOString(),
          mecanismo: perdidas[0].mecanismo,
          tipo: "minutos",
          juntou: perdidas.length,
        });
      }
    }
  }

  const vistas = new Set<string>();
  return planejadas
    .filter((e) => new Date(e.venceEm) > origem)
    .sort((a, b) => a.venceEm.localeCompare(b.venceEm))
    .filter((e) => (vistas.has(e.venceEm) ? false : (vistas.add(e.venceEm), true)))
    .map((e, i) => ({ ...e, passo: i + 1 }));
}

// ── Em que trilha a conversa está ───────────────────────────────────────

/**
 * Pedido para parar, dito com todas as letras.
 *
 * Isto não depende do rótulo do modelo: "para de me mandar mensagem" tem de
 * parar tudo mesmo no dia em que o modelo errar a classificação.
 */
const PEDIDOS_PARA_PARAR = [
  /\b(para|pare|parem|parar)\s+de\s+(me\s+)?(mandar|enviar|chamar|ligar|escrever)/,
  /\bnao\s+(me\s+)?(mande|mandem|envie|enviem|chame|chamem)\b/,
  /\bnao\s+quero\s+mais\s+(receber|mensage|que\s+me)/,
  /\b(me\s+)?(tira|tirem|remove|removam)\s+(da|dessa|desta)\s+lista/,
  /\bdescadastr/,
  /\bnao\s+tenho\s+(mais\s+)?interesse\b/,
  /\bsem\s+interesse\b/,
];

function semAcento(texto: string): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function pediuParaParar(texto: string | null | undefined): boolean {
  const t = semAcento(texto ?? "");
  return PEDIDOS_PARA_PARAR.some((r) => r.test(t));
}

/**
 * A trilha da sequência que vai nascer.
 *
 * Duas regras não dependem do modelo:
 *
 * 1. Quem pediu para parar é STOP.
 * 2. Quando esta é a PRIMEIRA resposta da Luna na conversa, a pessoa ainda não
 *    respondeu nada a ela, e o silêncio que vem é INITIAL_NO_RESPONSE. É a
 *    trilha da cadência principal, e é ela que não pode ficar à mercê de um
 *    rótulo errado.
 *
 * O resto vem do rótulo que a Luna deu à conversa junto da resposta (ela é
 * quem entende "vou pensar" e "me chama quinta"). Rótulo desconhecido vira
 * ACTIVE_CONVERSATION_DROP, a trilha genérica de conversa interrompida.
 * Retorno combinado sem data válida vira "vou pensar": sem data não há quando.
 */
export function trilhaDaSequencia(p: {
  primeiraRespostaDaLuna: boolean;
  rotulo: string | null | undefined;
  /** AAAA-MM-DD ou vazio. */
  retornoCombinado: string | null | undefined;
  ultimaMensagemDaPessoa: string | null | undefined;
  /** AAAA-MM-DD de hoje, no fuso da operação. */
  hoje: string;
}): { trilha: Trilha; retornoEm: string | null } {
  if (pediuParaParar(p.ultimaMensagemDaPessoa)) return { trilha: "STOP", retornoEm: null };
  const rotulo = deLista(
    TRILHAS,
    String(p.rotulo ?? "")
      .trim()
      .toUpperCase(),
    "ACTIVE_CONVERSATION_DROP",
  );
  if (rotulo === "STOP") return { trilha: "STOP", retornoEm: null };
  if (p.primeiraRespostaDaLuna) return { trilha: "INITIAL_NO_RESPONSE", retornoEm: null };

  if (rotulo === "PROMISED_CALLBACK") {
    const data = String(p.retornoCombinado ?? "").trim();
    const valida =
      /^\d{4}-\d{2}-\d{2}$/.test(data) &&
      !Number.isNaN(Date.parse(`${data}T12:00:00Z`)) &&
      data > p.hoje &&
      data <= somarDias(p.hoje, 60);
    return valida
      ? { trilha: "PROMISED_CALLBACK", retornoEm: data }
      : { trilha: "SAID_WILL_THINK", retornoEm: null };
  }
  // INITIAL_NO_RESPONSE só vale na primeira resposta; depois dela a pessoa já
  // falou com a Luna, e o silêncio é de conversa interrompida.
  if (rotulo === "INITIAL_NO_RESPONSE")
    return { trilha: "ACTIVE_CONVERSATION_DROP", retornoEm: null };
  return { trilha: rotulo, retornoEm: null };
}

// ── Conferência imediatamente antes de enviar ───────────────────────────

export interface SituacaoNaHora {
  agora: Date;
  etapa: Pick<EtapaPlanejada, "venceEm" | "tipo">;
  pessoaFalouDepois: boolean;
  equipeAssumiu: boolean;
  /** `null` quando não deu para saber. */
  agendou: boolean | null;
  naoContatar: boolean;
  agenteLigado: boolean;
  recuperacaoLigada: boolean;
  trilhaLigada: boolean;
  janelaAberta: boolean;
  cotaDisponivel: boolean;
  toleranciaMinutos: number;
}

export type Veredito =
  | { acao: "enviar" }
  /** A sequência inteira acaba. */
  | { acao: "cancelar"; motivo: string }
  /** Só esta etapa é descartada; a sequência segue para a próxima. */
  | { acao: "pular"; motivo: string }
  /** Tenta de novo no próximo minuto, se ainda couber na tolerância. */
  | { acao: "esperar"; motivo: string };

/**
 * A última palavra antes de a mensagem sair.
 *
 * A ordem é a do motivo mais forte. "Pediu para não receber" diz mais que "a
 * janela fechou", e é ele que tem de ficar gravado.
 *
 * Atraso além da tolerância DESCARTA a etapa em vez de mandar atrasada: depois
 * de o servidor ficar parado uma hora, a retomada dos 20 minutos não pode sair
 * junto com a dos 45.
 */
export function conferirAntesDeEnviar(s: SituacaoNaHora): Veredito {
  if (s.naoContatar) return { acao: "cancelar", motivo: "pediu para não receber mensagens" };
  if (s.pessoaFalouDepois) return { acao: "cancelar", motivo: "a pessoa respondeu" };
  if (s.equipeAssumiu) return { acao: "cancelar", motivo: "a equipe assumiu a conversa" };
  if (s.agendou === true) return { acao: "cancelar", motivo: "já agendou" };
  if (!s.agenteLigado) return { acao: "cancelar", motivo: "agente desligado" };
  if (!s.recuperacaoLigada) return { acao: "cancelar", motivo: "recovery desligado" };
  if (!s.trilhaLigada) return { acao: "cancelar", motivo: "trilha desligada" };

  const tolerancia =
    s.etapa.tipo === "minutos"
      ? s.toleranciaMinutos
      : Math.max(s.toleranciaMinutos, TOLERANCIA_DO_DIA_MIN);
  const atrasoMin = (s.agora.getTime() - new Date(s.etapa.venceEm).getTime()) / 60_000;
  if (atrasoMin > tolerancia) {
    return { acao: "pular", motivo: `atrasada ${Math.round(atrasoMin)} min, não sai fora de hora` };
  }
  if (!s.janelaAberta) return { acao: "pular", motivo: "fora da janela de envio" };
  if (s.agendou === null) return { acao: "esperar", motivo: "não deu para conferir se agendou" };
  if (!s.cotaDisponivel) return { acao: "esperar", motivo: "cota diária do número esgotada" };
  return { acao: "enviar" };
}

// ── O mecanismo, sem repetir ────────────────────────────────────────────

/** Para onde cada mecanismo cai quando não dá para usá-lo. */
const SUBSTITUTOS: Record<Mecanismo, Mecanismo[]> = {
  PRESENCE_CHECK: ["OPEN_LOOP", "USEFUL_INFORMATION"],
  PATTERN_INTERRUPT: ["OPEN_LOOP", "USEFUL_INFORMATION", "FRICTION_REDUCTION"],
  OPEN_LOOP: ["USEFUL_INFORMATION", "FRICTION_REDUCTION"],
  SOCIAL_PROOF: ["USEFUL_INFORMATION", "FRICTION_REDUCTION"],
  USEFUL_INFORMATION: ["FRICTION_REDUCTION", "OBJECTION_ISOLATION"],
  OBJECTION_ISOLATION: ["USEFUL_INFORMATION", "FRICTION_REDUCTION"],
  FRICTION_REDUCTION: ["USEFUL_INFORMATION", "OBJECTION_ISOLATION"],
  SCHEDULE_OPPORTUNITY: ["FRICTION_REDUCTION", "USEFUL_INFORMATION"],
  SOCIAL_ACCOUNTABILITY: ["OPEN_LOOP", "FRICTION_REDUCTION"],
  BREAKUP: [],
};

/**
 * O mecanismo que esta etapa vai de fato usar.
 *
 * - Nunca o mesmo da retomada anterior (manual, D4).
 * - "Conseguiu ver?", "viu minha mensagem?" e "ainda está aí?" são o MESMO
 *   mecanismo: presença sai uma vez por sequência, no máximo.
 * - Sem figurinha aprovada não há quebra de padrão por figurinha, e sem caso
 *   no catálogo não há prova social. A etapa troca de abordagem em vez de
 *   fingir uma mídia que não existe.
 * - A despedida é sempre despedida.
 */
export function mecanismoDaEtapa(
  sugerido: Mecanismo,
  usados: readonly Mecanismo[],
  disponivel: { figurinha: boolean; casos: boolean },
): Mecanismo {
  if (sugerido === "BREAKUP") return "BREAKUP";
  const ultimo = usados[usados.length - 1];
  const serve = (m: Mecanismo) =>
    m !== ultimo &&
    !(m === "PRESENCE_CHECK" && usados.includes("PRESENCE_CHECK")) &&
    !(m === "PATTERN_INTERRUPT" && !disponivel.figurinha) &&
    !(m === "SOCIAL_PROOF" && !disponivel.casos);
  if (serve(sugerido)) return sugerido;
  for (const m of SUBSTITUTOS[sugerido]) if (serve(m)) return m;
  for (const m of [
    "USEFUL_INFORMATION",
    "FRICTION_REDUCTION",
    "OBJECTION_ISOLATION",
    "OPEN_LOOP",
  ] as const) {
    if (serve(m)) return m;
  }
  return "USEFUL_INFORMATION";
}

// ── O texto genérico que não pode sair ──────────────────────────────────

/** As frases que o manual proíbe, ou que são só "presença" disfarçada. */
const PRESENCA = [
  /conseguiu\s+ver/,
  /viu\s+(a\s+)?minha\s+mensagem/,
  /ainda\s+(esta|ta|estas)\s+(ai|por\s+ai)/,
  /ainda\s+tem\s+interesse/,
  /\bso\s+passando\b/,
  /\bpassando\s+(aqui\s+)?(pra|para)\s+(saber|ver|lembrar)/,
];
const NUNCA = [
  /\bvoce\s+sumiu\b/,
  /\bnao\s+(me\s+)?respondeu\b/,
  /\bnao\s+(recebi|tive)\s+(sua\s+)?resposta\b/,
];

/**
 * A mensagem saiu genérica?
 *
 * Sempre, se tiver uma frase que o manual proíbe ("você sumiu"). E, fora da
 * etapa de presença, se ela for só presença com outra roupa: a etapa pedia um
 * motivo novo para voltar, e "ainda tem interesse?" não é motivo.
 */
export function pareceGenerica(texto: string, mecanismo: Mecanismo): boolean {
  const t = semAcento(texto);
  if (NUNCA.some((r) => r.test(t))) return true;
  if (mecanismo === "PRESENCE_CHECK") return false;
  return PRESENCA.some((r) => r.test(t));
}

// ── A sequência como ela fica guardada na conversa ──────────────────────

export type StatusDaSequencia = "ativa" | "enviando" | "encerrada" | "cancelada";

/**
 * O estado guardado em `ai_agent_sessions` (colunas `recovery_*`).
 *
 * `passo` é o ÍNDICE da próxima etapa em `plano`. É ele que impede o envio
 * duplicado: uma rodada só manda depois de trocar, no banco, "ativa no passo
 * N" por "enviando no passo N" (`reclamar`). Duas rodadas que leram a mesma
 * conversa ao mesmo tempo disputam essa troca, e só uma ganha.
 */
export interface EstadoDaSequencia {
  status: StatusDaSequencia;
  passo: number;
  plano: EtapaPlanejada[];
  mecanismos: Mecanismo[];
  tentativas: number;
  enviandoDesde: string | null;
  motivo: string | null;
}

/** Uma etapa "enviando" há mais que isto ficou presa no meio (servidor caiu
 *  entre mandar e gravar). Ela NÃO é reenviada: perder um toque é melhor que
 *  mandar dois. */
export const PRESA_DEPOIS_DE_MIN = 5;

export function proximaEtapa(e: EstadoDaSequencia): EtapaPlanejada | null {
  return e.status === "ativa" ? (e.plano[e.passo] ?? null) : null;
}

/** "Ativa no passo N" → "enviando no passo N". `null` se outra rodada já pegou. */
export function reclamar(
  e: EstadoDaSequencia,
  passoLido: number,
  agora: Date,
): EstadoDaSequencia | null {
  if (e.status !== "ativa" || e.passo !== passoLido || !e.plano[e.passo]) return null;
  return { ...e, status: "enviando", enviandoDesde: agora.toISOString() };
}

function avancar(e: EstadoDaSequencia, mecanismo: Mecanismo | null): EstadoDaSequencia {
  const passo = e.passo + 1;
  const acabou = passo >= e.plano.length;
  return {
    ...e,
    passo,
    status: acabou ? "encerrada" : "ativa",
    mecanismos: mecanismo ? [...e.mecanismos, mecanismo] : e.mecanismos,
    tentativas: 0,
    enviandoDesde: null,
    motivo: acabou
      ? mecanismo === "BREAKUP"
        ? "despedida enviada"
        : "etapas esgotadas"
      : e.motivo,
  };
}

export type EventoDaSequencia =
  | { tipo: "enviou"; mecanismo: Mecanismo }
  | { tipo: "pulou"; motivo: string }
  | { tipo: "cancelou"; motivo: string }
  | { tipo: "esperar"; motivo: string }
  /** O envio falhou ANTES de sair (a Evolution recusou ou não respondeu). */
  | { tipo: "falhou"; motivo: string };

/**
 * O que cada acontecimento faz com a sequência.
 *
 * - Falha de envio tenta UMA vez mais, no minuto seguinte, passando de novo
 *   pela conferência (que descarta se já estiver atrasada). Na segunda falha a
 *   etapa é descartada.
 * - A despedida encerra a sequência mesmo que sobre etapa depois dela.
 */
export function depoisDe(e: EstadoDaSequencia, ev: EventoDaSequencia): EstadoDaSequencia {
  switch (ev.tipo) {
    case "enviou": {
      const seguinte = avancar(e, ev.mecanismo);
      return ev.mecanismo === "BREAKUP"
        ? { ...seguinte, status: "encerrada", motivo: "despedida enviada" }
        : seguinte;
    }
    case "pulou":
      return { ...avancar(e, null), motivo: ev.motivo };
    case "cancelou":
      return { ...e, status: "cancelada", enviandoDesde: null, motivo: ev.motivo };
    case "esperar":
      return { ...e, status: "ativa", enviandoDesde: null, motivo: ev.motivo };
    case "falhou":
      return e.tentativas >= 1
        ? { ...avancar(e, null), motivo: `envio falhou duas vezes: ${ev.motivo}` }
        : {
            ...e,
            status: "ativa",
            tentativas: e.tentativas + 1,
            enviandoDesde: null,
            motivo: ev.motivo,
          };
  }
}

/** Etapa presa em "enviando" há muito tempo: descartada, nunca reenviada. */
export function soltarSePresa(e: EstadoDaSequencia, agora: Date): EstadoDaSequencia | null {
  if (e.status !== "enviando" || !e.enviandoDesde) return null;
  const minutos = (agora.getTime() - new Date(e.enviandoDesde).getTime()) / 60_000;
  if (minutos < PRESA_DEPOIS_DE_MIN) return null;
  return { ...avancar(e, null), motivo: "etapa ficou presa no envio; não reenviada" };
}

/** A sequência que nasce. `null` quando a trilha não tem etapa para planejar. */
export function novaSequencia(plano: EtapaPlanejada[]): EstadoDaSequencia | null {
  if (!plano.length) return null;
  return {
    status: "ativa",
    passo: 0,
    plano,
    mecanismos: [],
    tentativas: 0,
    enviandoDesde: null,
    motivo: null,
  };
}

// ── Figurinhas aprovadas ────────────────────────────────────────────────

/** Uma figurinha que a clínica aprovou para a quebra de padrão. O arquivo é
 *  o que `wa-midia` decifrou e guardou no depósito. */
export interface FigurinhaAprovada {
  /** O id da mensagem do WhatsApp em que ela chegou. */
  id: string;
  path: string;
  mimetype: string;
  animada: boolean;
}

/** As trilhas em que figurinha cabe. Fora delas a conversa tem preço,
 *  objeção, pedido de tempo ou etapa de fechamento, e figurinha soa como
 *  descaso. */
const TRILHAS_COM_FIGURINHA: readonly Trilha[] = [
  "INITIAL_NO_RESPONSE",
  "ACTIVE_CONVERSATION_DROP",
  "SCHEDULE_IGNORED",
];

/** Dá para usar figurinha nesta etapa? Uma por sequência, no máximo. */
export function podeUsarFigurinha(p: {
  trilha: Trilha;
  usados: readonly Mecanismo[];
  aprovadas: readonly FigurinhaAprovada[];
}): boolean {
  return (
    p.aprovadas.length > 0 &&
    TRILHAS_COM_FIGURINHA.includes(p.trilha) &&
    !p.usados.includes("PATTERN_INTERRUPT")
  );
}

/**
 * Qual figurinha mandar. Uma que esta pessoa ainda não recebeu, quando
 * houver; e sorteada, para duas pessoas do mesmo anúncio não receberem a
 * mesma. `sorteio` entre 0 e 1 entra de fora, para o teste fixar.
 */
export function escolherFigurinha(
  aprovadas: readonly FigurinhaAprovada[],
  jaRecebidas: readonly string[],
  sorteio: number,
): FigurinhaAprovada | null {
  if (!aprovadas.length) return null;
  const novas = aprovadas.filter((f) => !jaRecebidas.includes(f.id));
  const lista = novas.length ? novas : aprovadas;
  const i = Math.min(lista.length - 1, Math.max(0, Math.floor(sorteio * lista.length)));
  return lista[i];
}

/** A lista como o banco guarda (`ai_agents.recovery_figurinhas`), limpa. */
export function figurinhasAprovadas(bruto: unknown): FigurinhaAprovada[] {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .filter((f) => f && typeof f === "object" && typeof f.path === "string" && f.path)
    .map((f) => ({
      id: String(f.id ?? f.path),
      path: String(f.path),
      mimetype: typeof f.mimetype === "string" && f.mimetype ? f.mimetype : "image/webp",
      animada: f.animada === true,
    }));
}
