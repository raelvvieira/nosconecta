// Busca de pessoas: UMA regra para paciente, contato, conversa e funil.
//
// Antes cada tela tinha a sua: uma ignorava acento, outra não; uma achava o
// telefone, outra só o nome; o 9º dígito derrubava a comparação. O resultado
// era a mesma pessoa aparecendo numa tela e sumindo em outra.
//
// Regras:
//  - sem diferença de maiúscula/minúscula nem de acento ("marcia" acha "Márcia");
//  - várias palavras valem todas, em qualquer ordem ("sayuri paula" acha
//    "Paula Sayuri Pereira");
//  - número: compara só dígitos, em qualquer formatação, e tolera o 9º dígito
//    (quem digita 4896266217 acha 5548996266217).

/** Minúsculo e sem acento — o que vale para comparar texto. */
export function semAcento(texto: string | null | undefined): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

/** O telefone guardado casa com os dígitos digitados? */
export function telefoneCasa(telefone: string | null | undefined, digitosDigitados: string) {
  if (!digitosDigitados) return false;
  const d = String(telefone ?? "").replace(/\D/g, "");
  if (!d) return false;
  if (d.includes(digitosDigitados)) return true;
  // Número completo digitado sem/com o 9º dígito: os 8 finais são os mesmos.
  return digitosDigitados.length >= 8 && d.endsWith(digitosDigitados.slice(-8));
}

/**
 * A pessoa casa com o que foi digitado?
 * `campos` são textos extras (e-mail, CPF…); busca vazia casa com todos.
 */
export function pessoaCasa(
  busca: string,
  pessoa: { name?: string | null; phone?: string | null },
  campos: Array<string | null | undefined> = [],
): boolean {
  const texto = semAcento(busca);
  if (!texto) return true;

  const digitos = busca.replace(/\D/g, "");
  // Só números (e símbolos de telefone): procura no telefone.
  if (digitos.length >= 3 && /^[\d\s()+.-]+$/.test(busca.trim())) {
    if (telefoneCasa(pessoa.phone, digitos)) return true;
    return campos.some((c) =>
      String(c ?? "")
        .replace(/\D/g, "")
        .includes(digitos),
    );
  }

  const alvo = semAcento([pessoa.name, ...campos].filter(Boolean).join(" "));
  const palavras = texto.split(/\s+/).filter(Boolean);
  if (palavras.every((p) => alvo.includes(p))) return true;
  // Misto ("Ana 4899"): o telefone também entra como texto.
  return digitos.length >= 3 && telefoneCasa(pessoa.phone, digitos);
}
