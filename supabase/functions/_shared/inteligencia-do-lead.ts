// A Inteligência do Lead: em que ponto a conversa está, quanto ela vale e
// quanto merece atenção agora.
//
// ── O que a clínica pediu (30/10) ─────────────────────────────────────────
//
// "Um funil de vendas que se organiza sozinho, sabe quais leads ficaram pra
// trás e quanto eles valiam, sabe quais avançaram." Até aqui o funil de Leads
// só sabia QUANDO a pessoa falou pela última vez (e se tinha horário na
// agenda). Os 256 de "Conversando" estavam juntos: quem só deu "oi", quem já
// recebeu o valor e quem pediu horário.
//
// ── A fronteira que define este arquivo ───────────────────────────────────
//
// **O modelo lê; o código afirma.** A mesma de `olho-de-deus.ts` e de
// `agendamento-da-ia.ts`. O modelo diz o que entendeu da conversa e cita o
// número da mensagem que comprova; o código confere antes de acreditar:
//
//   - preço só vale se o número aparece mesmo numa mensagem;
//   - procedimento só vale se é um código do catálogo da clínica;
//   - "Proposta" só vale se a clínica falou valor; "Horário oferecido" só vale
//     se a clínica mandou um dia com hora (`valor-antes-do-horario.ts`);
//   - a etapa nunca volta para trás numa releitura;
//   - "Agendado" e "Não compareceu" nunca saem daqui: quem diz é a agenda.
//
// A nota (0 a 100) é conta de código sobre o que foi conferido, com pesos à
// vista. Uma nota que o modelo chuta não se explica, e uma nota que não se
// explica ninguém usa.
//
// ── O que NÃO acontece aqui ──────────────────────────────────────────────
//
// Nada é enviado a ninguém e nada muda na agenda. A leitura organiza o quadro
// para uma pessoa decidir.

import { informaValor, ofereceHorario } from "./valor-antes-do-horario.ts";

// ── Vocabulário ─────────────────────────────────────────────────────────────

/** As etapas que a CONVERSA prova. As da agenda ficam no funil. */
export type EtapaDaConversa = "novo" | "interessado" | "proposta" | "horario_oferecido";

export const ETAPAS_DA_CONVERSA: EtapaDaConversa[] = [
  "novo",
  "interessado",
  "proposta",
  "horario_oferecido",
];

export type Intencao = "desconhecida" | "curiosidade" | "comercial" | "declarada" | "acao";
export type Urgencia = "desconhecida" | "imediata" | "curto" | "medio" | "longo";
export type Objecao =
  | "nenhuma"
  | "preco"
  | "parcelamento"
  | "medo"
  | "distancia"
  | "tempo"
  | "confianca"
  | "outra";
export type Cidade = "desconhecida" | "atendida" | "fora";

/** O que a agenda diz da pessoa. Vence qualquer leitura de conversa. */
export type SituacaoNaAgenda = "agendado" | "nao_compareceu" | null;

const INTENCOES: Intencao[] = ["desconhecida", "curiosidade", "comercial", "declarada", "acao"];
const URGENCIAS: Urgencia[] = ["desconhecida", "imediata", "curto", "medio", "longo"];
const OBJECOES: Objecao[] = [
  "nenhuma",
  "preco",
  "parcelamento",
  "medo",
  "distancia",
  "tempo",
  "confianca",
  "outra",
];
const CIDADES: Cidade[] = ["desconhecida", "atendida", "fora"];

export const NOME_DA_OBJECAO: Record<Objecao, string> = {
  nenhuma: "",
  preco: "preço",
  parcelamento: "parcelamento",
  medo: "medo do procedimento",
  distancia: "distância",
  tempo: "falta de tempo",
  confianca: "confiança",
  outra: "dúvida",
};

// ── O telefone ──────────────────────────────────────────────────────────────

/**
 * A forma canônica de um telefone brasileiro.
 *
 * ⚠️ Gêmea de `public.fone_canonico` (migration 20261015120000). É por ela que
 * a leitura gravada aqui casa com a linha de `lead_funnel_signals`: se as duas
 * divergirem, o lead aparece no quadro sem nota nenhuma.
 */
export function foneCanonico(bruto: string | null | undefined): string | null {
  let x = String(bruto ?? "").replace(/\D/g, "");
  if (x.length === 10 || x.length === 11) x = `55${x}`;
  if (x.length === 13 && /^9[6-9]$/.test(x.slice(4, 6))) return x.slice(0, 4) + x.slice(5);
  if (x.length === 12 || x.length === 13) return x;
  return null;
}

// ── O catálogo e a conversa ─────────────────────────────────────────────────

export interface ProcedimentoDaClinica {
  id: string;
  nome: string;
  preco: number | null;
  /** "A partir de": o valor da tabela é piso, não preço fechado. */
  aPartirDe: boolean;
}

export interface ProcedimentoComCodigo extends ProcedimentoDaClinica {
  codigo: string;
}

/** Cabe na instrução sem virar o maior pedaço dela. */
export const MAXIMO_DE_PROCEDIMENTOS = 120;

/** Os procedimentos com código curto (`PR1`, `PR2`...). O id do banco não vai
 *  para o modelo: um id inventado parecido passaria por id de verdade. */
export function catalogoDeProcedimentos(lista: ProcedimentoDaClinica[]): ProcedimentoComCodigo[] {
  const saida: ProcedimentoComCodigo[] = [];
  for (const p of lista) {
    const nome = String(p?.nome ?? "").trim();
    if (!p?.id || !nome) continue;
    if (saida.length >= MAXIMO_DE_PROCEDIMENTOS) break;
    const preco = Number(p.preco);
    saida.push({
      id: String(p.id),
      nome,
      preco: Number.isFinite(preco) && preco > 0 ? preco : null,
      aPartirDe: !!p.aPartirDe,
      codigo: `PR${saida.length + 1}`,
    });
  }
  return saida;
}

export interface MensagemDaConversa {
  id: string;
  daClinica: boolean;
  texto: string;
  em: string;
}

/** Como a mensagem aparece para o modelo: com o número que ele cita. */
export function transcricaoNumerada(msgs: MensagemDaConversa[]): string {
  return msgs
    .map((m, i) => {
      const quando = m.em ? m.em.slice(5, 16).replace("T", " ") : "";
      const quem = m.daClinica ? "CLÍNICA" : "PESSOA";
      return `[${i + 1}] ${quem} (${quando}): ${m.texto.slice(0, 600)}`;
    })
    .join("\n");
}

// ── O que o modelo devolve ──────────────────────────────────────────────────

export const FORMATO_DA_LEITURA_DO_LEAD = {
  type: "json_schema" as const,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "etapa",
      "procedimento",
      "valor",
      "intencao",
      "urgencia",
      "objecao",
      "objecao_resolvida",
      "cidade",
      "porque",
      "proxima_acao",
      "evidencias",
    ],
    properties: {
      etapa: { type: "string", enum: [...ETAPAS_DA_CONVERSA] },
      /** Código PR do catálogo, ou "". */
      procedimento: { type: "string" },
      /** O valor em reais que a CLÍNICA disse para o procedimento, como está
       *  escrito ("1.500", "399,90"), ou "". */
      valor: { type: "string" },
      intencao: { type: "string", enum: [...INTENCOES] },
      urgencia: { type: "string", enum: [...URGENCIAS] },
      objecao: { type: "string", enum: [...OBJECOES] },
      objecao_resolvida: { type: "boolean" },
      cidade: { type: "string", enum: [...CIDADES] },
      porque: { type: "string" },
      proxima_acao: { type: "string" },
      evidencias: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["fato", "mensagem"],
          properties: { fato: { type: "string" }, mensagem: { type: "integer" } },
        },
      },
    },
  },
};

/** A instrução, com o catálogo e onde a clínica atende. */
export function instrucaoDaLeitura(p: {
  clinica: string;
  ondeAtende: string[];
  catalogo: ProcedimentoComCodigo[];
}): string {
  const procedimentos = p.catalogo.length
    ? p.catalogo
        .map((c) => {
          const preco = c.preco
            ? ` · ${c.aPartirDe ? "a partir de " : ""}R$ ${c.preco.toFixed(2).replace(".", ",")}`
            : "";
          return `${c.codigo} · ${c.nome}${preco}`;
        })
        .join("\n")
    : "(a clínica não cadastrou procedimentos)";
  const onde = p.ondeAtende.length ? p.ondeAtende.join("; ") : "(não informado)";
  return [
    `Você lê conversas de WhatsApp entre a clínica "${p.clinica}" e uma pessoa interessada, e registra em que ponto a negociação está. Você não responde ninguém.`,
    "",
    "As mensagens vêm numeradas. CLÍNICA é quem atende (assistente ou equipe); PESSOA é o lead.",
    "",
    "Regras:",
    '- Só registre o que a conversa MOSTRA. Na dúvida, o valor mais baixo/neutro (etapa anterior, intenção "desconhecida", urgência "desconhecida", cidade "desconhecida").',
    "- etapa:",
    '  "novo" = a pessoa ainda não disse o que quer;',
    '  "interessado" = disse o procedimento ou o problema que quer resolver;',
    '  "proposta" = a CLÍNICA informou valor, mandou tabela/orçamento, ou explicou que o valor sai na avaliação;',
    '  "horario_oferecido" = a CLÍNICA ofereceu dia e hora para a pessoa vir.',
    "  A etapa é o ponto mais avançado que JÁ aconteceu, mesmo que a pessoa tenha sumido depois.",
    '- procedimento: o código PR da lista abaixo que a pessoa quer. Nenhum serve → "".',
    '- valor: o valor em reais que a CLÍNICA disse para esse procedimento, copiado como está na mensagem ("1.500", "399,90"). Não calcule, não use a tabela, não use valor dito pela pessoa. Nenhum → "".',
    "- intencao: curiosidade (só quer saber como funciona), comercial (perguntou preço/condição), declarada (disse que quer fazer), acao (pediu horário, escolheu dia, pediu para reservar).",
    "- urgencia: imediata (hoje, amanhã, esta semana), curto (este mês), medio (1 a 3 meses), longo (mais que isso), desconhecida.",
    "- objecao: o que segura a pessoa, se ela disse. objecao_resolvida = a clínica respondeu e a pessoa seguiu.",
    `- cidade: "atendida" se a pessoa está numa cidade/região onde a clínica atende, "fora" se disse que está longe, senão "desconhecida". A clínica atende em: ${onde}.`,
    "- porque: uma ou duas frases simples, em português, explicando o ponto da negociação. Sem o nome da pessoa.",
    "- proxima_acao: a próxima coisa que a clínica deveria fazer, em até 12 palavras, começando com verbo.",
    "- evidencias: até 5 fatos curtos, cada um com o NÚMERO da mensagem que o comprova.",
    "",
    "Procedimentos da clínica:",
    procedimentos,
  ].join("\n");
}

/** A pergunta: a leitura anterior (para não esquecer o começo) e as mensagens. */
export function perguntaDaLeitura(anterior: LeituraDoLead | null, transcricao: string): string {
  const antes = anterior
    ? `Leitura anterior desta pessoa: etapa ${anterior.etapa}${anterior.procedimentoNome ? `, procedimento ${anterior.procedimentoNome}` : ""}${anterior.valor ? `, valor R$ ${anterior.valor}` : ""}. ${anterior.porque}\n\n`
    : "";
  return `${antes}Conversa (as mais recentes no fim):\n${transcricao}`;
}

// ── A conferência ───────────────────────────────────────────────────────────

export interface Evidencia {
  fato: string;
  mensagemId: string;
}

export interface LeituraDoLead {
  etapa: EtapaDaConversa;
  procedimentoId: string | null;
  procedimentoNome: string | null;
  /** Em reais. */
  valor: number | null;
  /** De onde veio o valor: dito na conversa ou o da tabela do procedimento. */
  valorFonte: "conversa" | "tabela" | null;
  valorAPartirDe: boolean;
  intencao: Intencao;
  urgencia: Urgencia;
  objecao: Objecao;
  objecaoResolvida: boolean;
  cidade: Cidade;
  porque: string;
  proximaAcao: string;
  evidencias: Evidencia[];
}

function umDe<T extends string>(valor: unknown, lista: readonly T[], padrao: T): T {
  return lista.includes(valor as T) ? (valor as T) : padrao;
}

function texto(valor: unknown, limite: number): string {
  return String(valor ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limite);
}

/** "1.500", "1500,00", "R$ 399,90", "399" → número. Ilegível → null. */
export function reaisDoTexto(bruto: unknown): number | null {
  if (typeof bruto === "number") return Number.isFinite(bruto) && bruto > 0 ? bruto : null;
  const t = String(bruto ?? "")
    .replace(/r\$|\s/gi, "")
    .trim();
  if (!t) return null;
  let n: number;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) n = Number(t.replace(/\./g, "").replace(",", "."));
  else if (/^\d+(,\d{1,2})?$/.test(t)) n = Number(t.replace(",", "."));
  else if (/^\d+(\.\d{1,2})?$/.test(t)) n = Number(t);
  else return null;
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** Os valores em reais escritos num texto, já como número. */
function valoresNoTexto(texto: string): number[] {
  const achados = texto.match(/\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?/g) ?? [];
  return achados.map(reaisDoTexto).filter((n): n is number => n !== null);
}

/** O valor aparece mesmo numa mensagem da clínica? É o que impede o modelo de
 *  inventar um preço plausível. */
export function valorDitoPelaClinica(valor: number, msgs: MensagemDaConversa[]): boolean {
  return msgs.some(
    (m) => m.daClinica && valoresNoTexto(m.texto).some((v) => Math.abs(v - valor) < 0.01),
  );
}

function maisAvancada(a: EtapaDaConversa, b: EtapaDaConversa): EtapaDaConversa {
  return ETAPAS_DA_CONVERSA.indexOf(a) >= ETAPAS_DA_CONVERSA.indexOf(b) ? a : b;
}

/**
 * A leitura do modelo, conferida contra a conversa e o catálogo.
 *
 * `anterior` é a leitura gravada antes: a etapa nunca recua, e o que a
 * conversa já provou (procedimento, valor) não se perde porque a mensagem que
 * provava saiu da janela das últimas.
 */
export function leituraConferida(
  bruto: unknown,
  msgs: MensagemDaConversa[],
  catalogo: ProcedimentoComCodigo[],
  anterior: LeituraDoLead | null,
): LeituraDoLead {
  // deno-lint-ignore no-explicit-any
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as any;

  const item = catalogo.find((c) => c.codigo === String(b.procedimento ?? "").trim()) ?? null;
  const procedimentoId = item?.id ?? anterior?.procedimentoId ?? null;
  const procedimentoNome = item ? item.nome : (anterior?.procedimentoNome ?? null);
  const doCatalogo = catalogo.find((c) => c.id === procedimentoId) ?? null;

  // O valor: o que a clínica disse, se o número existe numa mensagem dela;
  // senão o que já tinha sido provado antes; senão o da tabela.
  let valor: number | null = null;
  let valorFonte: LeituraDoLead["valorFonte"] = null;
  let valorAPartirDe = false;
  const dito = reaisDoTexto(b.valor);
  if (dito !== null && valorDitoPelaClinica(dito, msgs)) {
    valor = dito;
    valorFonte = "conversa";
  } else if (anterior?.valorFonte === "conversa" && anterior.valor) {
    valor = anterior.valor;
    valorFonte = "conversa";
  } else if (doCatalogo?.preco) {
    valor = doCatalogo.preco;
    valorFonte = "tabela";
    valorAPartirDe = doCatalogo.aPartirDe;
  }

  // A etapa: a do modelo, rebaixada quando a conversa não comprova.
  const daClinica = msgs.filter((m) => m.daClinica).map((m) => m.texto);
  const temDaPessoa = msgs.some((m) => !m.daClinica);
  let etapa = umDe(b.etapa, ETAPAS_DA_CONVERSA, "novo");
  if (etapa === "horario_oferecido" && !daClinica.some(ofereceHorario)) etapa = "proposta";
  if (etapa === "proposta" && !daClinica.some(informaValor) && valorFonte !== "conversa") {
    etapa = "interessado";
  }
  if (etapa === "interessado" && !temDaPessoa) etapa = "novo";
  if (anterior) etapa = maisAvancada(etapa, anterior.etapa);

  const evidencias: Evidencia[] = [];
  for (const e of Array.isArray(b.evidencias) ? b.evidencias : []) {
    const n = Number(e?.mensagem);
    const fato = texto(e?.fato, 120);
    if (!fato || !Number.isInteger(n) || n < 1 || n > msgs.length) continue;
    evidencias.push({ fato, mensagemId: msgs[n - 1].id });
    if (evidencias.length >= 5) break;
  }

  const objecao = umDe(b.objecao, OBJECOES, "nenhuma");
  return {
    etapa,
    procedimentoId,
    procedimentoNome,
    valor,
    valorFonte,
    valorAPartirDe,
    intencao: umDe(b.intencao, INTENCOES, "desconhecida"),
    urgencia: umDe(b.urgencia, URGENCIAS, "desconhecida"),
    objecao,
    objecaoResolvida: objecao === "nenhuma" ? false : b.objecao_resolvida === true,
    cidade: umDe(b.cidade, CIDADES, "desconhecida"),
    porque: texto(b.porque, 320) || anterior?.porque || "",
    proximaAcao: texto(b.proxima_acao, 140),
    evidencias,
  };
}

/** Uma leitura gravada no banco de volta. Formato estragado → `null`, e o
 *  lead é relido como novo em vez de quebrar o quadro. */
export function leituraGuardada(bruto: unknown): LeituraDoLead | null {
  if (!bruto || typeof bruto !== "object") return null;
  // deno-lint-ignore no-explicit-any
  const b = bruto as any;
  if (!ETAPAS_DA_CONVERSA.includes(b.etapa)) return null;
  return {
    etapa: b.etapa,
    procedimentoId: b.procedimentoId ?? null,
    procedimentoNome: b.procedimentoNome ?? null,
    valor: typeof b.valor === "number" && b.valor > 0 ? b.valor : null,
    valorFonte: b.valorFonte === "conversa" || b.valorFonte === "tabela" ? b.valorFonte : null,
    valorAPartirDe: !!b.valorAPartirDe,
    intencao: umDe(b.intencao, INTENCOES, "desconhecida"),
    urgencia: umDe(b.urgencia, URGENCIAS, "desconhecida"),
    objecao: umDe(b.objecao, OBJECOES, "nenhuma"),
    objecaoResolvida: !!b.objecaoResolvida,
    cidade: umDe(b.cidade, CIDADES, "desconhecida"),
    porque: texto(b.porque, 320),
    proximaAcao: texto(b.proximaAcao, 140),
    evidencias: Array.isArray(b.evidencias)
      ? b.evidencias
          .filter((e: Evidencia) => e && typeof e.fato === "string" && e.mensagemId)
          .slice(0, 5)
      : [],
  };
}

// ── O ritmo: engajamento sem modelo ─────────────────────────────────────────

export interface Ritmo {
  daPessoa: number;
  daClinica: number;
  perguntasDaPessoa: number;
  /** A pessoa voltou a escrever depois de mais de um dia calada. */
  voltou: boolean;
  /** A última mensagem foi da pessoa: a bola está com a clínica. */
  ultimaFoiDaPessoa: boolean;
  ultimaEm: string | null;
}

export function ritmoDaConversa(msgs: MensagemDaConversa[]): Ritmo {
  let voltou = false;
  let anteriorEm: number | null = null;
  for (const m of msgs) {
    const t = new Date(m.em).getTime();
    if (!m.daClinica && anteriorEm !== null && t - anteriorEm > 86_400_000) voltou = true;
    if (Number.isFinite(t)) anteriorEm = t;
  }
  const ultima = msgs[msgs.length - 1] ?? null;
  return {
    daPessoa: msgs.filter((m) => !m.daClinica).length,
    daClinica: msgs.filter((m) => m.daClinica).length,
    perguntasDaPessoa: msgs.filter((m) => !m.daClinica && m.texto.includes("?")).length,
    voltou,
    ultimaFoiDaPessoa: ultima ? !ultima.daClinica : false,
    ultimaEm: ultima?.em ?? null,
  };
}

// ── A nota ──────────────────────────────────────────────────────────────────

/**
 * Os pesos, à vista. Somam 100.
 *
 * Primeira versão, sem calibrar: o histórico (`lead_inteligencia_historico`)
 * existe para, com uns meses de dados, comparar a nota com quem agendou e veio
 * e ajustar estes números com o que aconteceu de verdade na clínica.
 */
export const PESOS = { perfil: 20, intencao: 30, engajamento: 15, avanco: 25, urgencia: 10 };

/** O que a conversa ainda não disse não tira ponto: vale o meio. */
const PONTOS_DA_INTENCAO: Record<Intencao, number> = {
  desconhecida: 8,
  curiosidade: 8,
  comercial: 16,
  declarada: 24,
  acao: 30,
};
const PONTOS_DA_URGENCIA: Record<Urgencia, number> = {
  desconhecida: 4,
  imediata: 10,
  curto: 7,
  medio: 4,
  longo: 2,
};
const PONTOS_DO_AVANCO: Record<EtapaDaConversa, number> = {
  novo: 0,
  interessado: 8,
  proposta: 15,
  horario_oferecido: 20,
};

/** Fora da região que a clínica atende, a nota não passa disto: interesse
 *  alto de quem não pode vir não é oportunidade. */
export const TETO_FORA_DA_REGIAO = 30;

export interface NotaDoLead {
  total: number;
  partes: {
    perfil: number;
    intencao: number;
    engajamento: number;
    avanco: number;
    urgencia: number;
  };
  /** Frases curtas do que mais pesou, para o card dizer o porquê. */
  motivos: string[];
}

export function notaDoLead(
  leitura: LeituraDoLead | null,
  ritmo: Ritmo | null,
  agenda: SituacaoNaAgenda,
): NotaDoLead {
  const motivos: string[] = [];

  let perfil = 10;
  if (leitura) {
    perfil = leitura.cidade === "atendida" ? 10 : leitura.cidade === "fora" ? 0 : 5;
    perfil += leitura.procedimentoId ? 10 : 5;
    if (leitura.cidade === "fora") motivos.push("Fora da região atendida");
    if (leitura.procedimentoNome) motivos.push(`Quer ${leitura.procedimentoNome}`);
  }

  const intencao = PONTOS_DA_INTENCAO[leitura?.intencao ?? "desconhecida"];
  if (leitura?.intencao === "acao") motivos.push("Pediu horário");
  else if (leitura?.intencao === "declarada") motivos.push("Disse que quer fazer");
  else if (leitura?.intencao === "comercial") motivos.push("Perguntou preço ou condição");

  let engajamento = 0;
  if (ritmo) {
    engajamento += ritmo.daPessoa >= 4 ? 8 : ritmo.daPessoa >= 2 ? 6 : ritmo.daPessoa === 1 ? 3 : 0;
    if (ritmo.perguntasDaPessoa > 0) engajamento += 3;
    if (ritmo.voltou) {
      engajamento += 4;
      motivos.push("Voltou a escrever");
    }
    engajamento = Math.min(PESOS.engajamento, engajamento);
  }

  let avanco = PONTOS_DO_AVANCO[leitura?.etapa ?? "novo"];
  if (agenda === "agendado") {
    avanco = PESOS.avanco;
    motivos.push("Tem horário marcado");
  } else if (agenda === "nao_compareceu") {
    avanco = 12;
    motivos.push("Não compareceu");
  } else if (leitura?.etapa === "horario_oferecido") motivos.push("Recebeu horários");
  else if (leitura?.etapa === "proposta") motivos.push("Recebeu o valor");

  const urgencia = PONTOS_DA_URGENCIA[leitura?.urgencia ?? "desconhecida"];
  if (leitura?.urgencia === "imediata") motivos.push("Quer para já");

  if (leitura && leitura.objecao !== "nenhuma" && !leitura.objecaoResolvida) {
    motivos.push(`Objeção: ${NOME_DA_OBJECAO[leitura.objecao]}`);
  }

  let total = perfil + intencao + engajamento + avanco + urgencia;
  if (leitura?.cidade === "fora") total = Math.min(total, TETO_FORA_DA_REGIAO);
  return {
    total: Math.max(0, Math.min(100, total)),
    partes: { perfil, intencao, engajamento, avanco, urgencia },
    motivos: motivos.slice(0, 4),
  };
}

export type Faixa = "quente" | "morno" | "frio";

export function faixaDaNota(total: number): Faixa {
  return total >= 70 ? "quente" : total >= 40 ? "morno" : "frio";
}

// ── O risco: separado da nota ───────────────────────────────────────────────

export interface Risco {
  nivel: "alto" | "medio" | "baixo";
  motivo: string | null;
}

/** Horas com a bola na mão da clínica até virar alerta. */
export const HORAS_ESPERANDO_A_CLINICA = 2;
/** Dias calado depois de proposta ou horário até virar alerta. */
export const DIAS_SUMIU_DEPOIS_DA_PROPOSTA = 2;
/** Depois disso é "parado", não risco: o alerta vira a marca do card. */
export const DIAS_PARA_PARADO = 7;

/**
 * Um lead nota 90 parado há dois dias é ótimo lead e operação ruim. Misturar
 * as duas coisas numa nota só esconde se o problema é o cliente ou o
 * atendimento — por isso o risco é à parte.
 */
export function riscoDoLead(
  leitura: LeituraDoLead | null,
  ritmo: Ritmo | null,
  agenda: SituacaoNaAgenda,
  agora: Date,
): Risco {
  if (agenda === "nao_compareceu") return { nivel: "medio", motivo: "Não compareceu: remarcar" };
  if (agenda === "agendado") return { nivel: "baixo", motivo: null };

  const ultima = ritmo?.ultimaEm ? new Date(ritmo.ultimaEm).getTime() : NaN;
  const horas = Number.isFinite(ultima) ? (agora.getTime() - ultima) / 3_600_000 : null;
  if (horas !== null && horas / 24 > DIAS_PARA_PARADO) return { nivel: "baixo", motivo: null };

  if (ritmo?.ultimaFoiDaPessoa && horas !== null && horas >= HORAS_ESPERANDO_A_CLINICA) {
    const quanto = horas >= 48 ? `${Math.floor(horas / 24)} dias` : `${Math.floor(horas)}h`;
    return { nivel: "alto", motivo: `Esperando resposta da clínica há ${quanto}` };
  }
  if (leitura && leitura.objecao !== "nenhuma" && !leitura.objecaoResolvida) {
    return {
      nivel: "medio",
      motivo: `Objeção de ${NOME_DA_OBJECAO[leitura.objecao]} sem resposta`,
    };
  }
  if (
    leitura &&
    (leitura.etapa === "proposta" || leitura.etapa === "horario_oferecido") &&
    !ritmo?.ultimaFoiDaPessoa &&
    horas !== null &&
    horas / 24 >= DIAS_SUMIU_DEPOIS_DA_PROPOSTA
  ) {
    return {
      nivel: "medio",
      motivo: leitura.etapa === "proposta" ? "Sumiu depois do valor" : "Sumiu depois dos horários",
    };
  }
  return { nivel: "baixo", motivo: null };
}
