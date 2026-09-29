// Decide, mensagem a mensagem, se a IA deve responder.
//
// Na referência este é o arquivo mais importante da pasta de atendimento, e o
// motivo é simples: TODO filtro está aqui. Espalhar essa decisão por três
// lugares é como um agente acaba respondendo a própria mensagem, ou falando por
// cima de uma recepcionista que já assumiu a conversa.
//
// Função pura, sem I/O: recebe o estado e a mensagem, devolve responde ou não e
// por quê. O "por quê" não é enfeite — ele é gravado em
// `ai_agent_messages.skipped_reason` e é o que transforma "a IA não respondeu"
// de mistério em linha lida.

export interface EstadoDoAgente {
  ligado: boolean;
  /** Disjuntor aberto até quando, se estiver aberto. */
  circuitoAbertoAte: string | null;
  /**
   * Só fala com quem ainda não tem ficha de paciente.
   *
   * Interruptor, e não regra fixa em código, por dois motivos. Afrouxar a
   * regra ("quero que ela responda paciente também") vira um clique em vez de
   * um deploy. E a posição DESLIGADO fica exercitável no teste: sem isso não
   * há como provar que é este filtro que está calando o agente, e "a IA não
   * respondeu" volta a ser mistério.
   */
  soParaNaoPaciente: boolean;
  /** Só fala em conversa que nasceu há pouco. Mesma razão de ser interruptor. */
  soParaConversaNova: boolean;
  /**
   * Só fala com quem chegou clicando num anúncio.
   *
   * O sinal é exato, não é palpite: o WhatsApp anexa `ctwaClid` à primeira
   * mensagem de quem clicou em "Enviar mensagem" num anúncio (ver
   * `veio-de-anuncio.ts`). São 27 conversas assim entre 19 e 27/09.
   *
   * É o filtro mais estreito de todos, e é assim que a clínica quis começar:
   * quem vem de anúncio não conhece a clínica, então uma resposta imperfeita da
   * IA custa menos do que custaria com um paciente antigo.
   */
  soDeAnuncio: boolean;
  /**
   * Só fala quando a clínica AINDA NÃO falou nesta conversa.
   *
   * Diferente de `soParaConversaNova`: uma conversa aberta há três dias com dez
   * mensagens trocadas é "nova" pela janela de sete dias, mas já TEM histórico —
   * e entrar no meio dela é a IA falando por cima de um atendimento que já
   * estava acontecendo.
   */
  soSemHistorico: boolean;
}

export interface EstadoDaSessao {
  /** Quando uma pessoa assumiu a conversa. Nulo = a IA ainda pode falar. */
  humanoAssumiuEm: string | null;
}

export interface MensagemRecebida {
  conteudo: string | null;
  /** true quando a mensagem saiu da clínica (a própria IA, ou uma pessoa). */
  daClinica: boolean;
  /** Nota interna: fica registrada na conversa mas não vai ao paciente. */
  privada: boolean;
  /** true quando veio de um grupo do WhatsApp. */
  ehGrupo: boolean;
  /**
   * A pessoa já tem ficha de paciente na clínica.
   *
   * Chega como FATO, resolvido por quem tem banco à mão — esta função continua
   * pura. Foi assim que `ehGrupo` entrou.
   */
  ehPaciente: boolean;
  /** A conversa nasceu dentro da janela de "contato novo". */
  conversaNova: boolean;
  /** A pessoa chegou clicando num anúncio. Fato, resolvido por quem lê o
   *  payload do WhatsApp. */
  veioDeAnuncio: boolean;
  /** Ninguém da clínica falou nesta conversa ainda. */
  semHistorico: boolean;
  /**
   * Esta mensagem é a resposta que a PRÓPRIA IA acabou de mandar, voltando pelo
   * webhook.
   *
   * ── Por que este fato existe ──────────────────────────────────────────
   *
   * A Evolution devolve pelo mesmo webhook tudo que o número manda, inclusive o
   * que a IA mandou: medido em 27/09, são 830 mensagens `fromMe` chegando por
   * esse caminho. Sem distinguir, a resposta da IA voltava como "mensagem da
   * própria clínica" — e é ESSE motivo que `atender` transforma em "humano
   * assumiu a conversa". A IA respondia uma vez, marcava a conversa como
   * assumida por uma pessoa e se calava para sempre. Pior que nunca ter
   * respondido.
   *
   * Fato, e não dedução aqui dentro: quem sabe o que a IA mandou é quem tem o
   * registro dela à mão.
   */
  ecoDaPropriaIa: boolean;
}

export type MotivoDeIgnorar =
  | "agente desligado"
  | "disjuntor aberto"
  | "humano assumiu a conversa"
  | "mensagem de grupo"
  | "conversa de paciente"
  | "conversa antiga"
  | "não veio de anúncio"
  | "conversa já tem histórico"
  | "eco da própria IA"
  | "mensagem da própria clínica"
  | "nota interna"
  | "mensagem sem texto";

export type Decisao = { responde: true } | { responde: false; motivo: MotivoDeIgnorar };

/**
 * A ordem importa e não é arbitrária.
 *
 * Do mais barato e mais definitivo para o mais específico: desligado e
 * disjuntor não dependem da conversa; humano-assumiu vale para a conversa
 * inteira; o resto olha a mensagem. Assim o motivo gravado é sempre a razão
 * MAIS FORTE de não responder, e não a primeira que por acaso foi checada.
 */
export function decidirSeResponde(
  agente: EstadoDoAgente,
  sessao: EstadoDaSessao,
  mensagem: MensagemRecebida,
  agora: Date = new Date(),
): Decisao {
  if (!agente.ligado) return { responde: false, motivo: "agente desligado" };

  if (agente.circuitoAbertoAte && new Date(agente.circuitoAbertoAte) > agora) {
    return { responde: false, motivo: "disjuntor aberto" };
  }

  // Permanente, não por mensagem: quando a recepção assume um atendimento, a IA
  // não pode voltar a falar na mensagem seguinte só porque aquela mensagem
  // passou nos outros filtros. Quem devolve a conversa é uma pessoa, na tela.
  if (sessao.humanoAssumiuEm) {
    return { responde: false, motivo: "humano assumiu a conversa" };
  }

  // ── Grupo ───────────────────────────────────────────────────────────
  //
  // Continua ANTES de "mensagem da própria clínica", e agora é o ÚNICO filtro
  // que fica na frente dela: a mensagem de alguém da equipe num grupo seria
  // lida como "uma pessoa assumiu a conversa" e gravaria `human_took_over_at`
  // num grupo — sujando a sessão de uma conversa que nunca deveria existir.
  //
  // São 12 grupos na base, todos internos: "#NÓS Floripa - Gestão", "Grupo de
  // Estudos Dr. Mauro K". Nenhum de paciente. Um agente solto ali responderia
  // à conversa da equipe sobre os pacientes, na frente de todo mundo, achando
  // que fala com alguém que perguntou preço de limpeza.
  //
  // Enquanto o número esteve no CRM isto nem se colocava: o CRM não entregava
  // grupo. A conexão própria entrega.
  if (mensagem.ehGrupo) return { responde: false, motivo: "mensagem de grupo" };

  // ── QUEM falou vem antes de COM QUEM se fala ────────────────────────
  //
  // Estes três subiram para cá em 29/09, e o motivo está numa conversa real.
  //
  // Às 18:40 a Dra. Mariane digitou "Oii", "Boa tarde", "Tudo bem?". As três
  // saíram do log como **"conversa já tem histórico"** — um filtro de público,
  // que rodava antes. E só "mensagem da própria clínica" vira
  // `human_took_over_at` em `atender`. Resultado: a IA não soube que uma pessoa
  // tinha entrado, respondeu por cima dela às 18:40:17 e seguiu respondendo por
  // cinco minutos, até a Dra. escrever de novo e pedir desculpas ao paciente.
  //
  // A ordem antiga tinha uma razão — não sujar com `human_took_over_at` a
  // sessão de uma conversa que a IA nunca atenderia. Mas essa sujeira é
  // inofensiva (a marca diz uma verdade: uma pessoa está ali), e o preço de
  // evitá-la era a IA falar por cima da dentista. Grupo continua na frente
  // porque lá a marca seria falsa, não apenas inútil.
  //
  // ── A própria resposta, voltando ────────────────────────────────────
  //
  // O eco vem IMEDIATAMENTE antes de "mensagem da própria clínica" porque é um
  // caso dela, mais específico, e a diferença entre os dois motivos é a
  // diferença entre a IA seguir atendendo e a IA se calar para sempre.
  if (mensagem.daClinica && mensagem.ecoDaPropriaIa) {
    return { responde: false, motivo: "eco da própria IA" };
  }

  // Sem isto o agente responderia a própria resposta, em laço.
  if (mensagem.daClinica) return { responde: false, motivo: "mensagem da própria clínica" };

  if (mensagem.privada) return { responde: false, motivo: "nota interna" };

  // ── Quem a IA pode atender ──────────────────────────────────────────
  //
  // Ela responde por nós só o contato que chegou agora e ainda não é
  // paciente — o do anúncio. Paciente tem histórico, tratamento em curso e
  // combinado com a recepção; lead de três meses atrás não é contato novo, é
  // lead esquecido, e quem fala com ele é gente.
  //
  // Estes vêm DEPOIS de quem falou: uma mensagem da equipe tem de ser
  // reconhecida como da equipe mesmo numa conversa que a IA não atenderia —
  // ver o bloco acima, e a conversa de 29/09 que trouxe essa mudança.
  //
  // Paciente antes de antiga porque é propriedade da pessoa e não muda; a
  // idade muda quando alguém mexe na janela.
  if (agente.soParaNaoPaciente && mensagem.ehPaciente) {
    return { responde: false, motivo: "conversa de paciente" };
  }

  if (agente.soParaConversaNova && !mensagem.conversaNova) {
    return { responde: false, motivo: "conversa antiga" };
  }

  // ── Os dois filtros mais estreitos ──────────────────────────────────
  //
  // Vêm por último, e nesta ordem, porque o motivo
  // gravado tem de ser o mais forte. "Já é paciente" diz mais sobre quem a
  // pessoa é do que "não veio de anúncio": a mesma pessoa pode voltar por um
  // anúncio amanhã, mas continua sendo paciente.
  //
  // "Não veio de anúncio" antes de "já tem histórico" porque a origem é
  // propriedade da conversa desde o primeiro segundo; o histórico aparece
  // depois, quando alguém responde.
  if (agente.soDeAnuncio && !mensagem.veioDeAnuncio) {
    return { responde: false, motivo: "não veio de anúncio" };
  }

  // Aqui está a diferença que importa em relação a "conversa antiga": uma
  // conversa de ontem com dez mensagens trocadas passa pela janela de sete dias
  // e NÃO pode ser assumida pela IA. Entrar no meio dela é falar por cima de um
  // atendimento que já estava em andamento.
  if (agente.soSemHistorico && !mensagem.semHistorico) {
    return { responde: false, motivo: "conversa já tem histórico" };
  }

  // Foto sem legenda, áudio, figurinha: não há texto para responder. Um agente
  // que responde "não entendi" a cada figurinha é pior que um que fica quieto.
  if (!String(mensagem.conteudo ?? "").trim()) {
    return { responde: false, motivo: "mensagem sem texto" };
  }

  return { responde: true };
}

// ── Disjuntor ──────────────────────────────────────────────────────────────

/** Falhas seguidas antes de parar, e por quanto tempo. */
export const LIMITE_DE_FALHAS = 5;
export const JANELA_DO_DISJUNTOR_MS = 30_000;

export interface EstadoDoDisjuntor {
  falhas: number;
  abertoAte: string | null;
}

/** Uma falha a mais. Ao bater o limite, abre e ZERA o contador — senão a
 *  próxima falha sozinha reabriria imediatamente. */
export function registrarFalha(
  atual: EstadoDoDisjuntor,
  agora: Date = new Date(),
): EstadoDoDisjuntor {
  const falhas = atual.falhas + 1;
  if (falhas >= LIMITE_DE_FALHAS) {
    return {
      falhas: 0,
      abertoAte: new Date(agora.getTime() + JANELA_DO_DISJUNTOR_MS).toISOString(),
    };
  }
  return { falhas, abertoAte: atual.abertoAte };
}

/** Sucesso zera tudo: o que importa são falhas SEGUIDAS. Cinco falhas
 *  espalhadas ao longo de um dia bem-sucedido não são um serviço fora do ar. */
export function registrarSucesso(): EstadoDoDisjuntor {
  return { falhas: 0, abertoAte: null };
}
