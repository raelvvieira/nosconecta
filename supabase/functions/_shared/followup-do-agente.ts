// Quando a Luna volta em quem sumiu.
//
// ── O que não existia ──────────────────────────────────────────────────
//
// Nada. Medido em 30/09: nenhuma função de follow-up, e as três automações do
// sistema são todas de agenda (aviso de agendamento, lembrete, leitura da
// resposta de confirmação). A tela do Agente já dizia isso num comentário: a
// tela de "regras de comportamento" foi removida em parte porque follow-up por
// silêncio era uma ação que o motor não tinha.
//
// O que isso custa, nas 549 conversas que falam de clareamento: em 262 delas a
// clínica falou por último e a pessoa sumiu entre 7 e 30 dias atrás. Ninguém
// voltou em nenhuma.
//
// ── A decisão que dominou este arquivo: ligar não acorda o passado ─────
//
// O caminho óbvio seria o cron achar toda conversa parada e voltar nela. No
// dia em que a clínica ligasse o interruptor, 262 pessoas receberiam mensagem
// da Luna ao mesmo tempo — muitas de conversas de dois meses atrás, sobre um
// assunto que elas já esqueceram.
//
// Isso não é follow-up, é disparo. E disparo que a pessoa não espera vira
// bloqueio, que no WhatsApp derruba a reputação do número e leva embora
// também as conversas que funcionavam.
//
// Então `ligadoDesde` é obrigatório: o cron só volta em conversa que ficou
// parada DEPOIS de alguém ligar a chave. Recuperar o que já estava parado é
// trabalho deliberado, revisado por uma pessoa, e não coisa de cron.
//
// ── Por que dois toques ────────────────────────────────────────────────
//
// Escolha da clínica em 30/09: um em ~20 horas e outro uns três dias depois,
// cada um com ângulo diferente. Depois disso ela para e a conversa fica
// marcada para uma pessoa decidir. Um toque só deixa dinheiro na mesa; três
// começa a irritar, e irritação no WhatsApp tem custo de número.

/** O estado de uma conversa, como o banco a entrega. */
export interface EstadoDaConversa {
  /** `ai_agent_sessions.human_took_over_at`. Preenchido = alguém da clínica
   *  entrou, e aí a conversa não é mais da Luna. */
  humanoAssumiu: boolean;
  ultimaEntrada: string | null;
  ultimaSaida: string | null;
  criadaEm: string;
  followupsEnviados: number;
  ultimoFollowupEm: string | null;
  veioDeAnuncio: boolean;
  /** Virou consulta. Vem da RPC `agendamento_criado_apos`, a mesma que as
   *  lições usam — duas leituras de "agendou?" divergiriam. */
  jaAgendou: boolean;
}

export interface RitmoDoFollowup {
  ligado: boolean;
  /** Horas de silêncio antes do primeiro toque. */
  horasParaOPrimeiro: number;
  /** Horas depois do PRIMEIRO toque para o segundo — e não desde o silêncio,
   *  senão os dois cairiam quase juntos. */
  horasParaOSegundo: number;
  maximoDeToques: number;
  /** Quando a clínica ligou a chave. Ver o comentário longo acima: sem isto,
   *  ligar vira disparo para o acervo inteiro. */
  ligadoDesde: string | null;
  /** Não voltar em conversa mais velha que isto. Conversa de dois meses não é
   *  follow-up, é abordagem nova — e merece decisão de gente. */
  diasDeValidade: number;
}

export const RITMO_PADRAO_DO_FOLLOWUP: RitmoDoFollowup = {
  // Nasce DESLIGADO. Uma coisa nova que manda mensagem no WhatsApp de gente
  // real não se liga sozinha.
  ligado: false,
  horasParaOPrimeiro: 20,
  horasParaOSegundo: 72,
  maximoDeToques: 2,
  ligadoDesde: null,
  diasDeValidade: 30,
};

export type Decisao = { volta: true; toque: number } | { volta: false; motivo: string };

const HORA = 3_600_000;

/**
 * Esta conversa merece um toque agora?
 *
 * A ordem das checagens é a ordem em que elas aparecem no registro, e foi
 * escolhida para o motivo gravado ser o MAIS DECISIVO, não o primeiro que
 * casou: "humano assumiu" explica melhor que "silêncio ainda curto", mesmo
 * quando as duas coisas são verdade.
 */
export function decidirFollowup(c: EstadoDaConversa, r: RitmoDoFollowup, agora: Date): Decisao {
  if (!r.ligado) return { volta: false, motivo: "follow-up desligado" };

  // Uma pessoa entrou na conversa. Ela é dona do assunto agora, e uma mensagem
  // automática por cima é o "desculpa nossa ia" de novo.
  if (c.humanoAssumiu) return { volta: false, motivo: "humano assumiu a conversa" };

  if (c.jaAgendou) return { volta: false, motivo: "já agendou" };

  if (!c.veioDeAnuncio) return { volta: false, motivo: "não veio de anúncio" };

  // A Luna precisa ter falado: sem isso não há conversa para retomar.
  if (!c.ultimaSaida) return { volta: false, motivo: "a Luna ainda não falou aqui" };

  // A pessoa nunca respondeu nada? Ainda vale o toque — é justamente quem
  // clicou no anúncio e não voltou. Mas ela tem de ter escrito ao menos a
  // primeira mensagem, senão não existe ninguém do outro lado.
  if (!c.ultimaEntrada) return { volta: false, motivo: "a pessoa nunca escreveu" };

  const entrada = new Date(c.ultimaEntrada).getTime();
  const saida = new Date(c.ultimaSaida).getTime();

  // A pessoa falou por último: isto não é conversa abandonada, é resposta
  // pendente. Quem cuida disso é o filtro "Sem resposta" da caixa de entrada.
  if (entrada > saida) return { volta: false, motivo: "a pessoa está esperando resposta" };

  if (c.followupsEnviados >= r.maximoDeToques) {
    return { volta: false, motivo: "já tentei o bastante" };
  }

  const idadeEmDias = (agora.getTime() - new Date(c.criadaEm).getTime()) / (24 * HORA);
  if (idadeEmDias > r.diasDeValidade) {
    return { volta: false, motivo: "conversa velha demais para follow-up" };
  }

  // O silêncio começou antes de a clínica ligar a chave: não acordar.
  if (r.ligadoDesde && saida < new Date(r.ligadoDesde).getTime()) {
    return { volta: false, motivo: "já estava parada antes de o follow-up ser ligado" };
  }

  // O relógio do primeiro toque conta do silêncio; o do segundo, do toque
  // anterior.
  const toque = c.followupsEnviados + 1;
  const desde = c.ultimoFollowupEm ? new Date(c.ultimoFollowupEm).getTime() : saida;
  const esperaEmHoras = toque === 1 ? r.horasParaOPrimeiro : r.horasParaOSegundo;

  if (agora.getTime() - desde < esperaEmHoras * HORA) {
    return { volta: false, motivo: "silêncio ainda curto" };
  }

  return { volta: true, toque };
}

/** Um dia da jornada da clínica, como `clinic_business_hours` o guarda. */
export interface DiaDaJornada {
  weekday: number;
  /** `'sob_consulta'` é o domingo da clínica: não é hora de atendimento. */
  modo: string;
  abre: string | null;
  fecha: string | null;
}

/** Nunca antes disto, nem depois, mesmo que a clínica abra fora. A Dra. manda
 *  mensagem às 22h38 e está no direito dela; uma mensagem AUTOMÁTICA nesse
 *  horário é outra coisa, e quem recebe não sabe a diferença. */
export const MAIS_CEDO = 9;
export const MAIS_TARDE = 19;

/**
 * Agora é hora de mandar?
 *
 * **Falha fechada**: sem jornada cadastrada, a resposta é não. Não se sabe se
 * a clínica está aberta, e o custo de errar para o lado de mandar é uma
 * mensagem automática de madrugada.
 *
 * `hora` e `weekday` entram prontos, calculados no fuso da clínica por quem
 * chama (`agoraNaClinica`). Fuso dentro de função pura é a receita de um teste
 * que passa na máquina de quem escreveu e falha no servidor.
 */
export function dentroDaJanela(hora: number, weekday: number, jornada: DiaDaJornada[]): boolean {
  if (hora < MAIS_CEDO || hora >= MAIS_TARDE) return false;
  if (!jornada.length) return false;

  const doDia = jornada.filter((j) => j.weekday === weekday && j.modo !== "sob_consulta");
  if (!doDia.length) return false;

  // Qualquer unidade aberta nesta hora basta: a mensagem sai do mesmo número.
  return doDia.some((j) => {
    const abre = horaDe(j.abre);
    const fecha = horaDe(j.fecha);
    if (abre === null || fecha === null) return false;
    return hora >= abre && hora < fecha;
  });
}

/** "09:00:00" vira 9. Nulo, vazio ou torto vira `null`, e `null` fecha a
 *  janela em vez de abrir.
 *
 *  O teste achou o defeito aqui: `Number("")` é 0, não `NaN`. Sem a checagem
 *  de duas casas numéricas, um `opens_at` vazio no cadastro virava "abre à
 *  meia-noite" e a janela ficava aberta a madrugada inteira — exatamente o
 *  contrário do que esta função existe para garantir. */
function horaDe(valor: string | null): number | null {
  const cru = String(valor ?? "").trim();
  if (!/^\d{1,2}(:|$)/.test(cru)) return null;
  const n = Number(cru.slice(0, 2).replace(":", ""));
  return Number.isFinite(n) && n >= 0 && n <= 23 ? n : null;
}

/** O ângulo de cada toque. É o que impede o segundo de ser o primeiro escrito
 *  com outras palavras — que é exatamente o defeito que as três respostas
 *  repetidas de 29/09 mostraram. */
export const ANGULO_DO_TOQUE: Record<number, string> = {
  1: [
    "Retome de onde a conversa parou. Uma pergunta só, leve, sobre o que ficou",
    "em aberto — não recomece a apresentação e não repita o preço se ele já foi",
    "dito. Se a pessoa tinha uma dúvida pendente, responda ela.",
  ].join("\n"),
  2: [
    "Última tentativa. Mude o ângulo: em vez de perguntar de novo, ofereça algo",
    "concreto — um horário, ou a possibilidade de tirar a dúvida por aqui. E",
    "deixe a porta aberta sem cobrar resposta: 'se fizer sentido depois, me",
    "chama'. Não pergunte a mesma coisa do toque anterior.",
  ].join("\n"),
};

/** O pedido que vai ao modelo para escrever o toque. Puro, para o teste poder
 *  conferir que o ângulo e a proibição de repetir estão lá. */
export function promptDoFollowup(entrada: {
  toque: number;
  historico: string;
  horasDeSilencio: number;
}): string {
  return [
    "Esta conversa parou e você vai retomá-la.",
    "",
    `Conversa até agora:\n${entrada.historico}`,
    "",
    `Faz cerca de ${Math.round(entrada.horasDeSilencio)} horas que a pessoa não responde.`,
    "",
    ANGULO_DO_TOQUE[entrada.toque] ?? ANGULO_DO_TOQUE[1],
    "",
    "Regras deste tipo de mensagem:",
    "- UMA mensagem curta, do tamanho do que uma pessoa digita no celular.",
    "- Não repita informação que já está acima marcada com VOCÊ.",
    "- Não se desculpe por estar escrevendo e não diga que é mensagem",
    "  automática.",
    "- Não invente preço, horário nem endereço que não esteja nesta instrução.",
    "",
    "Escreva só a mensagem, sem aspas e sem explicar o que está fazendo.",
  ].join("\n");
}
