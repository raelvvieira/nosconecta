// O travessão sai da mensagem antes de ela chegar ao paciente.
//
// ── Por que um filtro, e não um pedido ──────────────────────────────────
//
// O manual da Luna proíbe travessão: "a escrita precisa parecer natural para
// WhatsApp e não ter aparência de texto artificial". Está certo — quase ninguém
// digita travessão no celular, e ele é uma das marcas que denunciam texto de
// máquina.
//
// Só que pedir não resolve. Modelo de linguagem produz travessão com
// naturalidade, e a instrução que pede para não usar é a MESMA que está cheia
// deles (inclusive este comentário). Uma regra que depende de o modelo lembrar
// falha na hora em que ninguém está olhando.
//
// ── O que NÃO pode ser tocado ───────────────────────────────────────────
//
// O hífen. "segunda-feira", "pé-de-galinha", "pós-operatório", "bem-estar" —
// trocar hífen por vírgula estragaria as palavras em vez de consertar a
// pontuação. Então só os travessões de verdade saem: em dash, en dash e a barra
// horizontal. O hífen comum fica exatamente onde está.

/** Travessão (—), meia-risca (–) e barra horizontal (―). O hífen (-) fica fora
 *  de propósito: ele vive dentro de palavras. */
const TRAVESSOES = /[—–―]/g;

/** Pontuação que já encerra a frase. Mais uma vírgula depois dela viraria ",,". */
const JA_PONTUADO = /[,.;:!?][ \t]*$/;

/** Nada antes do travessão NESTA linha. Travessão em começo de linha é marcador
 *  de lista ("— terça às 10h"), não pontuação do meio de uma frase. */
const COMECO_DE_LINHA = /(^|\n)[ \t]*$/;

/** Nada depois dele nesta linha. */
const FIM_DE_LINHA = /^[ \t]*(\n|$)/;

/**
 * Troca travessão por pontuação que uma pessoa usaria.
 *
 * A escolha é por POSIÇÃO, e é o que evita texto estranho:
 *
 *   No meio da frase, vira vírgula: "é hoje — às 14h" → "é hoje, às 14h". Colado
 *   ou espaçado dá no mesmo, porque o espaço depois é garantido aqui.
 *
 *   No começo da linha, sai inteiro: é o travessão de lista, e "— terça às 10h"
 *   virando ", terça às 10h" seria pior que o problema.
 *
 *   Depois de pontuação que já fecha, sai também: "às 14h. — até já" viraria
 *   "às 14h. , até já".
 *
 *   No fim da linha, sai: vírgula pendurada antes da quebra é lixo visível.
 */
export function semTravessao(texto: string): string {
  const original = String(texto ?? "");
  if (
    !original.includes("\u2014") &&
    !original.includes("\u2013") &&
    !original.includes("\u2015")
  ) {
    // Sai cedo e devolve IDÊNTICO: um texto sem travessão não deve passar pela
    // normalização de espaços, senão o filtro mexeria em mensagem que estava boa.
    return original;
  }

  let saida = "";
  let resto = original;
  for (;;) {
    const achado = TRAVESSOES.exec(resto);
    TRAVESSOES.lastIndex = 0;
    if (!achado) {
      saida += resto;
      break;
    }
    const acumulado = saida + resto.slice(0, achado.index);
    const depois = resto.slice(achado.index + achado[0].length);

    if (
      COMECO_DE_LINHA.test(acumulado) ||
      FIM_DE_LINHA.test(depois) ||
      JA_PONTUADO.test(acumulado)
    ) {
      saida = acumulado;
    } else {
      // Vírgula colada no que vem antes, espaço garantido depois — é o que faz
      // "hoje—às" e "hoje — às" terminarem iguais.
      saida = acumulado.replace(/[ \t]+$/, "") + ", ";
    }
    resto = depois.replace(/^[ \t]+/, saida.endsWith(", ") ? "" : " ");
  }

  return (
    saida
      // Espaço horizontal duplicado pela troca. Só horizontal: `\s` levaria as
      // quebras de linha, e a segmentação das mensagens depende delas.
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+([,.;:!?])/g, "$1")
      // Espaço que sobrou no começo da linha depois de remover o marcador, e o
      // que sobrou no fim dela depois de remover um travessão de fecho.
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/,[ \t]*$/, "")
      .trim()
  );
}
