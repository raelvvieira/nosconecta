// O emoji da Luna sai na medida, antes de a mensagem chegar ao paciente.
//
// ── Por que um filtro, e não um pedido ──────────────────────────────────
//
// O manual já diz "no máximo um emoji por mensagem". Só que o mesmo manual traz
// um 😊 em quase todo exemplo de fala, e o modelo copia os exemplos, não a
// regra. De 15 a 28/10, 230 das 459 mensagens da Luna tinham emoji (226 eram o
// mesmo 😊). Em conversa de verdade, uma pessoa sorri de vez em quando, não a
// cada frase. É o mesmo caso do travessão (`sem-travessao.ts`): pedir não
// resolve, o filtro é a garantia.
//
// ── A regra ─────────────────────────────────────────────────────────────
//
// 1. No máximo UM emoji por resposta (o primeiro; os outros saem).
// 2. Nenhum, se uma das duas últimas respostas da Luna nesta conversa já tinha
//    emoji. Na prática: um sorriso a cada três mensagens, no máximo.
//
// ── O que não pode estragar ─────────────────────────────────────────────
//
// O emoji muitas vezes faz papel de ponto: "Oii, aqui é a Luna 😊 Qual
// procedimento você quer avaliar?". Tirar só o emoji deixaria "Luna Qual
// procedimento". Então, quando ele separava duas frases, entra um ponto.

/** Um emoji inteiro: o pictograma, ou a bandeira, com tom de pele, seletor de
 *  variação e as junções (👩‍⚕️ é um emoji só, feito de três). */
const EMOJI =
  /(?:\p{Extended_Pictographic}|\p{Regional_Indicator}{2})(?:️|[\u{1F3FB}-\u{1F3FF}])*(?:‍\p{Extended_Pictographic}(?:️|[\u{1F3FB}-\u{1F3FF}])*)*/gu;

/** Quantas respostas anteriores da Luna, sem emoji, liberam o próximo. */
const RESPOSTAS_SEM_EMOJI_ANTES = 2;

export function temEmoji(texto: string): boolean {
  EMOJI.lastIndex = 0;
  const achou = EMOJI.test(String(texto ?? ""));
  EMOJI.lastIndex = 0;
  return achou;
}

/**
 * Deixa o emoji da resposta na medida.
 *
 * `anteriores` são as respostas que a Luna já mandou nesta conversa, da mais
 * nova para a mais velha (a ordem de `oQueEuMandei`).
 */
export function emojiNaMedida(texto: string, anteriores: readonly string[] = []): string {
  const original = String(texto ?? "");
  if (!temEmoji(original)) return original;

  const sorriuHaPouco = anteriores.slice(0, RESPOSTAS_SEM_EMOJI_ANTES).some(temEmoji);
  let mantidos = sorriuHaPouco ? 0 : 1;

  const saida = original.replace(EMOJI, (emoji, posicao: number, tudo: string) => {
    if (mantidos > 0) {
      mantidos--;
      return emoji;
    }
    const antes = tudo.slice(0, posicao).replace(/[ \t]+$/, "");
    const depois = tudo.slice(posicao + emoji.length).replace(/^[ \t]+/, "");
    // Separava duas frases: o emoji era o ponto. Só quando nada já fecha a
    // frase antes dele e a próxima começa com maiúscula.
    const eraOPonto = antes !== "" && !/[.!?…,;:\n]$/.test(antes) && /^\p{Lu}/u.test(depois);
    return eraOPonto ? ". " : " ";
  });

  return saida
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}
