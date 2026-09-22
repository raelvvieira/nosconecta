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
}

export type MotivoDeIgnorar =
  | "agente desligado"
  | "disjuntor aberto"
  | "humano assumiu a conversa"
  | "mensagem de grupo"
  | "conversa de paciente"
  | "conversa antiga"
  | "mensagem da própria clínica"
  | "nota interna"
  | "mensagem sem texto";

export type Decisao =
  | { responde: true }
  | { responde: false; motivo: MotivoDeIgnorar };

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
  // Vem ANTES de "mensagem da própria clínica" de propósito: se ficasse
  // depois, a primeira mensagem de alguém da equipe num grupo seria lida como
  // "uma pessoa assumiu a conversa" e gravaria `human_took_over_at` num grupo
  // — sujando a sessão de uma conversa que nunca deveria ter existido.
  //
  // São 12 grupos na base, todos internos: "#NÓS Floripa - Gestão", "Grupo de
  // Estudos Dr. Mauro K". Nenhum de paciente. Um agente solto ali responderia
  // à conversa da equipe sobre os pacientes, na frente de todo mundo, achando
  // que fala com alguém que perguntou preço de limpeza.
  //
  // Enquanto o número esteve no CRM isto nem se colocava: o CRM não entregava
  // grupo. A conexão própria entrega.
  if (mensagem.ehGrupo) return { responde: false, motivo: "mensagem de grupo" };

  // ── Quem a IA pode atender ──────────────────────────────────────────
  //
  // Ela responde por nós só o contato que chegou agora e ainda não é
  // paciente — o do anúncio. Paciente tem histórico, tratamento em curso e
  // combinado com a recepção; lead de três meses atrás não é contato novo, é
  // lead esquecido, e quem fala com ele é gente.
  //
  // Estes dois vêm DEPOIS de grupo porque grupo nunca é paciente e "conversa
  // nova" não quer dizer nada num grupo: o motivo mais afiado se perderia.
  //
  // E vêm ANTES de "mensagem da própria clínica", que é o ponto que importa:
  // é esse motivo que `atender` transforma em `human_took_over_at`. Se
  // ficassem depois, cada mensagem que a recepção manda numa conversa de
  // paciente marcaria "humano assumiu" numa conversa que a IA nunca poderia
  // atender — a mesma sujeira de sessão que o filtro de grupo acima existe
  // para impedir.
  //
  // Paciente antes de antiga porque é propriedade da pessoa e não muda; a
  // idade muda quando alguém mexe na janela.
  if (agente.soParaNaoPaciente && mensagem.ehPaciente) {
    return { responde: false, motivo: "conversa de paciente" };
  }

  if (agente.soParaConversaNova && !mensagem.conversaNova) {
    return { responde: false, motivo: "conversa antiga" };
  }

  // Sem isto o agente responderia a própria resposta, em laço.
  if (mensagem.daClinica) return { responde: false, motivo: "mensagem da própria clínica" };

  if (mensagem.privada) return { responde: false, motivo: "nota interna" };

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
    return { falhas: 0, abertoAte: new Date(agora.getTime() + JANELA_DO_DISJUNTOR_MS).toISOString() };
  }
  return { falhas, abertoAte: atual.abertoAte };
}

/** Sucesso zera tudo: o que importa são falhas SEGUIDAS. Cinco falhas
 *  espalhadas ao longo de um dia bem-sucedido não são um serviço fora do ar. */
export function registrarSucesso(): EstadoDoDisjuntor {
  return { falhas: 0, abertoAte: null };
}
