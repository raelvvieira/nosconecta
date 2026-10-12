// Qual caso de antes e depois a IA pode enviar.
//
// ── A fronteira ────────────────────────────────────────────────────────────
//
// Irmão direto de `agendamento-da-ia.ts`, e pelo mesmo motivo: é onde o que o
// modelo DIZ vira o que o sistema FAZ. Lá o que estava em jogo era uma
// paciente marcada no dia errado. Aqui é a foto do rosto de uma paciente
// saindo para um desconhecido no WhatsApp — e isso não se desfaz.
//
// ── Por que código, e não o caminho do arquivo ─────────────────────────────
//
// O modelo nunca vê `media_path`. Ele recebe uma lista com CÓDIGO, título e
// "quando usar", e devolve o código. A tradução de código para arquivo
// acontece aqui, contra a lista desta conversa.
//
// Se ele recebesse o caminho, bastaria inventar um parecido para mandar um
// arquivo que ninguém autorizou — e não existe nada no caminho de envio que
// saiba distinguir um caminho inventado de um verdadeiro.
//
// ── Por que módulo puro ────────────────────────────────────────────────────
//
// Dá para exercitar todo jeito de errar — código inventado, de outra conversa,
// caixa trocada, campo vazio, catálogo vazio — sem chamar modelo e sem enviar
// imagem nenhuma. Ver `tests/casos-da-ia.ts`.

/** Um caso autorizado, como o banco o entrega. */
export interface CasoDaClinica {
  id: string;
  titulo: string;
  /** Caminho no bucket. NUNCA chega ao modelo. */
  mediaPath: string;
  /** "quando a pessoa teme ficar artificial". Vazio quando não informado. */
  quandoUsar?: string | null;
  /** Nome do procedimento, para a Luna casar com o que foi conversado. */
  procedimento?: string | null;
}

/** O mesmo caso, já com o código pelo qual a IA o nomeia. */
export interface CasoComCodigo extends CasoDaClinica {
  /** `C1`, `C2`… */
  codigo: string;
}

/**
 * Quantos casos entram na instrução.
 *
 * Não é economia de espaço: é foco. Com trinta opções o modelo escolhe a que
 * casa melhor com as palavras, não a que a clínica considera o melhor
 * exemplo — e a lista inteira num prompt também aumenta a chance de ele citar
 * um caso que não vai enviar.
 */
export const MAXIMO_DE_CASOS = 8;

/**
 * A tabela de códigos desta conversa.
 *
 * Caso sem id, sem título ou sem arquivo não entra: o código existiria, o
 * modelo o usaria, e a falha apareceria longe daqui — no download, já dentro
 * do envio, com a conversa esperando.
 */
export function catalogoDeCasos(
  casos: CasoDaClinica[] | null | undefined,
  maximo: number = MAXIMO_DE_CASOS,
): CasoComCodigo[] {
  const saida: CasoComCodigo[] = [];
  for (const c of Array.isArray(casos) ? casos : []) {
    if (saida.length >= Math.max(0, maximo)) break;
    const id = String(c?.id ?? "").trim();
    const titulo = String(c?.titulo ?? "").trim();
    const mediaPath = String(c?.mediaPath ?? "").trim();
    if (!id || !titulo || !mediaPath) continue;
    saida.push({
      codigo: `C${saida.length + 1}`,
      id,
      titulo,
      mediaPath,
      quandoUsar: String(c?.quandoUsar ?? "").trim() || null,
      procedimento: String(c?.procedimento ?? "").trim() || null,
    });
  }
  return saida;
}

/** O que o modelo devolve quando quer mandar um caso. */
export interface EscolhaBruta {
  codigo?: unknown;
}

/**
 * O caso que a IA escolheu, ou `null`.
 *
 * `null` é o estado normal da imensa maioria das respostas: prova visual é
 * exceção, não rotina. Aceita caixa trocada e espaço em volta, como o código
 * do horário — e nada além disso.
 */
export function casoEscolhido(
  bruto: EscolhaBruta | null | undefined,
  catalogo: CasoComCodigo[],
): CasoComCodigo | null {
  const pedido = String(bruto?.codigo ?? "")
    .trim()
    .toUpperCase();
  if (!pedido) return null;
  return (Array.isArray(catalogo) ? catalogo : []).find((c) => c.codigo === pedido) ?? null;
}

/**
 * As linhas da instrução que ensinam a usar a biblioteca.
 *
 * Moram aqui, junto da regra que valida, para as duas não divergirem — mesmo
 * arranjo de `comoReportarFechamento`.
 *
 * `jaUsou` existe porque a trava de "um caso por conversa" só funciona se a
 * instrução souber que já houve um: o modelo não lembra sozinho, e mandar a
 * segunda foto para a mesma pessoa é o que transforma prova social em
 * insistência.
 */
export function comoUsarOsCasos(catalogo: CasoComCodigo[], jaUsou = false): string[] {
  if (!catalogo.length) return [];

  if (jaUsou) {
    return [
      "",
      "## Casos de antes e depois",
      "",
      "Você já mandou um caso nesta conversa. Não mande outro: duas fotos para",
      "a mesma pessoa deixam de ser prova e viram insistência. Daqui em diante,",
      "fale do resultado com palavras.",
    ];
  }

  const linhas = [
    "",
    "## Casos de antes e depois que você pode mandar",
    "",
    "Estes são os casos que a clínica autorizou. Para mandar um, devolva o",
    "código dele no campo `casoEnviado` da sua resposta — a imagem sai junto da",
    "sua mensagem, como legenda.",
    "",
  ];

  for (const c of catalogo) {
    const partes = [`- **${c.codigo}** · ${c.titulo}`];
    if (c.procedimento) partes.push(`(${c.procedimento})`);
    if (c.quandoUsar) partes.push(`— use ${c.quandoUsar}`);
    linhas.push(partes.join(" "));
  }

  linhas.push(
    "",
    "Quando mandar:",
    "",
    "- quando a pessoa tem dúvida de resultado, medo de ficar artificial, ou",
    "  dificuldade de imaginar o que vai acontecer;",
    "- quando o caso tem a ver com o que ELA falou. Diga por que lembrou dele:",
    '  "lembrei desse caso porque você comentou que queria algo natural".',
    "",
    "Quando NÃO mandar:",
    "",
    "- se a conversa envolve dor, sintoma, reclamação ou qualquer coisa clínica;",
    "- se nenhum caso da lista tem a ver com o assunto. Mandar o que sobrou é",
    "  pior do que não mandar;",
    "- mais de um por conversa;",
    "- depois que a pessoa já escolheu horário. Aí a venda acabou.",
    "",
    "E nunca prometa o mesmo resultado. O caso mostra o que já aconteceu com",
    "outra pessoa, não o que vai acontecer com esta. Não diga “você vai ficar",
    "assim”.",
    "",
    "Código que não está na lista acima não manda nada.",
  );

  return linhas;
}
