// O horário não sai antes do valor.
//
// ── O que aconteceu ─────────────────────────────────────────────────────
//
// 28/10, Camily: "Quero agendar uma avaliação!", "Clareamento dentário",
// "Florianópolis", e a Luna respondeu com dois horários. Em nenhum momento ela
// tinha ouvido o valor do clareamento, e a Dra. Mariane entrou na conversa para
// mandar a tabela. O manual manda ir direto à agenda diante de sinal de compra
// (A1.5 a A1.7, A7, B3), e a regra 8 da instrução deixava o preço esperar a
// qualificação: juntas, as duas faziam o horário passar na frente do valor.
//
// A instrução agora diz a ordem (regra 8, os dois caminhos). Isto é a rede: se
// a resposta oferece horário e nada na conversa fala de valor, o atendimento
// pede para a Luna reescrever uma vez, antes de enviar.
//
// ── O que conta como "valor" ────────────────────────────────────────────
//
// Um preço em reais, ou a explicação de que o valor depende da avaliação
// (o caminho certo quando a tabela não tem referência para o procedimento).
// "A avaliação é gratuita" sozinho NÃO conta: é justamente a frase que deixa a
// pessoa achar que o tratamento é de graça.

function semAcento(texto: string): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Um horário de agenda: "17h", "17h30", "às 9:30", "14 horas". */
const HORA = /\b([01]?\d|2[0-3])\s*(h(\s?[0-5]\d)?\b|:[0-5]\d\b|\s?horas?\b)/;
/** Um dia: dia da semana, "amanhã", "hoje à tarde" ou uma data 28/10. */
const DIA =
  /\b(segunda|terca|quarta|quinta|sexta|sabado|domingo|amanha|hoje|depois de amanha)\b|\b\d{1,2}\/\d{1,2}\b/;

/**
 * A mensagem oferece horário da agenda?
 *
 * Hora junto de um dia. Hora sozinha não basta: "o efeito dura 6 horas",
 * "aplica por 3 horas por dia" e "atendemos até as 19h" não são oferta.
 */
export function ofereceHorario(texto: string | null | undefined): boolean {
  const t = semAcento(texto ?? "");
  return HORA.test(t) && DIA.test(t);
}

/** Preço em reais ("R$ 399", "R$399,00", "399 reais"). */
const PRECO = /r\$\s?\d|\b\d{2,5}(,\d{2})?\s?reais\b/;
/** "O valor depende da avaliação", "orçamento depois da avaliação". */
const DEPENDE =
  /\b(valor|preco|orcamento)\b[^.?!\n]{0,80}\b(depende|definid|passad|feito)\w*[^.?!\n]{0,60}\bavalia/;

/** Este texto informa valor? */
export function informaValor(texto: string | null | undefined): boolean {
  const t = semAcento(texto ?? "");
  return PRECO.test(t) || DEPENDE.test(t);
}

/**
 * A resposta oferece horário sem que a pessoa tenha recebido valor nenhum
 * nesta conversa?
 *
 * `daClinica` são as falas da clínica já enviadas (da Luna ou da equipe): se a
 * Dra. mandou a tabela, o valor já chegou, e não importa quem mandou.
 */
export function horarioAntesDoValor(resposta: string, daClinica: readonly string[]): boolean {
  if (!ofereceHorario(resposta)) return false;
  if (informaValor(resposta)) return false;
  return !daClinica.some(informaValor);
}

/** O recado para a Luna reescrever. Vai no fim da instrução, só na segunda
 *  tentativa. */
export const CORRECAO_VALOR_ANTES_DO_HORARIO = [
  "",
  "## CORREÇÃO DA SUA RESPOSTA",
  "Sua resposta oferecia horários, mas a pessoa ainda não recebeu o valor do",
  "procedimento nesta conversa (regra nº 8). Reescreva: primeiro uma explicação",
  "curta da oferta pertinente com o valor da tabela desta instrução, separando a",
  "avaliação (sem custo) do procedimento (pago). Depois, os dois horários, se a",
  "cidade já estiver confirmada; se não estiver, pergunte a cidade. Quando a",
  "tabela não tiver valor para o procedimento, diga que o valor depende da",
  "avaliação, sem inventar orçamento.",
].join("\n");
