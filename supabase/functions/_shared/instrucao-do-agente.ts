// O manual aprendido vira a instrução que o agente recebe ao atender.
//
// ── A decisão mais importante deste arquivo ────────────────────────────────
//
// As regras de repasse para humano NÃO vêm do manual. São fixas, moram em
// código e não são editáveis por ninguém — nem pela IA, nem pela tela.
//
// O manual ensina COMO vender. Estas regras definem QUANDO parar de vender.
// São eixos diferentes e precisam de origens diferentes: se as regras de
// repasse saíssem do manual aprendido, bastaria UMA conversa em que a
// vendedora contornou um pedido de "quero falar com uma pessoa" e fechou
// mesmo assim para a IA aprender que dá para ignorar o pedido.
//
// Numa clínica odontológica a regra de saúde é a mais crítica das quatro. Um
// agente que responde sobre dor em vez de chamar alguém não é um detalhe de
// produto — é risco real para uma pessoa.
//
// ── Por que mora só aqui ───────────────────────────────────────────────────
//
// Este arquivo não é espelhado em `src/`, ao contrário de `phone.ts` e
// `variaveis-disparo.ts`. A tela mostra a instrução pedindo a PREVIEW a esta
// função, e não montando um texto próprio: uma cópia em `src/` poderia divergir
// da que de fato é enviada, e aí a tela mostraria regras de segurança que não
// são as que estão valendo. Melhor uma ida ao servidor do que essa mentira.

/** Uma etapa da conversa, como o aprendizado a reconheceu. */
export interface EtapaDaConversa {
  nome?: string | null;
  /** O que o paciente diz ou faz que mostra que a conversa está AQUI. */
  sinais?: string | null;
  /** O que essa etapa precisa alcançar antes de seguir. */
  objetivo?: string | null;
  /** O que costuma vir depois, quando dá certo. */
  proximo_passo?: string | null;
}

/** Os dez campos que o aprendizado extrai. */
export interface ManualDeVendas {
  tom?: string | null;
  saudacao?: string | null;
  etapas?: EtapaDaConversa[] | null;
  descoberta?: string | null;
  duvidas_de_procedimento?: string | null;
  apresentacao_preco?: string | null;
  objecoes?: { objecao?: string | null; resposta?: string | null }[] | null;
  agendamento?: string | null;
  fechamento?: string | null;
  observacoes?: string | null;
}

export const CAMPOS_DO_MANUAL = [
  "tom",
  "saudacao",
  "etapas",
  "descoberta",
  "duvidas_de_procedimento",
  "apresentacao_preco",
  "objecoes",
  "agendamento",
  "fechamento",
  "observacoes",
] as const;

/**
 * Quando o agente para de vender e chama uma pessoa. Não negociável.
 *
 * A ordem não é alfabética nem histórica: saúde vem primeiro porque é a que
 * tem consequência física, e quem lê a lista de cima para baixo — inclusive um
 * modelo de linguagem — dá mais peso ao primeiro item.
 */
export const REGRAS_DE_REPASSE = [
  "O assunto envolver saúde, dor, sintoma, sangramento, inchaço, urgência ou emergência — mesmo que a pessoa pareça estar só perguntando.",
  "O cliente pedir para falar com uma pessoa, atendente ou humano, ou pedir que liguem para ele.",
  "O cliente demonstrar irritação, reclamação, insatisfação ou ameaçar cancelar.",
  "O assunto envolver dinheiro fora do padrão: pedido de desconto, negociação, cobrança ou reembolso.",
] as const;

/** Um procedimento que o agente pode citar e precificar. */
export interface ProcedimentoDoAgente {
  nome: string;
  preco: number | null;
  duracaoMinutos?: number | null;
  categoria?: string | null;
}

export interface EntradaDaInstrucao {
  clinica: string;
  manual: ManualDeVendas;
  procedimentos: ProcedimentoDoAgente[];
  /**
   * Os horários de verdade a oferecer, já escolhidos.
   *
   * Opcional porque a tela de prévia e os testes antigos montam a instrução sem
   * agenda, e porque a ausência tem de ter um texto próprio: "não sei a
   * disponibilidade" é diferente de "não há vaga", e as duas coisas fazem o
   * agente dizer frases diferentes.
   */
  horarios?: HorariosParaOferecer | null;
}

/** O que a agenda respondeu. Ver `escolherMomentos` em `vagas.ts`. */
export interface HorariosParaOferecer {
  /** Os que a IA deve propor AGORA — dois, pela regra da clínica. */
  paraOferecer: { date: string; hora: string; unidadeNome: string }[];
  /** Os seguintes, para responder "nenhum desses serve" sem ir ao banco de
   *  novo no meio da conversa. */
  reserva: { date: string; hora: string; unidadeNome: string }[];
  /** "nas próximas 3 horas", "nos próximos 2 dias"… Nulo quando não há vaga. */
  faixa: string | null;
  /** Dias que são "sob consulta com a Dra." — não oferecer, não negar. */
  diasSobConsulta: string[];
}

const AUSENTE = "(a IA ainda não aprendeu isso — seja natural e, na dúvida, pergunte.)";

function presente(valor: string | null | undefined): string {
  const t = String(valor ?? "").trim();
  return t || AUSENTE;
}

/**
 * Campo de lista corrigido à mão vira TEXTO.
 *
 * A tela de correção tem uma caixa de texto só, igual para os dez campos — é o
 * que a torna simples de usar. Então `overrides.objecoes` e `overrides.etapas`
 * chegam aqui como string, e `manualEfetivo` a põe por cima do array.
 *
 * Sem esta guarda, `(lista ?? []).filter` numa string estoura `TypeError`
 * dentro de `montarInstrucao`, que roda DENTRO do `try` de `atender` — vira
 * falha contada, e cinco delas abrem o disjuntor. Ou seja: corrigir o manual na
 * tela derrubaria o agente, e a mensagem de erro não falaria de manual nenhum.
 *
 * Nunca aconteceu só porque nada nunca foi aprendido, e portanto nada nunca foi
 * corrigido.
 */
function textoCorrigido(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

function listaDeObjecoes(lista: ManualDeVendas["objecoes"]): string {
  const escrito = textoCorrigido(lista);
  if (escrito) return escrito;

  const linhas = (Array.isArray(lista) ? lista : [])
    .filter((o) => String(o?.objecao ?? "").trim())
    .map((o) => `- Quando o cliente disser algo como "${String(o.objecao).trim()}":\n  ${String(o.resposta ?? "").trim()}`);
  return linhas.length ? linhas.join("\n") : "(nenhuma objeção aprendida ainda.)";
}

/**
 * As etapas, numeradas.
 *
 * A numeração não é enfeite: é o que deixa o agente — e as sugestões de fala
 * do chat — dizer "a conversa está na 2" em vez de inventar um nome de etapa
 * a cada mensagem. `sinais` é como se reconhece a etapa; `proximo_passo` é
 * para onde empurrar.
 */
function listaDeEtapas(lista: ManualDeVendas["etapas"]): string {
  const escrito = textoCorrigido(lista);
  if (escrito) return escrito;

  const etapas = (Array.isArray(lista) ? lista : []).filter((e) =>
    String(e?.nome ?? "").trim(),
  );
  if (!etapas.length) return "(as etapas ainda não foram aprendidas.)";

  return etapas
    .map((e, i) => {
      const linhas = [`${i + 1}. ${String(e.nome).trim()}`];
      const sinais = String(e.sinais ?? "").trim();
      const objetivo = String(e.objetivo ?? "").trim();
      const proximo = String(e.proximo_passo ?? "").trim();
      if (sinais) linhas.push(`   Reconhece por: ${sinais}`);
      if (objetivo) linhas.push(`   Objetivo: ${objetivo}`);
      if (proximo) linhas.push(`   Depois: ${proximo}`);
      return linhas.join("\n");
    })
    .join("\n");
}

function precoEmReais(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "sob consulta";
  return `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * A tabela de preços que o agente pode citar.
 *
 * Lista vazia NÃO vira seção vazia: vira uma proibição explícita de falar
 * preço. Um agente sem tabela que encontra a pergunta "quanto custa?" inventa
 * um número, e num negócio de serviço esse é o pior erro possível — o paciente
 * chega na clínica com um preço na cabeça que ninguém combinou.
 */
export function tabelaDePrecos(procedimentos: ProcedimentoDoAgente[]): string {
  if (!procedimentos.length) {
    return [
      "## Preços",
      "Você NÃO tem tabela de preços liberada. Se perguntarem valor de qualquer",
      "coisa, diga que vai confirmar e passe a conversa para uma pessoa. Nunca",
      "estime, nunca dê faixa, nunca diga 'em torno de'.",
    ].join("\n");
  }
  const linhas = procedimentos.map((p) => {
    const dur = p.duracaoMinutos ? ` · ${p.duracaoMinutos} min` : "";
    return `- ${p.nome}: ${precoEmReais(p.preco)}${dur}`;
  });
  return [
    "## Preços que você pode informar",
    "Estes, e somente estes. Perguntaram de algo que não está na lista? Diga que",
    "vai confirmar e passe para uma pessoa.",
    "",
    ...linhas,
  ].join("\n");
}

/**
 * Os horários, do jeito que o agente pode usar.
 *
 * Espelha `tabelaDePrecos` de propósito: bloco próprio, e a frase "estes e
 * somente estes". É o mesmo problema — um dado que só o sistema conhece e que o
 * modelo inventaria de boa vontade se não fosse dito que não pode.
 *
 * ── Por que a ausência tem três textos diferentes ─────────────────────────
 *
 * "Não consultei a agenda", "consultei e não há vaga" e "este dia é sob
 * consulta" levam a três respostas distintas ao paciente. Com um texto só, o
 * agente diria "não temos horário" nos três casos — e no terceiro isso é falso,
 * porque domingo na NÓS não é fechado: é confirmar com a Dra.
 */
export function secaoDeHorarios(h: HorariosParaOferecer | null | undefined): string {
  if (!h) {
    return [
      "## Horários",
      "Você NÃO consultou a agenda. Não diga horário nenhum, nem invente, nem",
      "diga que não há vaga. Se a pessoa quiser marcar, diga que vai confirmar a",
      "agenda e passe a conversa para uma pessoa.",
    ].join("\n");
  }

  const linha = (v: { date: string; hora: string; unidadeNome: string }) =>
    `- ${diaDaSemanaEmTexto(v.date)}, ${diaMesEmTexto(v.date)}, às ${v.hora}, na ${v.unidadeNome}`;

  const partes = ["## Horários que existem de verdade na agenda"];

  if (!h.paraOferecer.length) {
    partes.push(
      "A agenda foi consultada e NÃO há vaga nos próximos quinze dias. Não",
      "ofereça horário e não invente. Diga que vai ver uma possibilidade com a",
      "equipe e passe a conversa para uma pessoa.",
    );
  } else {
    partes.push(
      `Ofereça DOIS destes, e só destes — são reais e estão livres (${h.faixa}):`,
      "",
      ...h.paraOferecer.map(linha),
      "",
      "Ofereça os dois de uma vez, numa frase, e pergunte qual fica melhor. Não",
      "mande a agenda inteira e não pergunte primeiro quando a pessoa pode.",
    );
    if (h.reserva.length) {
      partes.push(
        "",
        "Se a pessoa disser que nenhum dos dois serve, pergunte que período é",
        "melhor para ela e então ofereça dois DESTES, conforme a resposta:",
        "",
        ...h.reserva.map(linha),
      );
    }
  }

  if (h.diasSobConsulta.length) {
    partes.push(
      "",
      "Estes dias são só SOB CONSULTA com a Dra. Mariane:",
      ...h.diasSobConsulta.map((d) => `- ${diaDaSemanaEmTexto(d)}, ${diaMesEmTexto(d)}`),
      "Não ofereça nenhum deles por conta própria — e também NÃO diga que a",
      "clínica não atende nesse dia, porque atende. Se a pessoa pedir um desses,",
      "diga que precisa confirmar com a Dra. e passe a conversa para uma pessoa.",
    );
  }

  partes.push(
    "",
    "Você NÃO marca a consulta. Quando a pessoa escolher um dos horários,",
    "confirme que anotou e diga que a equipe finaliza com ela.",
  );

  return partes.join("\n");
}

const DIAS_DA_SEMANA = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

/** "quinta-feira" a partir de "2026-10-01".
 *
 *  À mão, e não por `Intl` — que existe e funciona no Deno. O motivo é outro: o
 *  texto precisa ser IDÊNTICO no teste e em produção, e dados de idioma variam
 *  entre runtimes. Uma lista de sete palavras não vale uma dependência que pode
 *  devolver "Thursday" num ambiente e "quinta-feira" no outro. */
function diaDaSemanaEmTexto(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const dia = new Date(Date.UTC(a, (m || 1) - 1, d || 1)).getUTCDay();
  return DIAS_DA_SEMANA[dia] ?? iso;
}

/** "01/10" a partir de "2026-10-01". */
function diaMesEmTexto(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/**
 * Monta a instrução completa. Função pura: mesma entrada, mesmo texto — é o
 * que permite exercitá-la sem servidor, sem modelo e sem enviar nada a
 * ninguém.
 */
export function montarInstrucao({
  clinica,
  manual,
  procedimentos,
  horarios,
}: EntradaDaInstrucao): string {
  const partes = [
    `Você atende pacientes por WhatsApp em nome de ${clinica}.`,
    "",
    "Você aprendeu a atender lendo as conversas reais desta clínica. Siga o",
    "método abaixo — ele é o jeito desta clínica atender, não um roteiro",
    "genérico de vendas.",
    "",
    "## Como falar",
    presente(manual.tom),
    "",
    "## Como começar a conversa",
    presente(manual.saudacao),
    "",
    "## As etapas da conversa",
    "Antes de responder, veja em qual etapa esta conversa está e conduza para a",
    "próxima. Não pule etapa.",
    "",
    listaDeEtapas(manual.etapas),
    "",
    "## O que descobrir antes de oferecer",
    presente(manual.descoberta),
    "",
    "## Como tirar dúvida sobre procedimento",
    presente(manual.duvidas_de_procedimento),
    "",
    "## Quando e como falar de preço",
    presente(manual.apresentacao_preco),
    "",
    "## Como responder às dúvidas mais comuns",
    listaDeObjecoes(manual.objecoes),
    "",
    "## Como marcar a consulta",
    presente(manual.agendamento),
    "",
    "## Como conduzir para a decisão",
    presente(manual.fechamento),
  ];

  const obs = String(manual.observacoes ?? "").trim();
  if (obs) partes.push("", "## Outros pontos importantes", obs);

  partes.push("", tabelaDePrecos(procedimentos));
  partes.push("", secaoDeHorarios(horarios));

  partes.push(
    "",
    "## REGRAS QUE VOCÊ NUNCA PODE QUEBRAR",
    "",
    "1. Passe a conversa para uma pessoa IMEDIATAMENTE se qualquer uma destas",
    "   situações acontecer:",
    ...REGRAS_DE_REPASSE.map((r) => `   - ${r}`),
    "",
    "2. Nunca invente informação. Preço, horário, disponibilidade, endereço,",
    "   nome de profissional: só o que está escrito ACIMA nesta instrução. Um",
    "   horário que não está na lista de horários não existe, mesmo que pareça",
    "   razoável. Fora do que está acima, diga que vai confirmar e passe para",
    "   uma pessoa.",
    "",
    "3. Nunca dê orientação clínica, diagnóstico, nome de remédio ou conduta —",
    "   nem para tranquilizar. Isso vale mesmo que a pergunta pareça simples.",
    "",
    "4. Nunca prometa prazo, desconto, resultado ou condição que não apareça",
    "   explicitamente no método acima.",
    "",
    "5. Nunca discuta com o paciente e nunca insista depois de um \"não\".",
    "",
    "6. Escreva como alguém daqui escreveria: mensagens curtas, em português do",
    "   Brasil, sem parecer robô e sem se identificar como inteligência",
    "   artificial a menos que perguntem diretamente.",
  );

  return partes.join("\n");
}

/**
 * O manual como a tela mostra: aprendido, com as correções por cima.
 *
 * `overrides` só sobrepõe onde de fato tem conteúdo. Um campo vazio no
 * override significa "não corrigi este", não "apague o que a IA aprendeu" —
 * sem esta checagem, abrir a tela de correção e salvar sem digitar nada
 * zeraria o manual inteiro.
 */
export function manualEfetivo(
  learned: ManualDeVendas | null | undefined,
  overrides: ManualDeVendas | null | undefined,
): ManualDeVendas {
  const base: Record<string, unknown> = { ...(learned ?? {}) };
  for (const [chave, valor] of Object.entries(overrides ?? {})) {
    if (valor === null || valor === undefined) continue;
    if (typeof valor === "string" && !valor.trim()) continue;
    if (Array.isArray(valor) && valor.length === 0) continue;
    base[chave] = valor;
  }
  return base as ManualDeVendas;
}
