// Variáveis de mensagem de disparo — o lado que SUBSTITUI, em Deno.
//
// A tela tem a lista espelhada em `src/lib/atendimentos/broadcastVars.ts` (dois
// runtimes, e Deno não importa de `src/`). Mudou aqui, muda lá — é o mesmo
// arranjo, e o mesmo cuidado, de `automation-vars.ts`.
//
// Por que só nome e primeiro nome: um disparo não tem agendamento, plano nem
// negociação por trás. O que existe por alvo é o que a fila guarda —
// `contact_name` e `phone`. Oferecer {{data}} ou {{procedimento}} aqui seria
// prometer um dado que não existe, e o resultado é a paciente recebendo uma
// mensagem com um buraco no meio.

export function primeiroNome(nome: string | null | undefined): string {
  const limpo = String(nome ?? "").trim();
  if (!limpo) return "";
  // Nome do WhatsApp costuma vir com emoji e sobrenome; o primeiro pedaço
  // alfabético é o que soa como alguém chamando a pessoa pelo nome.
  const parte = limpo.split(/\s+/)[0];
  return parte.length >= 2 ? parte : limpo;
}

/**
 * Troca as variáveis pelo valor do contato.
 *
 * Substitui `{{nome}}` e `{{ nome }}` (com espaço, que é o que sai quando
 * alguém edita a mensagem à mão), sem diferenciar maiúsculas. Uma chave
 * desconhecida é deixada como está de propósito: apagar em silêncio faria a
 * frase sair truncada sem ninguém entender por quê.
 *
 * Contato sem nome resolve para vazio, e aí a frase é costurada de volta —
 * "Oi {{nome}}, tudo bem?" vira "Oi, tudo bem?", não "Oi , tudo bem?". A
 * alternativa que tentei antes era um nome genérico de reserva, e ela produzia
 * "Oi tudo bem, tudo bem?" chegando na paciente. A costura só roda quando
 * alguma variável de fato saiu vazia: fora disso o texto é entregue exatamente
 * como foi escrito.
 */
export function aplicarVariaveis(
  texto: string,
  dados: { nome?: string | null },
): string {
  const nomeCompleto = String(dados.nome ?? "").trim();
  const primeiro = primeiroNome(nomeCompleto);
  let esvaziou = false;

  const trocado = texto.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (original, chave: string) => {
    const valor =
      chave.toLowerCase() === "nome"
        ? nomeCompleto
        : chave.toLowerCase() === "primeiro_nome"
          ? primeiro
          : null;
    if (valor === null) return original; // chave desconhecida: fica visível
    if (!valor) esvaziou = true;
    return valor;
  });

  if (!esvaziou) return trocado;
  return trocado
    .replace(/[ \t]+([,.!?;:])/g, "$1") // "Oi , tudo bem?" → "Oi, tudo bem?"
    .replace(/[ \t]{2,}/g, " ") // "Oi  tudo bem" → "Oi tudo bem"
    .replace(/[ \t]+$/gm, "");
}
