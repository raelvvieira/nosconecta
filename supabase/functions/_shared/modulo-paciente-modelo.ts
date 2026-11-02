// O módulo Paciente Modelo HOF: os dados da edição, prontos para a Luna.
//
// ── Três camadas, cada uma com um dono ───────────────────────────────────
//
//   Luna V4.2 (o manual da clínica)  como ela conversa, qualifica e vende;
//   MD Paciente Modelo HOF V1        como vender a vaga da mentoria
//                                    (`agente_modulos.manual`);
//   Este arquivo                     o que está à venda AGORA, lido do CRM.
//
// A seção que sai daqui é só DADOS: edição, local, horários com vaga,
// ofertas, sinal e políticas, Pix, equipe, casos, FAQ, e o que está
// bloqueado. O comportamento é todo da MD. Duas instruções dizendo a mesma
// coisa de jeitos diferentes fazem o modelo escolher uma ao acaso.
//
// Só entra numa conversa de paciente modelo, com o módulo ligado (ou na tela
// Testar, com o módulo "só no teste"). Módulo puro, com
// `tests/modulo-paciente-modelo.ts`.

export type EstadoDoModulo = "desligado" | "teste" | "ligado";

export type StatusDaEdicao =
  | "rascunho"
  | "publicada"
  | "inscricoes_abertas"
  | "esgotada"
  | "encerrada"
  | "cancelada";

export interface PraticaDaEdicao {
  id: string;
  /** AAAA-MM-DD */
  data: string;
  horaInicio: string | null;
  horaFim: string | null;
  /** Minutos de cada atendimento. Os horários saem de início a fim, nesse passo. */
  duracaoMin: number;
  /** Pacientes atendidos ao mesmo tempo em cada horário. */
  vagas: number;
  /** Reservas que ocupam vaga, por horário "HH:MM". Sem horário: chave "". */
  ocupadas: Record<string, number>;
  observacao?: string | null;
}

export interface OfertaDaEdicao {
  id: string;
  nome: string;
  descricao: string | null;
  ml: number | null;
  precoVista: number;
  precoParcelado: number | null;
  parcelasMax: number | null;
  tipo: "procedimento" | "combo";
  destaque: boolean;
}

export interface EdicaoDoModulo {
  id: string;
  nome: string;
  cidade: string | null;
  endereco: string | null;
  inicio: string | null;
  fim: string | null;
  status: StatusDaEdicao;
  observacoes: string | null;
  orientacoesChegada?: string | null;
  praticas: PraticaDaEdicao[];
  ofertas: OfertaDaEdicao[];
}

export type Abatimento = "sim" | "nao" | "indefinido";

export interface ConfigDoModulo {
  sinal: {
    valor: number;
    /** "indefinido" bloqueia a cobrança (MD, 12.11). */
    abatido: Abatimento;
    prazoHoras: number;
  };
  /**
   * O Pix do sinal: a chave que a Luna manda e o nome de quem recebe, para a
   * pessoa conferir no banco. Sem chave ou sem nome, a cobrança fica travada.
   */
  pix: { chave: string; titular: string };
  pagamento: { formas: string[]; parcelasMax: number; boleto: boolean };
  politicas: {
    /** Contraindicação no dia: o que acontece com o sinal. */
    contraindicacao: string;
    falta: string;
    cancelamento: string;
    remarcacao: string;
  };
  /** Texto extra sobre a responsável, além do cadastro de profissionais. */
  credenciais: string;
  instagram: { nome: string; url: string }[];
  fotos: string;
  retornoDias: number | null;
  faq: { pergunta: string; resposta: string }[];
  listaDeInteresse: boolean;
}

export const CONFIG_PADRAO: ConfigDoModulo = {
  sinal: { valor: 150, abatido: "indefinido", prazoHoras: 24 },
  pix: { chave: "", titular: "" },
  pagamento: { formas: ["pix", "cartao", "cartao_parcelado"], parcelasMax: 4, boleto: false },
  politicas: { contraindicacao: "", falta: "", cancelamento: "", remarcacao: "" },
  credenciais: "",
  instagram: [],
  fotos: "",
  retornoDias: null,
  faq: [],
  listaDeInteresse: true,
};

function txt(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function num(v: unknown, padrao: number): number {
  return v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v))
    ? Number(v)
    : padrao;
}

/** A configuração como a tela e a Luna a leem: o que vier torto cai no padrão. */
export function configDoModulo(bruto: unknown): ConfigDoModulo {
  const c = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, any>;
  const s = (c.sinal && typeof c.sinal === "object" ? c.sinal : {}) as Record<string, unknown>;
  const p = (c.pagamento && typeof c.pagamento === "object" ? c.pagamento : {}) as Record<
    string,
    unknown
  >;
  const pol = (c.politicas && typeof c.politicas === "object" ? c.politicas : {}) as Record<
    string,
    unknown
  >;
  // `abatido` era booleano na primeira versão, com `false` posto por padrão
  // e não por decisão da clínica. Só `true` vira decisão; o resto, indefinido.
  const abatido: Abatimento =
    s.abatido === "sim" || s.abatido === true ? "sim" : s.abatido === "nao" ? "nao" : "indefinido";
  return {
    sinal: {
      valor: num(s.valor, CONFIG_PADRAO.sinal.valor),
      abatido,
      prazoHoras: num(s.prazoHoras, CONFIG_PADRAO.sinal.prazoHoras),
    },
    pix: {
      chave: txt(c.pix?.chave),
      titular: txt(c.pix?.titular),
    },
    pagamento: {
      formas: Array.isArray(p.formas) ? p.formas.map(String) : CONFIG_PADRAO.pagamento.formas,
      parcelasMax: num(p.parcelasMax, CONFIG_PADRAO.pagamento.parcelasMax),
      boleto: p.boleto === true,
    },
    politicas: {
      contraindicacao: txt(pol.contraindicacao),
      falta: txt(pol.falta),
      // A primeira versão tinha um campo só, `cancelamento`, na raiz.
      cancelamento: txt(pol.cancelamento) || txt(c.cancelamento),
      remarcacao: txt(pol.remarcacao),
    },
    credenciais: txt(c.credenciais),
    instagram: Array.isArray(c.instagram)
      ? c.instagram
          .map((i: any) => ({ nome: txt(i?.nome), url: txt(i?.url) }))
          .filter((i: { nome: string; url: string }) => i.nome && /^https?:\/\//.test(i.url))
      : [],
    fotos: txt(c.fotos),
    retornoDias:
      c.retornoDias === null || c.retornoDias === undefined || c.retornoDias === ""
        ? null
        : num(c.retornoDias, 0),
    faq: Array.isArray(c.faq)
      ? c.faq
          .map((f: any) => ({ pergunta: txt(f?.pergunta), resposta: txt(f?.resposta) }))
          .filter((f: { pergunta: string; resposta: string }) => f.pergunta && f.resposta)
      : [],
    listaDeInteresse: c.listaDeInteresse !== false,
  };
}

// ── Datas e horários ───────────────────────────────────────────────────────

/** "2026-11-21" → "21/11". Sem `Date`: é calendário, não instante. */
export function diaCurto(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? "").trim());
  return m ? `${m[3]}/${m[2]}` : String(iso ?? "");
}

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
export function diaDaSemana(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? "").trim());
  if (!m) return "";
  // Meio-dia UTC: a data é de calendário e nenhum fuso a move de dia.
  return DIAS[new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)).getUTCDay()];
}

function minutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + (m || 0);
}
function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** Os horários de atendimento de um dia de prática: de início a fim, no passo da duração. */
export function horariosDaPratica(p: PraticaDaEdicao): string[] {
  if (!p.horaInicio || !p.horaFim) return [];
  const passo = Math.max(10, Math.trunc(p.duracaoMin || 60));
  const ini = minutos(p.horaInicio.slice(0, 5));
  const fim = minutos(p.horaFim.slice(0, 5));
  const lista: string[] = [];
  for (let t = ini; t + passo <= fim; t += passo) lista.push(hhmm(t));
  return lista;
}

export function vagasNoHorario(p: PraticaDaEdicao, hora: string): number {
  return Math.max(0, Number(p.vagas) - Number(p.ocupadas[hora] ?? 0));
}

/** Vagas que ainda sobram no dia, somando os horários. */
export function vagasRestantes(p: PraticaDaEdicao): number {
  const hs = horariosDaPratica(p);
  if (!hs.length) return Math.max(0, Number(p.vagas) - Number(p.ocupadas[""] ?? 0));
  return hs.reduce((s, h) => s + vagasNoHorario(p, h), 0);
}

function reais(n: number): string {
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// ── Qual edição está à venda ───────────────────────────────────────────────

function ultimoDia(e: EdicaoDoModulo): string | null {
  const datas = e.praticas
    .map((p) => p.data)
    .filter(Boolean)
    .sort();
  return datas.length ? datas[datas.length - 1] : e.fim;
}

function aindaVem(e: EdicaoDoModulo, hoje: string): boolean {
  const fim = ultimoDia(e);
  return !!fim && fim >= hoje;
}

export interface EdicaoVigente {
  /** A edição à venda (ou esgotada, para a Luna saber dizer que lotou). */
  aberta: EdicaoDoModulo | null;
  /** Divulgada, mas sem reserva aberta ainda. */
  publicada: EdicaoDoModulo | null;
  /**
   * Duas ou mais edições vendendo ao mesmo tempo. A MD (17.5) manda bloquear
   * a venda automática em vez de deixar a Luna escolher entre cidades.
   */
  conflito: EdicaoDoModulo[];
}

export function edicaoVigente(edicoes: EdicaoDoModulo[], hoje: string): EdicaoVigente {
  const porData = (a: EdicaoDoModulo, b: EdicaoDoModulo) =>
    String(ultimoDia(a)).localeCompare(String(ultimoDia(b)));
  const vendendo = edicoes
    .filter((e) => e.status === "inscricoes_abertas" || e.status === "esgotada")
    .filter((e) => aindaVem(e, hoje))
    .sort(porData);
  const publicadas = edicoes
    .filter((e) => e.status === "publicada" && aindaVem(e, hoje))
    .sort(porData);
  return {
    aberta: vendendo.length === 1 ? vendendo[0] : null,
    publicada: publicadas[0] ?? null,
    conflito: vendendo.length > 1 ? vendendo : [],
  };
}

/** Compatível com a primeira versão: a edição aberta, ou nenhuma. */
export function edicaoAberta(edicoes: EdicaoDoModulo[], hoje: string): EdicaoDoModulo | null {
  return edicaoVigente(edicoes, hoje).aberta;
}

// ── Os códigos desta conversa ──────────────────────────────────────────────

export interface HorarioComCodigo {
  codigo: string;
  pratica: PraticaDaEdicao;
  /** "HH:MM", ou "" quando o dia não tem horários definidos. */
  hora: string;
  vagas: number;
}

export interface CatalogoDaEdicao {
  horarios: HorarioComCodigo[];
  ofertas: { codigo: string; oferta: OfertaDaEdicao }[];
}

/** `H1`, `H2`… são os horários com vaga; `O1`, `O2`… as ofertas. */
export function catalogoDaEdicao(e: EdicaoDoModulo | null, hoje: string): CatalogoDaEdicao {
  if (!e || e.status === "esgotada") {
    return {
      horarios: [],
      ofertas: (e?.ofertas ?? []).map((oferta, i) => ({ codigo: `O${i + 1}`, oferta })),
    };
  }
  const horarios: HorarioComCodigo[] = [];
  for (const p of [...e.praticas].sort((a, b) => a.data.localeCompare(b.data))) {
    if (p.data < hoje) continue;
    const hs = horariosDaPratica(p);
    if (!hs.length) {
      const v = vagasRestantes(p);
      if (v > 0) horarios.push({ codigo: "", pratica: p, hora: "", vagas: v });
      continue;
    }
    for (const h of hs) {
      const v = vagasNoHorario(p, h);
      if (v > 0) horarios.push({ codigo: "", pratica: p, hora: h, vagas: v });
    }
  }
  return {
    horarios: horarios.map((h, i) => ({ ...h, codigo: `H${i + 1}` })),
    ofertas: e.ofertas.map((oferta, i) => ({ codigo: `O${i + 1}`, oferta })),
  };
}

export interface ReservaBruta {
  horario?: unknown;
  oferta?: unknown;
  nome?: unknown;
}

export interface ReservaPedida {
  pratica: PraticaDaEdicao;
  hora: string;
  oferta: OfertaDaEdicao | null;
  nome: string;
}

/**
 * O que a Luna devolveu vira reserva AQUI, contra o catálogo desta
 * instrução. Horário fora da lista (ou que lotou entre a oferta e o aceite)
 * não reserva nada. A oferta é opcional: a pessoa pode reservar o horário e
 * decidir o procedimento na avaliação.
 */
export function reservaPedida(
  bruto: ReservaBruta,
  catalogo: CatalogoDaEdicao,
): ReservaPedida | null {
  const cod = String(bruto?.horario ?? "")
    .trim()
    .toUpperCase();
  if (!cod) return null;
  const h = catalogo.horarios.find((x) => x.codigo === cod);
  if (!h || h.vagas <= 0) return null;
  const oc = String(bruto?.oferta ?? "")
    .trim()
    .toUpperCase();
  const o = oc ? catalogo.ofertas.find((x) => x.codigo === oc) : undefined;
  const nome = String(bruto?.nome ?? "")
    .trim()
    .slice(0, 120);
  return { pratica: h.pratica, hora: h.hora, oferta: o?.oferta ?? null, nome };
}

/** Celular, e-mail, CPF, CNPJ ou aleatória: só para a Luna dizer à pessoa. */
export function tipoDaChavePix(chave: string): string {
  const k = chave.trim();
  if (/@/.test(k)) return "e-mail";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k)) return "aleatória";
  const d = k.replace(/\D/g, "");
  if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(k)) return "CPF";
  if (d.length === 14) return "CNPJ";
  if (/^\+?[\d\s().-]+$/.test(k) && d.length >= 10 && d.length <= 13) return "celular";
  if (d.length === 11) return "CPF";
  return "chave";
}

/**
 * Celular no Pix tem 9 dígitos depois do DDD. Uma chave de celular com 8 é
 * quase sempre o 9 esquecido, e o Pix não acha a conta: avisa na tela.
 */
export function avisoDaChavePix(chave: string): string | null {
  const k = chave.trim();
  if (!k || tipoDaChavePix(k) !== "celular") return null;
  const d = k.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 10) {
    return "Celular no Pix costuma ter 9 dígitos depois do DDD. Confira se falta o 9 na frente.";
  }
  return null;
}

// ── O que ainda falta para cobrar ──────────────────────────────────────────

/**
 * O que impede a Luna de mandar a cobrança. Vazio = pode cobrar.
 *
 * A MD (12.11) é explícita: sem a regra do abatimento, sem a chave Pix e o
 * nome de quem recebe ou sem a política de falta, a Luna explica a vaga e
 * registra o interesse, mas não manda a chave.
 */
export function bloqueiosDaCobranca(c: ConfigDoModulo): string[] {
  const falta: string[] = [];
  if (c.sinal.abatido === "indefinido") falta.push("se o sinal é abatido do procedimento");
  if (!c.pix.chave) falta.push("a chave Pix do sinal");
  if (!c.pix.titular) falta.push("o nome de quem recebe o Pix");
  if (!c.politicas.falta) falta.push("a regra para quem falta");
  return falta;
}

// ── A seção ────────────────────────────────────────────────────────────────

export interface ProfissionalDaEdicao {
  nome: string;
  registro: string | null;
  especialidades: string[];
}

export interface CasoDoModulo {
  codigo: string;
  titulo: string;
  quandoUsar: string | null;
}

export interface EntradaDaSecao {
  vigente: EdicaoVigente;
  config: ConfigDoModulo;
  /** A MD especializada (seções de comportamento). */
  manual?: string | null;
  hoje: string;
  /** Quem avalia (a Dra.). */
  quem: string;
  catalogo: CatalogoDaEdicao;
  responsavel?: ProfissionalDaEdicao | null;
}

/** A proibição de sempre, para quem procura harmonização fora da vaga. */
export function secaoDeHarmonizacao(
  quem: string,
  hoje?: string,
  /** O consultório deixa informar preço de harmonização que está na tabela. */
  permitePreco = false,
): string[] {
  const data = hoje ? `${hoje.slice(8, 10)}/${hoje.slice(5, 7)}/${hoje.slice(0, 4)}` : null;
  if (permitePreco) {
    return [
      "## Harmonização facial",
      "",
      "Para harmonização facial, preenchimento ou bioestimulador, você pode",
      "informar os valores que estão na lista de preços e nas campanhas válidas,",
      "do jeito que estão escritos. O que não estiver lá, não: diga que depende",
      `da avaliação com ${quem}. Nunca dê faixa nem "a partir de" inventado.`,
      ...(data ? ["", `Hoje é ${data}.`] : []),
    ];
  }
  return [
    "## Harmonização facial",
    "",
    "Para quem procura harmonização facial, preenchimento ou bioestimulador:",
    'você NUNCA dá valor por aqui, nem faixa, nem "a partir de", nem compara',
    "com outro procedimento. O valor depende do rosto da pessoa e sai da",
    `avaliação com ${quem}. Explique o procedimento se perguntarem, e`,
    "conduza para a avaliação.",
    "",
    "As exceções são a lista de preços acima e uma campanha do seu manual com",
    "preço escrito e dentro da validade: o que está nelas, você pode informar",
    "do jeito que está escrito. O que não está, não. Campanha fora da validade",
    "não existe mais: não cite.",
    ...(data ? ["", `Hoje é ${data}.`] : []),
  ];
}

function linhaDaEdicao(e: EdicaoDoModulo): string {
  const curso =
    e.inicio && e.fim
      ? e.inicio === e.fim
        ? ` — curso em ${diaCurto(e.inicio)}`
        : ` — curso de ${diaCurto(e.inicio)} a ${diaCurto(e.fim)}`
      : "";
  return `"${e.nome}"${e.cidade ? `, em ${e.cidade}` : ""}${curso}`;
}

/**
 * A seção inteira de uma conversa de paciente modelo: a MD especializada e,
 * logo depois, os dados atuais do CRM. Tudo o que não está cadastrado vira
 * "NÃO CADASTRADO", que a MD manda tratar como desconhecido.
 */
export function secaoDoModuloPacienteModelo(x: EntradaDaSecao): string {
  const { vigente, config: c, catalogo, quem } = x;
  const e = vigente.aberta;
  const partes: string[] = [];

  partes.push(
    "# MÓDULO PACIENTE MODELO HOF",
    "",
    "Esta conversa é de PACIENTE MODELO. Você continua sendo a mesma assistente,",
    "com tudo o que está acima. O manual do módulo abaixo vale só aqui, e os",
    "DADOS ATUAIS DO CRM, no fim, mandam sobre qualquer exemplo do manual.",
    "Os preços da lista da clínica, mais acima, NÃO valem nesta conversa.",
    "",
  );

  const manual = String(x.manual ?? "").trim();
  if (manual) partes.push(manual, "");

  partes.push("# DADOS ATUAIS DO CRM (fonte de verdade desta conversa)", "");

  // ── Qual edição ─────────────────────────────────────────────────────────
  if (vigente.conflito.length) {
    partes.push(
      "## Edição: CONFLITO NO CADASTRO",
      "",
      "Há mais de uma edição com inscrições abertas: " +
        vigente.conflito.map(linhaDaEdicao).join("; ") +
        ".",
      "NÃO escolha entre elas e NÃO ofereça horário nem cobrança. Registre o",
      "interesse, diga que vai confirmar a data e encaminhe a dúvida à equipe.",
      "",
    );
    return partes.join("\n");
  }

  if (!e) {
    partes.push("## Edição: NENHUMA COM INSCRIÇÕES ABERTAS", "");
    if (vigente.publicada) {
      const p = vigente.publicada;
      partes.push(
        `A próxima edição divulgada é ${linhaDaEdicao(p)}` +
          (p.praticas.length
            ? `, com prática em ${p.praticas.map((d) => `${diaDaSemana(d.data)} ${diaCurto(d.data)}`).join(" e ")}`
            : "") +
          ". As reservas ainda NÃO abriram: informe a data e o local, mas não",
        "ofereça horário, não cite valores e não mande cobrança.",
      );
    } else {
      partes.push(
        "Não há data confirmada. NÃO use datas, preços ou condições de edições",
        "anteriores.",
      );
    }
    partes.push(
      "",
      c.listaDeInteresse
        ? 'Lista de interesse: HABILITADA. Se a pessoa aceitar ser avisada, preencha `entrarNaLista` = "sim".'
        : "Lista de interesse: desabilitada. Diga que a equipe avisa quando houver data.",
    );
    return partes.join("\n");
  }

  partes.push(`## Edição: ${e.nome}`, "");
  partes.push(`- Status: ${e.status === "esgotada" ? "VAGAS ESGOTADAS" : "inscrições abertas"}`);
  partes.push(`- Cidade: ${e.cidade || "NÃO CADASTRADA"}`);
  if (e.inicio && e.fim) {
    partes.push(
      e.inicio === e.fim
        ? `- Data da mentoria: ${diaDaSemana(e.inicio)}, ${diaCurto(e.inicio)}. Os pacientes são atendidos nos dias de prática listados abaixo.`
        : `- Datas da mentoria: de ${diaCurto(e.inicio)} a ${diaCurto(e.fim)}. Os pacientes são atendidos nos dias de prática listados abaixo, só nos horários da lista.`,
    );
  }
  partes.push(
    `- Local: ${e.endereco || "NÃO CADASTRADO — diga que vai confirmar e encaminhe; não dê o endereço de uma unidade"}`,
  );
  if (e.orientacoesChegada) partes.push(`- Orientações de chegada: ${e.orientacoesChegada}`);
  if (e.observacoes) partes.push(`- Observações da edição: ${e.observacoes}`);
  partes.push("");

  // ── Horários ────────────────────────────────────────────────────────────
  partes.push("## Horários de atendimento com vaga (só estes)", "");
  if (!catalogo.horarios.length) {
    partes.push(
      "NENHUM horário com vaga. A edição está lotada: diga isso com clareza, não",
      "ofereça encaixe" +
        (c.listaDeInteresse
          ? ' e ofereça a lista de interesse (`entrarNaLista` = "sim" se aceitar).'
          : "."),
    );
  } else {
    let diaAtual = "";
    for (const h of catalogo.horarios) {
      if (h.pratica.data !== diaAtual) {
        diaAtual = h.pratica.data;
        partes.push(
          `${diaDaSemana(diaAtual)}, ${diaCurto(diaAtual)}` +
            (h.pratica.observacao ? ` (${h.pratica.observacao})` : "") +
            ":",
        );
      }
      partes.push(
        `- ${h.codigo}: ${h.hora ? `${h.hora}` : "horário a combinar com a equipe"} — ${h.vagas} vaga${h.vagas === 1 ? "" : "s"}`,
      );
    }
    partes.push(
      "",
      'Ofereça pelo dia e hora ("sábado às 14h"), nunca pelo código. No máximo',
      "dois horários por vez, a menos que a pessoa peça mais.",
    );
  }
  partes.push("");

  // ── Ofertas ─────────────────────────────────────────────────────────────
  partes.push("## Procedimentos e valores desta edição (só estes)", "");
  if (!catalogo.ofertas.length) {
    partes.push("NENHUMA oferta cadastrada: não cite valores; diga que vai confirmar.");
  }
  for (const { codigo, oferta: o } of catalogo.ofertas) {
    const ml = o.ml ? `, ${o.ml} ml incluídos` : ", quantidade incluída NÃO CADASTRADA";
    const parc =
      o.precoParcelado && o.parcelasMax
        ? ` ou ${reais(o.precoParcelado)} em até ${o.parcelasMax}x`
        : "";
    partes.push(
      `- ${codigo}: ${o.nome}${ml}: ${reais(o.precoVista)} à vista${parc}` +
        (o.tipo === "combo" ? " (combo)" : "") +
        (o.destaque ? " — o mais escolhido" : "") +
        (o.descricao ? `. ${o.descricao.trim()}` : ""),
    );
  }
  const formas = [
    c.pagamento.formas.includes("pix") ? "Pix" : "",
    c.pagamento.formas.includes("dinheiro") ? "dinheiro" : "",
    c.pagamento.formas.includes("cartao") ? "cartão à vista" : "",
    c.pagamento.formas.includes("cartao_parcelado")
      ? `cartão parcelado em até ${c.pagamento.parcelasMax}x`
      : "",
  ].filter(Boolean);
  partes.push(
    "",
    `Pagamento do procedimento no dia: ${formas.join(", ") || "NÃO CADASTRADO"}. ${c.pagamento.boleto ? "Aceita boleto." : "Não aceita boleto."}`,
    "",
  );

  // ── Sinal e políticas ───────────────────────────────────────────────────
  partes.push("## Reserva: sinal e políticas aprovadas", "");
  partes.push(`- Sinal: ${reais(c.sinal.valor)}.`);
  partes.push(
    `- Abatimento: ${
      c.sinal.abatido === "sim"
        ? "o sinal É ABATIDO do valor do procedimento."
        : c.sinal.abatido === "nao"
          ? "o sinal NÃO é abatido; é à parte do procedimento."
          : "NÃO DEFINIDO."
    }`,
  );
  partes.push(
    `- Prazo para pagar depois de escolher o horário: ${c.sinal.prazoHoras} horas. Depois disso a vaga volta a ficar livre.`,
  );
  partes.push(
    `- Contraindicação no dia: ${c.politicas.contraindicacao || "NÃO CADASTRADO"}`,
    `- Falta: ${c.politicas.falta || "NÃO CADASTRADO"}`,
    `- Cancelamento com antecedência: ${c.politicas.cancelamento || "NÃO CADASTRADO"}`,
    `- Remarcação: ${c.politicas.remarcacao || "NÃO CADASTRADO"}`,
  );
  if (c.retornoDias) partes.push(`- Retorno: ${c.retornoDias} dias depois do procedimento.`);

  const bloqueios = bloqueiosDaCobranca(c);
  partes.push("");
  if (bloqueios.length || e.status === "esgotada") {
    partes.push(
      "### COBRANÇA BLOQUEADA",
      "",
      e.status === "esgotada"
        ? "A edição está esgotada."
        : `Falta cadastrar: ${bloqueios.join("; ")}.`,
      "NÃO mande chave Pix, link nem dado de pagamento, e não diga que a vaga está",
      "garantida. Explique a vaga, registre o horário escolhido se houver",
      "(`reservaHorario`), e diga que a equipe confirma a reserva por aqui.",
    );
  } else {
    partes.push(
      "### Pix para o sinal",
      "",
      `- Chave Pix (${tipoDaChavePix(c.pix.chave)}): ${c.pix.chave}`,
      `- Em nome de: ${c.pix.titular}`,
      "",
      "É a única chave que você manda, exatamente como está aqui. Mande a chave",
      "sozinha numa bolha, para a pessoa copiar com um toque, e diga em nome de",
      "quem está, para ela conferir no banco. Peça o comprovante. Nenhum link,",
      "CPF, outra chave ou dado bancário, nem de conversas antigas.",
    );
  }
  partes.push("");

  // ── Equipe ──────────────────────────────────────────────────────────────
  partes.push("## Quem supervisiona", "");
  const r = x.responsavel;
  if (r) {
    partes.push(
      `- ${r.nome}` +
        (r.registro ? `, registro ${r.registro}` : "") +
        (r.especialidades.length ? `, ${r.especialidades.join(", ")}` : "") +
        ". Supervisiona a prática e faz a análise facial com os alunos.",
    );
  } else {
    partes.push(`- ${quem}: supervisiona a prática e faz a análise facial com os alunos.`);
  }
  if (c.credenciais) partes.push(`- ${c.credenciais}`);
  partes.push("- Quem aplica: os alunos da mentoria, com supervisão. Não omita isso.");
  if (c.instagram.length) {
    partes.push(
      "",
      "Perfis oficiais (mande só quando ajudar na confiança, não em todo atendimento):",
    );
    for (const i of c.instagram) partes.push(`- ${i.nome}: ${i.url}`);
  }
  partes.push("");

  // ── Fotos e FAQ ─────────────────────────────────────────────────────────
  partes.push(
    "## Imagem e respostas aprovadas",
    "",
    `- Fotos e divulgação: ${c.fotos || "NÃO CADASTRADO — diga que vai confirmar a regra desta edição."}`,
  );
  for (const f of c.faq) partes.push(`- ${f.pergunta} ${f.resposta}`);
  partes.push("");

  // ── Os campos de ação ───────────────────────────────────────────────────
  partes.push(
    "## Como registrar o que aconteceu (campos da sua resposta)",
    "",
    "- `reservaHorario`: o código do horário (H1, H2…) que a pessoa ACABOU de",
    "  escolher, e `reservaNome` com o nome completo quando ela já disse.",
    "  `reservaOferta`: o código da oferta (O1…), vazio se ainda não escolheu.",
    "  Preencha uma vez, quando ela escolher; não repita nas mensagens seguintes.",
    '- `pagamentoInformado` = "sim" quando a pessoa disser que pagou ou mandar',
    "  comprovante. Isso NÃO confirma nada: responda que vai conferir e que a",
    "  equipe confirma a vaga por aqui.",
    '- `entrarNaLista` = "sim" quando ela aceitar a lista de interesse.',
    "- `intencao`: MODEL_PATIENT, MENTORING_STUDENT (profissional que quer o",
    "  curso), REGULAR_CLINIC ou UNKNOWN, pelo que a pessoa disse.",
  );

  return partes.join("\n");
}
