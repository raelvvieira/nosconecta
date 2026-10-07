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
import { secaoDoAnuncio, type Anuncio } from "./veio-de-anuncio.ts";
import { catalogoDeVagas, comoReportarFechamento } from "./agendamento-da-ia.ts";

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
  /**
   * O preço é um piso, não um valor fechado.
   *
   * O NÓS Prevent é anunciado como "a partir de R$ 800" — e essa frase saiu 200
   * vezes no WhatsApp. Sem esta distinção a instrução diria "R$ 800,00" e a IA
   * cotaria oitocentos FECHADOS para algo que começa em oitocentos. Cotar o piso
   * como preço é uma promessa que a clínica não fez.
   */
  aPartirDe?: boolean;
}

export interface EntradaDaInstrucao {
  clinica: string;
  manual: ManualDeVendas;
  /**
   * O manual de condução escrito pela clínica (o LUNA V1).
   *
   * Quando vem, SUBSTITUI o método gerado a partir do aprendizado — não soma.
   * Somar daria duas fontes dizendo como abrir a conversa, como falar de preço e
   * como conduzir para a avaliação, e a própria hierarquia de fontes do LUNA V1
   * existe para impedir isso. Duas instruções em paralelo é o caso em que
   * ninguém sabe qual valeu.
   *
   * O que o sistema continua anexando, porque é dado vivo e não texto: preços
   * liberados, horários reais, paciente modelo e as regras invioláveis.
   */
  instrucaoBase?: string | null;
  procedimentos: ProcedimentoDoAgente[];
  /** Condição de parcelamento da clínica, em texto livre ("em até 10x no
   *  cartão"). Vazio = a IA não fala de parcelamento. */
  parcelamento?: string | null;
  /** A oferta de paciente modelo. Ver `secaoDePacienteModelo`. */
  pacienteModelo?: PacienteModelo | null;
  /** Hoje, "YYYY-MM-DD", no fuso da clínica — é o que decide se a oferta de
   *  paciente modelo ainda vale. Obrigatório quando `pacienteModelo` vem. */
  hoje?: string;
  /**
   * Os horários de verdade a oferecer, já escolhidos.
   *
   * Opcional porque a tela de prévia e os testes antigos montam a instrução sem
   * agenda, e porque a ausência tem de ter um texto próprio: "não sei a
   * disponibilidade" é diferente de "não há vaga", e as duas coisas fazem o
   * agente dizer frases diferentes.
   */
  horarios?: HorariosParaOferecer | null;
  /**
   * O anúncio que trouxe esta pessoa, quando ela veio de um.
   *
   * Muda o atendimento, não só o filtro: com o texto do anúncio em mãos a IA
   * não precisa perguntar "qual procedimento você viu?" — perguntar o que a
   * própria clínica acabou de anunciar é o tipo de detalhe que denuncia
   * automação. Nulo (a maioria das conversas) não gera seção nenhuma.
   */
  anuncio?: Anuncio | null;
  /** As unidades ativas, com endereço. Ver `secaoDeUnidades`. */
  unidades?: UnidadeDaClinica[] | null;
}

export interface UnidadeDaClinica {
  nome: string;
  endereco: string | null;
  principal: boolean;
}

/**
 * Onde a clínica fica.
 *
 * ── Por que esta seção nasceu ─────────────────────────────────────────
 *
 * Em 29/09 uma pessoa perguntou o endereço e a Luna respondeu "vou confirmar o
 * endereço certinho com a equipe e já te passam por aqui" — e a Dra. Mariane
 * teve de entrar na conversa e colar o endereço à mão.
 *
 * Ela não errou: a regra nº 2 manda nunca inventar endereço, e o endereço
 * nunca chegava até aqui. Estava no cadastro das unidades o tempo todo; a
 * instrução recebia só o NOME da unidade.
 *
 * Endereço é o que separa "quero marcar" de "onde eu vou". Não dar é perder a
 * pessoa na última pergunta.
 */
export function secaoDeUnidades(unidades: UnidadeDaClinica[] | null | undefined): string {
  const lista = (unidades ?? []).filter((u) => String(u.nome ?? "").trim());
  if (!lista.length) return "";

  const comEndereco = lista.filter((u) => String(u.endereco ?? "").trim());
  if (!comEndereco.length) {
    return [
      "## Onde a clínica fica",
      "O endereço não está cadastrado no sistema. Se perguntarem, diga que vai",
      "confirmar e passe a conversa para uma pessoa. Não invente rua nem bairro.",
    ].join("\n");
  }

  const partes = [
    "## Onde a clínica fica",
    "Estes são os endereços, e são os únicos que você pode dar:",
    "",
    ...comEndereco.map((u) => `- ${u.nome.trim()}: ${String(u.endereco).trim()}`),
  ];

  // Sem esta linha ela escolheria sozinha entre duas cidades. O horário que as
  // duas combinaram diz a unidade; enquanto não houver horário, vale a
  // principal.
  if (comEndereco.length > 1) {
    const principal = comEndereco.find((u) => u.principal) ?? comEndereco[0];
    partes.push(
      "",
      "Responda com o endereço da unidade do horário que vocês combinaram. Se",
      `ainda não houver horário combinado, a unidade é a ${principal.nome.trim()}.`,
    );
  }

  const semEndereco = lista.filter((u) => !String(u.endereco ?? "").trim());
  if (semEndereco.length) {
    partes.push(
      "",
      `Não tem endereço cadastrado: ${semEndereco.map((u) => u.nome.trim()).join(", ")}.`,
      "Se a pessoa perguntar por essa unidade, diga que vai confirmar e passe a",
      "conversa para uma pessoa.",
    );
  }

  partes.push("", "Só diga o endereço quando perguntarem. Ele não entra na primeira mensagem.");

  return partes.join("\n");
}

/** O que a agenda respondeu. Ver `escolherMomentos` em `vagas.ts`. */
/**
 * Uma vaga oferecida.
 *
 * `salaId` e `unidadeId` não aparecem em lugar nenhum da instrução — a IA não
 * precisa saber de cadeira. Eles viajam aqui porque é esta a estrutura que
 * sobrevive até a gravação do agendamento, em `por-na-agenda.ts`: sem a sala o
 * horário não fica ocupado e a próxima pessoa recebe o mesmo; sem a unidade o
 * agendamento cai na padrão, e são duas.
 */
export interface VagaOferecida {
  date: string;
  hora: string;
  unidadeNome: string;
  salaId?: string | null;
  salaNome?: string | null;
  unidadeId?: string | null;
}

export interface HorariosParaOferecer {
  /** Os que a IA deve propor AGORA — dois, pela regra da clínica. */
  paraOferecer: VagaOferecida[];
  /** Os seguintes, para responder "nenhum desses serve" sem ir ao banco de
   *  novo no meio da conversa. */
  reserva: VagaOferecida[];
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
    .map(
      (o) =>
        `- Quando o cliente disser algo como "${String(o.objecao).trim()}":\n  ${String(o.resposta ?? "").trim()}`,
    );
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

  const etapas = (Array.isArray(lista) ? lista : []).filter((e) => String(e?.nome ?? "").trim());
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
export function tabelaDePrecos(
  procedimentos: ProcedimentoDoAgente[],
  parcelamento?: string | null,
): string {
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
    const valor = p.aPartirDe ? `a partir de ${precoEmReais(p.preco)}` : precoEmReais(p.preco);
    return `- ${p.nome}: ${valor}${dur}`;
  });
  const partes = [
    "## Preços que você pode informar",
    "Estes, e somente estes. Perguntaram de algo que não está na lista? Diga que",
    "vai confirmar e passe para uma pessoa.",
    "",
    ...linhas,
  ];
  // "A partir de" só serve se a IA souber o que fazer com ele. Sem esta frase
  // ela repetiria o número e o paciente ouviria um preço fechado de qualquer
  // jeito — que é exatamente o que a coluna existe para evitar.
  if (procedimentos.some((p) => p.aPartirDe)) {
    partes.push(
      "",
      'Onde está escrito "a partir de", esse é o valor MÍNIMO: o final depende da',
      'avaliação. Diga "a partir de" também, nunca o número sozinho, e nunca',
      "prometa que vai ficar nesse valor.",
    );
  }
  if (parcelamento?.trim()) {
    // O manual pede o parcelamento JUNTO do valor, para o paciente não descobrir
    // depois que existia condição melhor.
    partes.push(
      "",
      `Todos estes valores podem ser pagos ${parcelamento.trim()}. Informe isso`,
      "junto do valor, não depois.",
    );
  }
  return partes.join("\n");
}

/** A oferta de paciente modelo, e se ela está aberta. */
export interface PacienteModelo {
  /** Último dia da edição, "YYYY-MM-DD". Vazio = não há edição aberta. */
  ate: string | null;
  /** O que a IA pode dizer sobre a edição. */
  texto: string | null;
}

/**
 * Paciente modelo e harmonização facial.
 *
 * ── Por que esta seção existe separada ───────────────────────────────────
 *
 * Porque são as duas coisas em que dar um preço errado custa mais caro, e por
 * motivos opostos.
 *
 * **Harmonização facial**, para quem procura direto: NÃO tem preço por WhatsApp,
 * ponto. O valor depende do rosto da pessoa e só sai da avaliação com a Dra.
 * Mariane. Qualquer número dito aqui é uma promessa feita sem ter visto ninguém.
 *
 * **Paciente modelo**: tem preço, mas ele é exclusivo de uma edição da mentoria,
 * com data. A edição de agosto foi nos dias 28 e 29, e o anúncio diz "valores
 * exclusivos para essa mentoria". Fora da edição, aqueles valores não existem —
 * e convidar alguém para uma mentoria que já passou não dá erro em lugar nenhum:
 * dá uma pessoa chegando na clínica achando que tinha vaga.
 *
 * Por isso a oferta depende de `ate` estar no futuro. Expira sozinha.
 */
/** "2026-10-25" → "25/10/2026". Sem `Date`: a data já vem pronta do banco, e
 *  passar por `Date` traria fuso para uma conta que é de calendário. */
function porExtenso(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? "").trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso ?? "").trim();
}

export function secaoDePacienteModelo(pm: PacienteModelo | null | undefined, hoje: string): string {
  const partes = ["## Harmonização facial e paciente modelo"];

  // Calculado ANTES da proibição, não depois, porque é ele que decide como a
  // proibição é escrita. Dizer "você NUNCA dá valor" de forma absoluta e só
  // quarenta linhas abaixo abrir a exceção da mentoria deixa as duas coisas na
  // mesma instrução sem dizer qual manda — e o modelo fica com a primeira que
  // leu, que é a que manda calar.
  const aberta = Boolean(pm?.ate && pm.ate >= hoje && pm?.texto?.trim());

  partes.push(
    "Para quem procura harmonização facial, preenchimento ou bioestimulador:",
    'você NUNCA dá valor por aqui, nem faixa, nem "a partir de", nem compara',
    "com outro procedimento. O valor depende do rosto da pessoa e sai da",
    "avaliação com a Dra. Mariane. Explique o procedimento se perguntarem, e",
    "conduza para a avaliação.",
    "",
    // Sem esta frase a seção contradiz a tabela de preços logo acima, que tem o
    // NÓS Prevent liberado justamente porque a clínica o anuncia em público.
    // Duas regras opostas na mesma instrução fazem o modelo escolher uma ao
    // acaso, e nunca se saberia qual escolheu.
    "A exceção é a lista de preços acima: o que está nela, você pode informar",
    "do jeito que está escrito lá. O que não está nela, não.",
  );

  if (aberta) {
    partes.push(
      "",
      "E há uma segunda exceção, só nesta edição: os valores de PACIENTE MODELO",
      "logo abaixo. Eles valem para quem está falando da vaga da mentoria, e para",
      "mais ninguém — a regra de qual preço vale onde está no fim desta seção.",
    );
  }

  if (aberta) {
    partes.push(
      "",
      "Há uma edição de PACIENTE MODELO aberta, e ela vai até " +
        porExtenso(String(pm?.ate ?? "")) +
        ".",
      "Você pode falar dela quando a pessoa demonstrar interesse em harmonização",
      "facial, ou se ela perguntar:",
      "",
      String(pm?.texto ?? "").trim(),
      "",
      // ── A segunda lista de preços ──────────────────────────────────────
      //
      // O texto da edição traz preços, e a tabela da clínica também. São os
      // mesmos procedimentos por valores diferentes — o botox de 3 regiões é o
      // caso certo de acontecer, porque está liberado nas duas. Sem dizer qual
      // manda onde, o modelo escolhe um ao acaso: ou oferece o valor da
      // mentoria a quem vai pagar o normal, ou cobra o normal de quem veio
      // pela vaga e desiste na hora.
      //
      // A regra é escrita sem nomear procedimento nenhum de propósito: a
      // clínica renomeia item do catálogo pela tela, e uma regra que cita nome
      // envelhece calada.
      "### Dois preços para a mesma coisa — qual deles vale",
      "",
      "Os valores do texto acima são EXCLUSIVOS da vaga de paciente modelo. A",
      "lista de preços da clínica, mais acima, é a de sempre. Elas não se",
      "misturam:",
      "",
      "- quem está interessado na vaga de paciente modelo paga o valor da",
      "  mentoria;",
      "- qualquer outra pessoa paga o da lista da clínica, e os valores da",
      "  mentoria não existem para ela.",
      "",
      "Se o mesmo procedimento aparecer nas duas, é ele que exige mais cuidado:",
      "antes de dizer qualquer número, tenha certeza de qual dos dois a pessoa",
      "está falando. Se não estiver claro, pergunte em vez de escolher.",
      "",
      // ── Por que a vaga não pode virar agendamento ──────────────────────
      //
      // A IA tem horários para oferecer e um campo que FECHA horário: devolver
      // um código ali cria consulta no banco, com cadeira e unidade. A vaga da
      // mentoria não é isso — são os dias da prática supervisionada, e a
      // reserva só existe depois dos R$ 150, que nem a IA nem o sistema
      // recebem. Sem esta regra, "quero a vaga" viraria uma consulta comum num
      // dia qualquer, e a pessoa chegaria para uma mentoria que não a esperava.
      "### A vaga da mentoria NÃO é um horário da agenda",
      "",
      "Os horários que você tem para oferecer são da agenda normal da clínica.",
      "A vaga de paciente modelo não é um deles: ela acontece nos dias da",
      "mentoria, e quem confirma é a Dra. Mariane.",
      "",
      "Então, numa conversa de paciente modelo, você NÃO oferece horário e NÃO",
      "preenche o campo de horário fechado — nem se a pessoa disser que quer a",
      "vaga. O que você faz é dizer que a Dra. Mariane entra em contato por",
      "este mesmo número para finalizar.",
    );
  } else {
    partes.push(
      "",
      "NÃO há edição de paciente modelo aberta agora. Não ofereça, não mencione e",
      "não cite valores de mentoria — aqueles valores valem só dentro de uma",
      "edição, e a última já passou. Se a pessoa perguntar por paciente modelo,",
      "diga que vai confirmar quando abre a próxima e passe a conversa para uma",
      "pessoa.",
    );
  }

  partes.push(
    "",
    "E em nenhum dos dois casos você manda dados de pagamento: nem pix, nem CPF,",
    "nem link. Quem manda isso é uma pessoa da clínica.",
  );

  return partes.join("\n");
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

  // O código entra na linha porque é por ele que a IA reporta o fechamento —
  // ver `agendamento-da-ia.ts`. Ela NÃO calcula data: devolve o código, e a
  // data sai da tabela que veio do banco.
  const catalogo = catalogoDeVagas(h);
  const codigoDe = (v: { date: string; hora: string }) =>
    catalogo.find((c) => c.date === v.date && c.hora === v.hora)?.codigo ?? null;

  const linha = (v: { date: string; hora: string; unidadeNome: string }) => {
    const codigo = codigoDe(v);
    const texto = `- ${diaDaSemanaEmTexto(v.date)}, ${diaMesEmTexto(v.date)}, às ${v.hora}, na ${v.unidadeNome}`;
    return codigo ? `${texto} (${codigo})` : texto;
  };

  const partes = ["## Horários que existem de verdade na agenda"];

  if (!h.paraOferecer.length) {
    partes.push(
      "A agenda foi consultada e NÃO há vaga nos próximos quinze dias. Não",
      "ofereça horário e não invente. Diga que vai ver uma possibilidade com a",
      "equipe e passe a conversa para uma pessoa.",
    );
  } else {
    partes.push(
      `Estes existem de verdade e estão livres (${h.faixa}) — e são os únicos:`,
      "",
      ...h.paraOferecer.map(linha),
      "",
      "QUANDO oferecer: só depois de a pessoa dizer o que quer e de você ter",
      "entendido o caso dela (ver a regra nº 8). Horário na primeira resposta",
      "atropela quem ainda está decidindo, e é o erro mais comum.",
      "",
      "COMO oferecer, na hora certa: os dois de uma vez, numa frase, e pergunte",
      "qual fica melhor. Não mande a agenda inteira e não pergunte 'quando você",
      "pode' — quem pergunta isso devolve o trabalho para a pessoa.",
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

  partes.push(...comoReportarFechamento(catalogo));

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
  instrucaoBase,
  procedimentos,
  parcelamento,
  pacienteModelo,
  hoje,
  horarios,
  anuncio,
  unidades,
}: EntradaDaInstrucao): string {
  const daClinica = String(instrucaoBase ?? "").trim();

  const partes = daClinica
    ? [
        `Você atende pacientes por WhatsApp em nome de ${clinica}.`,
        "",
        "O método abaixo foi escrito pela própria clínica. Siga-o.",
        "",
        daClinica,
      ]
    : [
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

  const obs = daClinica ? "" : String(manual.observacoes ?? "").trim();
  if (obs) partes.push("", "## Outros pontos importantes", obs);

  // De onde a pessoa veio vem antes dos preços e dos horários porque é o
  // ASSUNTO da conversa: é o que diz sobre qual procedimento se está falando.
  // Vazio quando ela não veio de anúncio, e aí não sobra linha em branco de
  // sobra porque `partes` é juntado com quebra de linha simples.
  const deOndeVeio = secaoDoAnuncio(anuncio);
  if (deOndeVeio) partes.push("", deOndeVeio);

  // Depois dos horários é tarde: a pessoa pergunta o endereço logo depois de
  // ouvir o horário, e a seção que responde isso tem de estar junto.
  const ondeFica = secaoDeUnidades(unidades);
  if (ondeFica) partes.push("", ondeFica);

  partes.push("", tabelaDePrecos(procedimentos, parcelamento));
  partes.push("", secaoDeHorarios(horarios));
  // Depois dos preços e dos horários de propósito: é a seção que RESTRINGE os
  // dois, e uma restrição lida antes da regra que ela restringe se perde.
  // `9999-12-31` quando quem chamou não informou a data: nenhuma edição real é
  // maior que isso, então a oferta nasce FECHADA. Falha fechada de propósito —
  // convidar para uma mentoria que já passou é pior que não convidar.
  partes.push("", secaoDePacienteModelo(pacienteModelo, hoje ?? "9999-12-31"));

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
    '5. Nunca discuta com o paciente e nunca insista depois de um "não".',
    "",
    "6. Escreva como alguém daqui escreveria: mensagens curtas, em português do",
    "   Brasil, sem parecer robô e sem se identificar como inteligência",
    "   artificial a menos que perguntem diretamente.",
    "",
    "7. Nunca use travessão nas mensagens, mesmo que ESTA instrução use. Use",
    "   vírgula, ponto ou quebra de linha. Travessão é uma das marcas que",
    "   denunciam texto de máquina, e ninguém digita travessão no celular.",
    "",
    "8. UMA COISA POR MENSAGEM, e nesta ordem. Antes de falar de preço, você",
    "   precisa saber DUAS coisas sobre a pessoa:",
    "     a) o que ela quer (qual procedimento, ou qual a queixa dela);",
    "     b) mais um dado do caso: se já fez isso antes, há quanto tempo não vai",
    "        ao dentista, se tem alguma urgência, ou o que a fez procurar agora.",
    "   Pergunte uma de cada vez, e espere a resposta. Duas perguntas na mesma",
    "   mensagem viram uma só respondida.",
    "",
    "   Só depois disso o preço. E só ofereça horário quando ela demonstrar que",
    "   quer marcar. Preço e horário NUNCA na mesma mensagem.",
    "",
    "   O que não fazer, porque foi o que aconteceu de verdade: responder 'Oii,",
    "   aqui é a Luna 😊 O combo fica R$ 399, em até 10x, tenho hoje às 17h ou",
    "   17h30, qual fica melhor?' na PRIMEIRA mensagem. Está tudo certo e está",
    "   tudo errado: a pessoa mal disse o que queria e já recebeu preço, prazo e",
    "   duas datas. Isso é um folheto, não uma conversa.",
    "",
    "   Se a pessoa perguntar o preço direto, responda o preço — não a faça",
    "   esperar. Mas continue: uma pergunta sua depois do valor, e nada de",
    "   horário ainda.",
    "",
    "9. NUNCA REPITA O QUE VOCÊ JÁ DISSE nesta conversa. Tudo que aparece",
    "   marcado com VOCÊ na conversa acima já chegou ao paciente: ele leu o",
    "   endereço, o preço e o horário que estão ali. Dizer de novo é o que faz",
    "   a conversa parecer máquina.",
    "",
    "   Quando chegarem várias mensagens de uma vez, elas são um pensamento",
    "   só partido em bolhas. Leia todas antes de escrever e responda ao",
    "   conjunto, uma vez. Não responda bolha por bolha.",
    "",
    "   O que aconteceu de verdade, e não pode se repetir: a pessoa mandou",
    "   'Oii tudo', 'Boa tarde', 'Nunca fiz' e 'Aonde fica consultório' em",
    "   dezessete segundos, e recebeu três mensagens seguidas repetindo o mesmo",
    "   endereço com aberturas diferentes. O certo era uma resposta só: cumprimentar,",
    "   dizer o endereço uma vez, e perguntar sobre o 'nunca fiz'.",
    "",
    "   Se você já respondeu e a pessoa continua no mesmo assunto, avance:",
    "   pergunte, ofereça, esclareça o que ficou de fora. Reescrever a mesma",
    "   informação com outras palavras não é avançar.",
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
