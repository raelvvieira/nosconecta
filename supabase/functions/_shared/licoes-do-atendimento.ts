// A Luna aprendendo com cada conversa que ela conduziu.
//
// ── O que a clínica pediu ───────────────────────────────────────────────
//
// "Um reforço positivo no fluxo de aprendizado da IA, que é quando ela consegue
// agendar um horário sozinha; daí ela pode analisar a conversa, aprender um
// pouco mais como fazer. E também um reforço negativo, que permite ela se
// autoavaliar quando não consegue agendar, e essas informações do porquê ela
// não conseguiu ficam registradas para fins de melhorias nas versões da md."
//
// ── A parte que exige honestidade ───────────────────────────────────────
//
// Hoje a Luna NÃO marca consulta. Ela conduz e passa para uma pessoa, que marca
// na agenda. Então "ela conseguiu agendar sozinha" não existe ainda, e chamar de
// vitória dela um agendamento que uma pessoa fechou seria ensinar a coisa
// errada: a lição diria "continue fazendo assim" sobre uma conversa em que o
// que funcionou foi outra pessoa entrar.
//
// O sinal honesto é: apareceu um agendamento para esta pessoa DEPOIS da conversa
// que a Luna conduziu, e ninguém teve de assumir a conversa no meio. Se uma
// pessoa assumiu, o desfecho é o negativo — não porque o agendamento não valha,
// mas porque a pergunta que interessa é "o que faltou para você fechar sozinha?".
//
// ── Por que uma lição por conversa, e só depois do fim ──────────────────
//
// Avaliar no meio produziria uma lição sobre uma conversa que ainda ia mudar, e
// duas lições da mesma conversa se contradizendo é pior que nenhuma. Por isso o
// silêncio é parte da definição de fim.

/**
 * Quanto tempo de silêncio conta como conversa encerrada.
 *
 * 24 horas, e não duas: o padrão desta base é a pessoa responder no dia
 * seguinte. Avaliar depois de duas horas registraria "não conseguiu agendar"
 * sobre conversas que fecham na manhã seguinte — e a IA aprenderia a se
 * culpar por conversas que deram certo.
 */
export const SILENCIO_PARA_AVALIAR_HORAS = 24;

export type Desfecho = "agendou" | "nao_agendou";

export interface SessaoAvaliavel {
  /** A Luna falou alguma vez nesta conversa? Sem isso não há o que avaliar:
   *  a lição seria sobre uma conversa que ela nunca conduziu. */
  falouAlgumaVez: boolean;
  /** A última mensagem da conversa, em qualquer direção. */
  ultimaMensagemEm: string | null;
  /** Apareceu agendamento para esta pessoa depois desta conversa. */
  agendou: boolean;
  /** Uma pessoa da clínica assumiu a conversa no meio. */
  humanoAssumiu: boolean;
}

/**
 * Qual lição esta conversa rende — ou nenhuma, ainda.
 *
 * `null` quer dizer "não avalie agora", e é a resposta mais comum: conversa em
 * andamento, ou conversa em que a Luna nunca falou.
 */
export function desfechoDaSessao(s: SessaoAvaliavel, agora: Date): Desfecho | null {
  if (!s.falouAlgumaVez) return null;

  // Agendamento é fim definitivo: não se espera silêncio para reconhecê-lo.
  // Com pessoa no meio, o desfecho é o negativo — ver o cabeçalho.
  if (s.agendou) return s.humanoAssumiu ? "nao_agendou" : "agendou";

  if (!s.ultimaMensagemEm) return null;
  const quando = new Date(s.ultimaMensagemEm);
  // Data ilegível não pode virar "conversa encerrada": geraria uma lição sobre
  // uma conversa que talvez esteja acontecendo agora.
  if (Number.isNaN(quando.getTime())) return null;

  const horas = (agora.getTime() - quando.getTime()) / 3_600_000;
  return horas >= SILENCIO_PARA_AVALIAR_HORAS ? "nao_agendou" : null;
}

/**
 * Os motivos possíveis, fechados.
 *
 * Lista fechada porque o que a tela precisa é CONTAR: "sete das dez conversas
 * pararam no preço" é uma frase que muda o manual. Texto livre daria dez
 * motivos diferentes para a mesma coisa e nada para somar.
 *
 * Fechada no formato pedido ao modelo, e NÃO no banco: uma categoria inesperada
 * não pode fazer a gravação falhar e perder a lição inteira.
 */
export const MOTIVOS = [
  "parou no preço",
  "não respondeu mais",
  "nenhum horário serviu",
  "queria falar com a doutora",
  "só estava pesquisando",
  "pedia algo que a clínica não faz",
  "eu me perdi na conversa",
  "não deu para saber",
  "não se aplica",
] as const;

/**
 * O formato exigido da lição.
 *
 * Campos, e não um parágrafo: a tela mostra "o que faltou" ao lado de "o que
 * fazer diferente", e um parágrafo só obrigaria quem lê a garimpar as duas
 * coisas no meio do texto. Todos obrigatórios porque o modo estrito da OpenAI
 * exige — `o_que_faltou` vem vazio quando deu certo, e é isso que o prompt pede.
 */
export const FORMATO_DA_LICAO = {
  type: "json_schema" as const,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "o_que_funcionou",
      "o_que_faltou",
      "motivo",
      "momento_decisivo",
      "sugestao_para_o_manual",
      "confianca",
    ],
    properties: {
      /** O que funcionou. Em conversa que não fechou também existe: quase
       *  nenhuma conversa erra do começo ao fim. */
      o_que_funcionou: { type: "string" },
      /** O que faltou. Vazio quando a conversa fechou. */
      o_que_faltou: { type: "string" },
      motivo: { type: "string", enum: [...MOTIVOS] },
      /** A mensagem que virou a conversa, citada. É o que permite conferir a
       *  lição em vez de acreditar nela. */
      momento_decisivo: { type: "string" },
      /** O que mudar no manual. É esta frase que vira a próxima versão do .md,
       *  então ela tem de ser acionável, não elogio. */
      sugestao_para_o_manual: { type: "string" },
      /** Quanta certeza. Uma conversa de três mensagens não sustenta conclusão,
       *  e a tela precisa poder ignorar as fracas. */
      confianca: { type: "string", enum: ["alta", "media", "baixa"] },
    },
  },
};

export interface Licao {
  oQueFuncionou: string;
  oQueFaltou: string;
  motivo: string;
  momentoDecisivo: string;
  sugestao: string;
  confianca: string;
}

/** Lê a resposta do modelo sem confiar nela. Campo que faltou vira vazio, e
 *  vazio a tela sabe mostrar; `undefined` viraria "undefined" na tela. */
export function licaoDoJson(bruto: unknown): Licao {
  const o = (bruto ?? {}) as Record<string, unknown>;
  const texto = (v: unknown) => String(v ?? "").trim();
  const motivo = texto(o.motivo);
  return {
    oQueFuncionou: texto(o.o_que_funcionou),
    oQueFaltou: texto(o.o_que_faltou),
    motivo: (MOTIVOS as readonly string[]).includes(motivo) ? motivo : "não deu para saber",
    momentoDecisivo: texto(o.momento_decisivo),
    sugestao: texto(o.sugestao_para_o_manual),
    confianca: ["alta", "media", "baixa"].includes(texto(o.confianca))
      ? texto(o.confianca)
      : "baixa",
  };
}

export interface EntradaDaLicao {
  desfecho: Desfecho;
  /** O nome que a pessoa usa no WhatsApp, quando há. */
  nomeDoContato: string | null;
  /** O texto do anúncio que trouxe ela, quando veio de um. */
  anuncio: string | null;
  /** A conversa inteira, uma fala por linha, já com quem falou. */
  transcricao: string;
  /** O manual da clínica, para a sugestão apontar para um trecho dele em vez de
   *  inventar uma regra nova. Vazio quando a clínica não escreveu manual. */
  manual: string | null;
  /** Uma pessoa assumiu a conversa no meio. Muda a pergunta. */
  humanoAssumiu: boolean;
  /** Apareceu agendamento, mesmo que uma pessoa tenha fechado. */
  agendou: boolean;
}

/**
 * O prompt da autoavaliação. Puro: mesma entrada, mesmo texto.
 *
 * ── Por que na segunda pessoa ───────────────────────────────────────────
 *
 * "Avalie o desempenho do agente" produziria o texto de um consultor. O que a
 * clínica pediu é a IA se autoavaliando, e o que sai daqui vira a próxima versão
 * do manual dela — então a pergunta é feita a ELA, sobre a conversa dela.
 *
 * ── Por que o manual entra citado ───────────────────────────────────────
 *
 * Mesma razão de `sugestoes-de-fala.ts`: o manual é escrito em segunda pessoa
 * para quem atende. Usado como instrução do sistema, o modelo voltaria a
 * atender em vez de avaliar.
 */
export function promptDaLicao(e: EntradaDaLicao): string {
  const partes: string[] = [];

  partes.push(
    "Você é a Luna, a atendente de WhatsApp desta clínica de odontologia.",
    "",
    "A conversa abaixo é SUA. Ela terminou, e você vai olhar para ela para",
    "atender melhor na próxima. Não é relatório para ninguém ler por obrigação:",
    "o que você escrever aqui vai virar mudança no seu próprio manual.",
    "",
  );

  if (e.desfecho === "agendou") {
    partes.push(
      "## O que aconteceu",
      "Esta conversa VIROU CONSULTA MARCADA, e ninguém da clínica precisou entrar",
      "no meio. Foi você do começo ao fim.",
      "",
      "Então a pergunta é: o que exatamente fez isso acontecer? Qual mensagem sua",
      "destravou, e por quê. Se você repetir só uma coisa desta conversa na",
      "próxima, qual é?",
      "",
      'Deixe `o_que_faltou` vazio e `motivo` como "não se aplica".',
      "",
    );
  } else if (e.agendou) {
    partes.push(
      "## O que aconteceu",
      "Esta pessoa acabou marcando consulta, MAS uma pessoa da clínica teve de",
      "assumir a conversa no meio. Quem fechou não foi você.",
      "",
      "Então a pergunta não é se deu certo: deu. É o que faltou para você chegar",
      "até o fim sozinha. Olhe a última mensagem sua antes de a pessoa entrar.",
      "",
    );
  } else {
    partes.push(
      "## O que aconteceu",
      "Esta conversa NÃO virou consulta marcada.",
      "",
      e.humanoAssumiu
        ? "Uma pessoa da clínica assumiu no meio, e mesmo assim não fechou."
        : "A pessoa parou de responder e ninguém assumiu.",
      "",
      'Seja específica e seja honesta. "Poderia ter sido mais empática" não muda',
      'nada. "Ela perguntou o valor da harmonização e eu repeti duas vezes que',
      'só a doutora avalia, sem oferecer a avaliação" muda.',
      "",
      "Se o motivo foi algo que você não controla (a pessoa só pesquisava, ou",
      "queria um procedimento que a clínica não faz), diga isso em vez de",
      "inventar um erro seu. Inventar culpa ensina a coisa errada.",
      "",
    );
  }

  if (e.nomeDoContato) partes.push(`A pessoa se chama ${e.nomeDoContato}.`, "");
  if (e.anuncio) {
    partes.push("Ela chegou por este anúncio:", `> ${e.anuncio.split("\n").join("\n> ")}`, "");
  }

  const manual = String(e.manual ?? "").trim();
  if (manual) {
    partes.push(
      "## O seu manual, como ele está hoje",
      "",
      "A sua sugestão deve apontar para um trecho DESTE texto: o que acrescentar,",
      "o que está ambíguo, ou o que está escrito e você não seguiu. Uma sugestão",
      "que não cabe aqui dentro não vira nada.",
      "",
      manual,
      "",
    );
  }

  partes.push(
    "## A conversa",
    "",
    e.transcricao,
    "",
    "Responda no formato pedido. Uma frase por campo, em português do Brasil,",
    "concreta, sem elogio e sem rodeio. Cite a mensagem em `momento_decisivo`.",
    "E se a conversa é curta demais para concluir qualquer coisa, diga isso com",
    '`confianca: "baixa"` em vez de inventar uma conclusão.',
  );

  return partes.join("\n");
}
