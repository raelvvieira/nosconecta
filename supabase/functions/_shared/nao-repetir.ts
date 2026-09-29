// Ler o conjunto de mensagens, e não repetir o que já foi dito.
//
// ── A conversa que trouxe este arquivo ─────────────────────────────────
//
// 29/09, 18:40. A pessoa manda quatro bolhas em dezessete segundos:
//
//   18:40:53  Oii tudo
//   18:40:56  Boa tarde
//   18:41:01  Nunca fiz
//   18:41:10  Aonde fica consultório
//
// E recebe TRÊS respostas, com sete segundos entre elas:
//
//   18:41:24  Boa tarde! A NÓS Florianópolis fica na R. José Brognoli, 117...
//   18:41:31  Entendi! A NÓS Florianópolis fica na R. José Brognoli, 117...
//   18:41:38  Fica na NÓS Florianópolis: R. José Brognoli, 117...
//
// O primeiro defeito — três respostas onde cabia uma — é o teto da busca da
// espera, consertado em `atendimento.ts`. Mas ele não explica o que a clínica
// viu, que foi PIOR: as três dizem a mesma coisa, com abertura diferente.
//
// ── Por que elas se repetiram ──────────────────────────────────────────
//
// Duas causas, e as duas estão neste arquivo.
//
// **Uma: o prompt pedia a última bolha.** O histórico ia como pano de fundo
// ("Conversa até agora") e embaixo vinha "Mensagem que acabou de chegar do
// paciente: <uma só>". Três execuções, três "mensagens que acabaram de
// chegar", três respostas — cada uma legítima para a bolha que recebeu, e as
// três olhando o mesmo histórico, onde a pergunta do endereço já estava. Daí
// as três darem o endereço.
//
// **Duas: elas não se enxergavam.** As três execuções correram ao mesmo tempo:
// cada uma esperou, leu o histórico e chamou o modelo antes de qualquer outra
// ter enviado. Nenhuma podia saber das irmãs, porque quando leram o histórico
// nenhuma resposta existia ainda.
//
// ── O que este arquivo faz ─────────────────────────────────────────────
//
// `blocoSemResposta` separa o histórico em duas partes: o que já foi
// conversado, e o rabo de mensagens do paciente que ainda ninguém respondeu.
// É esse rabo que vai ao modelo como "responda a ISTO, junto".
//
// `jaDisseIssoAgora` é a rede embaixo: comparado o que se vai enviar com o que
// saiu nos últimos minutos, mensagem que só repete não sai. Não conserta a
// corrida — conserta o que a pessoa lê quando a corrida acontece.

import type { FalaDaConversa } from "./historico-da-conversa.ts";

/** Palavras, sem acento, sem pontuação, sem maiúsculas. É a forma em que duas
 *  frases "iguais com outras palavras de abertura" ficam comparáveis. */
function palavras(texto: string | null): string[] {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * O quanto duas frases dizem a mesma coisa, de 0 a 1.
 *
 * Coeficiente de Dice sobre o CONJUNTO de palavras, não sobre a ordem: é
 * exatamente o caso das três respostas de 18:41, que trocam a abertura e a
 * ordem e mantêm o miolo. Sobre conjunto e não sobre lista porque repetir a
 * mesma palavra três vezes não deixa duas frases mais parecidas.
 *
 * Duas frases vazias dão 0, e não 1: "nada" não é parecido com "nada", é
 * ausência dos dois lados, e devolver 1 faria toda mensagem sem texto ser
 * barrada como repetida.
 */
export function semelhanca(a: string | null, b: string | null): number {
  const A = new Set(palavras(a));
  const B = new Set(palavras(b));
  if (!A.size || !B.size) return 0;
  let comuns = 0;
  for (const p of A) if (B.has(p)) comuns++;
  return (2 * comuns) / (A.size + B.size);
}

/** A partir de quanto duas respostas são a mesma resposta.
 *
 *  0,80 medido nas frases reais desta clínica: as três do endereço ficam entre
 *  0,89 e 0,96 uma da outra, e pares legítimos da mesma conversa ("Oii, aqui é
 *  a Luna" contra "Perfeito, vou deixar com a equipe") ficam abaixo de 0,3.
 *  A folga entre os dois grupos é grande, e é ela que permite um número fixo. */
export const LIMITE_DE_REPETICAO = 0.8;

/**
 * Isto que eu vou mandar é o que eu já mandei agora há pouco?
 *
 * Devolve a frase anterior que casou, para o registro dizer COM O QUE se
 * pareceu — "resposta repetida" sozinho não deixa ninguém conferir se o corte
 * foi justo. `null` quando é resposta nova.
 *
 * Pura de propósito: quem lê o banco é `oQueEuMandei`, e a decisão fica aqui,
 * onde o teste alcança sem servidor.
 */
export function jaDisseIssoAgora(
  candidato: string | null,
  jaDitas: (string | null)[],
  limite = LIMITE_DE_REPETICAO,
): string | null {
  if (!palavras(candidato).length) return null;
  for (const anterior of jaDitas) {
    if (semelhanca(candidato, anterior) >= limite) return String(anterior ?? "");
  }
  return null;
}

/** O histórico partido em "o que já foi conversado" e "o que está sem
 *  resposta". Ver `blocoSemResposta`. */
export interface ConversaPartida {
  /** Tudo que veio antes do bloco, na ordem, para ir como contexto. */
  anteriores: FalaDaConversa[];
  /** As mensagens do paciente que ninguém respondeu ainda, na ordem em que
   *  ele escreveu. Vazio quando a última fala da conversa é da clínica. */
  semResposta: string[];
}

/**
 * Separa o rabo de mensagens do paciente que ainda não foram respondidas.
 *
 * O critério é o único que o espelho sustenta sem coluna nova: a partir da
 * última fala DA CLÍNICA, tudo que é do paciente está sem resposta. Se a
 * clínica nunca falou, a conversa inteira está sem resposta — é a pessoa
 * chegando pelo anúncio e mandando três bolhas antes de qualquer resposta.
 *
 * Por que isto importa para a repetição: o modelo passa a receber as quatro
 * bolhas juntas e a escrever UMA resposta para as quatro. Antes ele recebia a
 * última e via as outras como "conversa até agora" — o que o fazia responder
 * de novo o que já estava lá.
 */
export function blocoSemResposta(historico: FalaDaConversa[]): ConversaPartida {
  const falas = historico ?? [];
  let corte = falas.length;
  while (corte > 0 && falas[corte - 1].deQuem === "paciente") corte--;
  return {
    anteriores: falas.slice(0, corte),
    semResposta: falas
      .slice(corte)
      .map((f) => String(f.texto ?? "").trim())
      .filter(Boolean),
  };
}
