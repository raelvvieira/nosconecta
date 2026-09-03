/**
 * Nome e sobrenome separados.
 *
 * ── Por que separar ───────────────────────────────────────────────────────
 *
 * A Meta casa conversão com pessoa por hash, e são DOIS campos: `fn` (nome) e
 * `ln` (sobrenome), cada um com o seu próprio SHA-256. Enquanto a clínica
 * digitava tudo num campo só, a Edge Function tinha que adivinhar onde um
 * termina e o outro começa — e adivinhação errada não dá erro, só derruba o
 * casamento em silêncio, que é o pior jeito de uma integração falhar.
 *
 * Com os dois campos no cadastro, quem sabe o nome da pessoa é quem separa.
 *
 * ── A divisão automática continua existindo ──────────────────────────────
 *
 * Nem todo nome entra por formulário: vem do WhatsApp, do CRM, das fichas que
 * já estavam no banco. Para esses, `dividirNome` reproduz exatamente a regra
 * que a Edge Function já usava — primeira palavra no nome, TODO o resto no
 * sobrenome. Trocar essa regra agora mudaria o hash de quem já foi enviado.
 *
 * "Maria Silva Souza" → primeiro "Maria", sobrenome "Silva Souza".
 * Mandar só "Souza" em `ln` muda o hash inteiro e o match falha.
 */

export interface NomeEmPartes {
  primeiro: string;
  /** Vazio quando a pessoa só tem um nome — não é erro, é o dado que existe. */
  sobrenome: string;
  /** As duas partes de volta numa linha, para exibição, busca e o CRM. */
  completo: string;
}

const VAZIO: NomeEmPartes = { primeiro: "", sobrenome: "", completo: "" };

/** Espaços repetidos e das pontas viram um espaço simples. */
function limpar(valor: string | null | undefined): string {
  return (valor ?? "").replace(/\s+/g, " ").trim();
}

/** Quebra um nome escrito de uma vez só: primeira palavra, e o resto. */
export function dividirNome(nome: string | null | undefined): NomeEmPartes {
  const completo = limpar(nome);
  if (!completo) return VAZIO;
  const corte = completo.indexOf(" ");
  if (corte < 0) return { primeiro: completo, sobrenome: "", completo };
  return {
    primeiro: completo.slice(0, corte),
    sobrenome: completo.slice(corte + 1),
    completo,
  };
}

/** Junta as duas partes. Sobrenome vazio devolve só o nome, sem espaço sobrando. */
export function juntarNome(
  primeiro: string | null | undefined,
  sobrenome: string | null | undefined,
): string {
  return limpar(`${limpar(primeiro)} ${limpar(sobrenome)}`);
}

/**
 * A forma canônica do nome, venha ele de onde vier.
 *
 * As PARTES mandam quando existem: quem preencheu os dois campos do cadastro
 * sabe onde é a divisão, e o nome completo passa a ser o que sai deles. Só na
 * ausência delas — contato de WhatsApp, ficha antiga, importação — é que se
 * cai na divisão automática.
 */
export function montarNome(entrada: {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): NomeEmPartes {
  const primeiro = limpar(entrada.firstName);
  const sobrenome = limpar(entrada.lastName);
  if (primeiro || sobrenome) {
    // Só sobrenome preenchido não vira paciente sem nome: o que houver sobe
    // para `primeiro`, senão `completo` sairia com o campo errado ocupado.
    if (!primeiro) return { primeiro: sobrenome, sobrenome: "", completo: sobrenome };
    return { primeiro, sobrenome, completo: juntarNome(primeiro, sobrenome) };
  }
  return dividirNome(entrada.name);
}
