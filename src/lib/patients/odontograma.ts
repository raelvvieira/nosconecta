// O odontograma: os dentes, as regiões da boca e os rótulos de cada um.
//
// Módulo puro, sem React e sem banco, para a tela e o servidor concordarem
// sobre o que é uma região válida — uma anotação gravada em "dente 99" não
// apareceria em lugar nenhum. Notação FDI: o primeiro dígito é o quadrante
// (1 a 4 permanentes, 5 a 8 decíduos), o segundo é a posição a partir do
// centro (1 incisivo central … 8 terceiro molar).

export type Denticao = "permanente" | "deciduo";

/** Cada arcada, lida como se olha para a boca do paciente: a direita dele
 *  fica à esquerda da tela. Duas metades por arcada, separadas pela linha
 *  média. */
export const ARCADAS: Record<
  Denticao,
  { superior: [string[], string[]]; inferior: [string[], string[]] }
> = {
  permanente: {
    superior: [
      ["18", "17", "16", "15", "14", "13", "12", "11"],
      ["21", "22", "23", "24", "25", "26", "27", "28"],
    ],
    inferior: [
      ["48", "47", "46", "45", "44", "43", "42", "41"],
      ["31", "32", "33", "34", "35", "36", "37", "38"],
    ],
  },
  deciduo: {
    superior: [
      ["55", "54", "53", "52", "51"],
      ["61", "62", "63", "64", "65"],
    ],
    inferior: [
      ["85", "84", "83", "82", "81"],
      ["71", "72", "73", "74", "75"],
    ],
  },
};

/** As regiões que não são um dente só. O id é o que vai para o banco. */
export const REGIOES_GERAIS = [
  { id: "maxila", rotulo: "Maxila" },
  { id: "mandibula", rotulo: "Mandíbula" },
  { id: "face", rotulo: "Face" },
  { id: "arcada_superior", rotulo: "Arcada superior" },
  { id: "arcada_inferior", rotulo: "Arcada inferior" },
  { id: "arcadas", rotulo: "Arcadas" },
] as const;

export type RegiaoGeral = (typeof REGIOES_GERAIS)[number]["id"];

const TODOS_OS_DENTES = new Set(
  (["permanente", "deciduo"] as Denticao[]).flatMap((d) =>
    [...ARCADAS[d].superior, ...ARCADAS[d].inferior].flat(),
  ),
);

export function ehDente(regiao: string): boolean {
  return TODOS_OS_DENTES.has(regiao);
}

/** Uma região que a anotação pode apontar: um dente FDI ou uma região geral. */
export function ehRegiaoValida(regiao: unknown): regiao is string {
  if (typeof regiao !== "string") return false;
  return ehDente(regiao) || REGIOES_GERAIS.some((r) => r.id === regiao);
}

export type TipoDoDente = "incisivo" | "canino" | "pre-molar" | "molar";

/** O formato do dente sai da posição: é o que decide o desenho e o nome. */
export function tipoDoDente(numero: string): TipoDoDente {
  const quadrante = Number(numero[0]);
  const posicao = Number(numero[1]);
  const deciduo = quadrante >= 5;
  if (posicao <= 2) return "incisivo";
  if (posicao === 3) return "canino";
  // Decíduo não tem pré-molar: as posições 4 e 5 são os molares de leite.
  if (deciduo) return "molar";
  return posicao <= 5 ? "pre-molar" : "molar";
}

export function arcadaDoDente(numero: string): "superior" | "inferior" {
  const q = Number(numero[0]);
  return q === 1 || q === 2 || q === 5 || q === 6 ? "superior" : "inferior";
}

/** "Dente 24 · pré-molar superior esquerdo". O lado é o DO PACIENTE. */
export function descricaoDoDente(numero: string): string {
  const q = Number(numero[0]);
  const lado = q === 1 || q === 4 || q === 5 || q === 8 ? "direito" : "esquerdo";
  const nome: Record<TipoDoDente, string> = {
    incisivo: "incisivo",
    canino: "canino",
    "pre-molar": "pré-molar",
    molar: "molar",
  };
  const leite = q >= 5 ? " de leite" : "";
  return `${nome[tipoDoDente(numero)]}${leite} ${arcadaDoDente(numero)} ${lado}`;
}

/** O título de uma anotação: "Dente 24" ou "Maxila". */
export function rotuloDaRegiao(regiao: string | null | undefined): string {
  if (!regiao) return "";
  if (ehDente(regiao)) return `Dente ${regiao}`;
  return REGIOES_GERAIS.find((r) => r.id === regiao)?.rotulo ?? regiao;
}
