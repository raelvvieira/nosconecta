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
}

export interface EstadoDaSessao {
  /** Quando uma pessoa assumiu a conversa. Nulo = a IA ainda pode falar. */
  humanoAssumiuEm: string | null;
}

export interface MensagemRecebida {
  conteudo: string | null;
  /** true quando a mensagem saiu da clínica (a própria IA, ou uma pessoa). */
  daClinica: boolean;
  /** Nota interna: fica registrada no CRM mas não vai ao paciente. */
  privada: boolean;
}

export type MotivoDeIgnorar =
  | "agente desligado"
  | "disjuntor aberto"
  | "humano assumiu a conversa"
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
