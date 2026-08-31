// Fazer a resposta parecer alguém digitando, e não um sistema respondendo.
//
// ── Por que isto é o produto, e não enfeite ────────────────────────────────
//
// Um agente que responde em 200 ms com oito parágrafos se denuncia por melhor
// que seja o texto. Debounce, segmentação e atraso por caractere não têm nada a
// ver com inteligência — são o que separa "um robô respondendo" de "alguém do
// outro lado". A referência recomenda implementar isto ANTES de refinar o
// modelo, e o motivo é esse.
//
// Arquivo sem import nenhum, de propósito: é a parte com regra de verdade
// (onde quebrar o texto), e regra sem teste é chute.

export interface Ritmo {
  /** Segundos esperando a pessoa terminar de escrever antes de responder. */
  debounceSegundos: number;
  segmentar: boolean;
  /** Teto de caracteres por mensagem. */
  limite: number;
  /** Pedaço menor que isto não vira mensagem sozinha. */
  minimo: number;
  /** Milissegundos por caractere, simulando o tempo de digitação. */
  msPorCaractere: number;
}

export const RITMO_PADRAO: Ritmo = {
  debounceSegundos: 5,
  segmentar: true,
  limite: 300,
  minimo: 50,
  msPorCaractere: 50,
};

/**
 * Quebra a resposta em mensagens, como uma pessoa mandaria.
 *
 * Três regras, e a terceira é a que quase todo mundo esquece:
 *
 * 1. Quebra em fim de FRASE quando dá — ninguém manda meia frase e completa na
 *    mensagem seguinte.
 * 2. Nunca no meio de uma palavra. Se não houver fim de frase, quebra no último
 *    espaço; só corta letra se a "palavra" for maior que o limite inteiro (um
 *    link gigante, por exemplo).
 * 3. Um fiapo final volta para a mensagem anterior. Sem isso a resposta termina
 *    com uma mensagem de duas palavras — "Tudo bem?" sozinha depois de um
 *    parágrafo — que é exatamente o padrão que denuncia automação.
 */
export function segmentar(texto: string, ritmo: Ritmo): string[] {
  const limpo = texto.trim();
  if (!limpo) return [];
  if (!ritmo.segmentar || limpo.length <= ritmo.limite) return [limpo];

  const limite = Math.max(1, ritmo.limite);
  const pedacos: string[] = [];
  let resto = limpo;

  while (resto.length > limite) {
    const janela = resto.slice(0, limite);

    // 1. Fim de frase — o corte que soa natural.
    let corte = -1;
    for (const m of janela.matchAll(/[.!?…](\s|$)/g)) {
      corte = m.index! + 1;
    }

    // 2. Último espaço. Nunca no meio da palavra.
    if (corte <= 0) {
      const espaco = janela.lastIndexOf(" ");
      corte = espaco > 0 ? espaco : limite;
    }

    pedacos.push(resto.slice(0, corte).trim());
    resto = resto.slice(corte).trim();
  }
  if (resto) pedacos.push(resto);

  // 3. O fiapo final.
  //
  // Junta com o anterior quando couber. Quando NÃO couber, reequilibra os dois
  // últimos em vez de desistir — e é aí que estava o defeito: desistir deixava
  // exatamente o fiapo que esta regra existe para evitar ("...sem problema" +
  // "nenhum ok"), justamente no caso em que ela era mais necessária. Uma pessoa
  // não manda duas palavras soltas depois de um parágrafo; move uma frase.
  if (pedacos.length > 1) {
    const ultimo = pedacos[pedacos.length - 1];
    const penultimo = pedacos[pedacos.length - 2];
    if (ultimo.length < ritmo.minimo) {
      const juntos = `${penultimo} ${ultimo}`;
      if (juntos.length <= limite) pedacos.splice(-2, 2, juntos);
      else pedacos.splice(-2, 2, ...dividirAoMeio(juntos, limite));
    }
  }

  return pedacos.filter(Boolean);
}

/**
 * Divide um texto em dois pedaços de tamanho parecido, cortando em espaço.
 *
 * Só é chamada quando o texto tem no máximo 2× o limite, então os dois lados
 * cabem. Prefere o espaço mais próximo do meio: é o que faz as duas mensagens
 * parecerem duas frases, e não uma frase e um resto.
 */
function dividirAoMeio(texto: string, limite: number): string[] {
  const meio = Math.floor(texto.length / 2);
  const antes = texto.lastIndexOf(" ", meio);
  const depois = texto.indexOf(" ", meio);

  // O candidato mais perto do meio que ainda deixe os DOIS lados dentro do
  // limite. Sem essa checagem, um texto muito desequilibrado voltaria a
  // estourar de um dos lados.
  const candidatos = [antes, depois]
    .filter((i) => i > 0 && i < texto.length)
    .filter((i) => i <= limite && texto.length - i - 1 <= limite)
    .sort((a, b) => Math.abs(a - meio) - Math.abs(b - meio));

  const corte = candidatos[0];
  if (corte === undefined) return [texto.slice(0, limite).trim(), texto.slice(limite).trim()];
  return [texto.slice(0, corte).trim(), texto.slice(corte + 1).trim()];
}

/** Quanto esperar antes de mandar um pedaço, simulando digitação. Teto de 12s
 *  por mensagem: acima disso o paciente acha que ninguém viu. */
export const MAX_ESPERA_MS = 12_000;

export function esperaDeDigitacao(pedaco: string, ritmo: Ritmo): number {
  const ms = pedaco.length * Math.max(0, ritmo.msPorCaractere);
  return Math.min(Math.round(ms), MAX_ESPERA_MS);
}

/** O ritmo com os limites aplicados. Valor absurdo vindo de fora não pode gerar
 *  uma resposta que leva meia hora para sair. */
export function normalizarRitmo(bruto: Partial<Ritmo> | null | undefined): Ritmo {
  const r = { ...RITMO_PADRAO, ...(bruto ?? {}) };
  const limite = clamp(Math.round(r.limite), 80, 2000);
  return {
    debounceSegundos: clamp(Math.round(r.debounceSegundos), 0, 120),
    segmentar: r.segmentar !== false,
    limite,
    // O mínimo nunca passa do limite: maior, todo pedaço seria "fiapo" e a
    // junção do passo 3 nunca aconteceria.
    minimo: clamp(Math.round(r.minimo), 0, limite),
    msPorCaractere: clamp(Math.round(r.msPorCaractere), 0, 300),
  };
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
