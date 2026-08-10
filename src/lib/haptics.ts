// Retorno tátil para os momentos em que a pessoa confirma alguma coisa.
//
// Importante saber antes de usar: o Safari do iPhone não implementa a Vibration
// API — nem na aba, nem com o app instalado na tela de início. Então isto vibra
// no Android e não faz nada no iPhone, silenciosamente.
//
// Por causa disso a regra é: a vibração **acompanha** um retorno visual, nunca
// o substitui. Nenhuma confirmação do app pode depender de sentir o aparelho,
// senão metade dos usuários fica sem confirmação nenhuma.
//
// Também respeitamos quem pediu menos movimento: quem marca "reduzir
// movimento" no sistema costuma estar pedindo menos estímulo em geral.

type Pattern = "select" | "commit" | "warn";

// Curtas de propósito. Vibração longa em interface de trabalho vira incômodo
// depois da décima vez, e este app é usado o dia inteiro.
const PATTERNS: Record<Pattern, number | number[]> = {
  select: 8, // passou por um alvo válido durante o arraste
  commit: 14, // soltou, salvou, confirmou
  warn: [12, 60, 12], // deu errado
};

function allowed(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof navigator.vibrate !== "function") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function haptic(pattern: Pattern = "commit"): void {
  if (!allowed()) return;
  try {
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    // Alguns navegadores lançam se a chamada não vier de um gesto do usuário.
    // Não é motivo para quebrar a ação que estava acontecendo.
  }
}
