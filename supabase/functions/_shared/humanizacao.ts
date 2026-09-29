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

    // 2. Último espaço que não deixe palavra pendurada. Nunca no meio da
    //    palavra, e nunca logo depois de "R$" ou de uma preposição — ver
    //    `NAO_FECHAM_MENSAGEM`.
    if (corte <= 0) {
      let espaco = janela.lastIndexOf(" ");
      while (espaco > 0 && !fechaBem(janela.slice(0, espaco))) {
        espaco = janela.lastIndexOf(" ", espaco - 1);
      }
      corte = espaco > 0 ? espaco : Math.max(janela.lastIndexOf(" "), limite);
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
/**
 * Palavras e símbolos que não podem FECHAR uma mensagem.
 *
 * ── O defeito que isto conserta ────────────────────────────────────────
 *
 * Medido numa conversa real de 28/09: a Luna mandou "…o de consultório com
 * limpeza e 2 sessões é R$ 600, e o combinado fica R$" e, na mensagem seguinte,
 * "990.". O corte caiu no espaço mais próximo do meio do texto, e o espaço mais
 * próximo do meio era logo depois do cifrão.
 *
 * Ninguém digita assim. E o estrago é maior que o estranhamento: por um
 * segundo, o preço que a pessoa lê é "R$", e depois um número solto.
 *
 * A lista é curta de propósito — cifrão, preposições e conectivos, o que
 * costuma vir ANTES da informação que importa.
 */
const NAO_FECHAM_MENSAGEM = new Set([
  "r$",
  "rs",
  "as",
  "às",
  "ao",
  "aos",
  "a",
  "o",
  "de",
  "do",
  "da",
  "dos",
  "das",
  "em",
  "no",
  "na",
  "nos",
  "nas",
  "por",
  "para",
  "pra",
  "com",
  "sem",
  "e",
  "ou",
  "que",
  "é",
  "até",
]);

/** A última palavra de um pedaço pode encerrar uma mensagem? */
function fechaBem(pedaco: string): boolean {
  const ultima = pedaco
    .trim()
    .split(/\s+/)
    .pop()
    ?.replace(/[^\p{L}\p{N}$]/gu, "")
    .toLowerCase();
  if (!ultima) return false;
  return !NAO_FECHAM_MENSAGEM.has(ultima);
}

function dividirAoMeio(texto: string, limite: number): string[] {
  const meio = Math.floor(texto.length / 2);

  // Todos os espaços viáveis, do mais perto do meio para o mais longe. Antes
  // só se olhava um de cada lado do meio; quando esses dois deixavam palavra
  // pendurada, não havia terceira chance.
  const espacos: number[] = [];
  for (let i = 0; i < texto.length; i++) if (texto[i] === " ") espacos.push(i);

  const viaveis = espacos
    .filter((i) => i > 0 && i < texto.length - 1)
    .filter((i) => i <= limite && texto.length - i - 1 <= limite)
    .sort((a, b) => Math.abs(a - meio) - Math.abs(b - meio));

  // Primeiro o corte que não deixa palavra pendurada. Só se nenhum servir é
  // que se aceita o mais próximo do meio: mensagem partida no lugar estranho é
  // ruim, mensagem partida FORA do limite não chega.
  const corte = viaveis.find((i) => fechaBem(texto.slice(0, i))) ?? viaveis[0];
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
