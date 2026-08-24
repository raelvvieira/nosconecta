/**
 * As cores que uma tag pode ter.
 *
 * Paleta fechada, e não campo de cor livre — foi decisão de desenho, não
 * economia de trabalho. Cor arbitrária produz três problemas que só aparecem
 * depois: etiqueta ilegível (amarelo claro sobre o branco das listas), etiqueta
 * que briga com o coral da marca a ponto de parecer um botão, e um quadro que
 * fica sujo quando a décima tag é mais um tom de azul quase igual ao da
 * terceira.
 *
 * As oito abaixo têm o mesmo peso visual entre si, contrastam sobre superfície
 * branca e são distinguíveis à distância de um card de pipeline.
 *
 * Guardamos a CHAVE no banco (`clinic_tags.color`), não o hex: assim dá para
 * reafinar um tom sem sair reescrevendo linha, e nenhuma tag fica presa a uma
 * cor que depois se revelou ruim. Chave desconhecida cai no cinza em vez de
 * quebrar — uma tag sem cor legível ainda é melhor que uma tela quebrada.
 */
export interface CorDeTag {
  chave: string;
  rotulo: string;
  /** Fundo do chip. */
  bg: string;
  /** Texto e borda do chip. */
  fg: string;
  /** Bolinha cheia, para o seletor de cor e o ponto na lista. */
  ponto: string;
}

export const CORES_DE_TAG: CorDeTag[] = [
  { chave: "coral", rotulo: "Coral", bg: "#FFEDE8", fg: "#C2410C", ponto: "#FF7A59" },
  { chave: "rosa", rotulo: "Rosa", bg: "#FDE8F0", fg: "#BE185D", ponto: "#F55F95" },
  { chave: "roxo", rotulo: "Roxo", bg: "#EFE9FC", fg: "#6D28D9", ponto: "#8B5CF6" },
  { chave: "azul", rotulo: "Azul", bg: "#E4EFFD", fg: "#1D4ED8", ponto: "#3B82F6" },
  { chave: "ciano", rotulo: "Ciano", bg: "#DEF3F5", fg: "#0E7490", ponto: "#06B6D4" },
  { chave: "verde", rotulo: "Verde", bg: "#E3F5EA", fg: "#047857", ponto: "#10B981" },
  { chave: "ambar", rotulo: "Âmbar", bg: "#FDF0DA", fg: "#B45309", ponto: "#F59E0B" },
  { chave: "cinza", rotulo: "Cinza", bg: "#EEEEF1", fg: "#44444C", ponto: "#71717A" },
];

const PADRAO = CORES_DE_TAG[CORES_DE_TAG.length - 1]; // cinza

export function corDeTag(chave: string | null | undefined): CorDeTag {
  return CORES_DE_TAG.find((c) => c.chave === chave) ?? PADRAO;
}
