// Catálogo-modelo de procedimentos, para o consultório novo não começar com a
// tela vazia: escolhe os que faz, põe o preço e importa.
//
// Sem preço de propósito: preço sugerido vira o preço de quem não mexe, e a
// assistente sairia falando um valor que o consultório nunca decidiu.

export type AreaDeAtuacao = "odonto" | "estetica" | "odonto_estetica" | "medica";

export const AREAS: { id: AreaDeAtuacao; rotulo: string; descricao: string }[] = [
  { id: "odonto", rotulo: "Odontologia", descricao: "Clínica geral, estética dental, ortodontia…" },
  { id: "estetica", rotulo: "Estética facial", descricao: "Harmonização, toxina, preenchimento…" },
  { id: "odonto_estetica", rotulo: "Os dois", descricao: "Odontologia e estética facial" },
  { id: "medica", rotulo: "Saúde e outras", descricao: "Consultório médico ou de outra área" },
];

export interface ItemDoCatalogo {
  nome: string;
  categoria: string;
  duracaoMin: number;
  /** Procedimento de preço que depende da avaliação: sai como "a partir de". */
  aPartirDe?: boolean;
}

const ODONTO: ItemDoCatalogo[] = [
  { nome: "Avaliação odontológica", categoria: "Avaliação", duracaoMin: 30 },
  { nome: "Limpeza (profilaxia)", categoria: "Prevenção", duracaoMin: 45 },
  { nome: "Clareamento em consultório", categoria: "Estética dental", duracaoMin: 60 },
  { nome: "Clareamento caseiro", categoria: "Estética dental", duracaoMin: 30 },
  { nome: "Restauração em resina", categoria: "Dentística", duracaoMin: 60, aPartirDe: true },
  { nome: "Facetas em resina", categoria: "Estética dental", duracaoMin: 120, aPartirDe: true },
  {
    nome: "Lentes de contato dental",
    categoria: "Estética dental",
    duracaoMin: 120,
    aPartirDe: true,
  },
  { nome: "Tratamento de canal", categoria: "Endodontia", duracaoMin: 90, aPartirDe: true },
  { nome: "Extração simples", categoria: "Cirurgia", duracaoMin: 45, aPartirDe: true },
  { nome: "Extração de siso", categoria: "Cirurgia", duracaoMin: 60, aPartirDe: true },
  { nome: "Implante dentário", categoria: "Implantodontia", duracaoMin: 90, aPartirDe: true },
  { nome: "Aparelho ortodôntico", categoria: "Ortodontia", duracaoMin: 60, aPartirDe: true },
  { nome: "Alinhadores invisíveis", categoria: "Ortodontia", duracaoMin: 60, aPartirDe: true },
  { nome: "Placa de bruxismo", categoria: "Prevenção", duracaoMin: 45 },
  { nome: "Prótese dentária", categoria: "Prótese", duracaoMin: 60, aPartirDe: true },
];

const ESTETICA: ItemDoCatalogo[] = [
  { nome: "Avaliação de harmonização", categoria: "Avaliação", duracaoMin: 30 },
  { nome: "Toxina botulínica (3 regiões)", categoria: "Toxina", duracaoMin: 30 },
  { nome: "Preenchimento labial", categoria: "Preenchimento", duracaoMin: 45 },
  { nome: "Preenchimento de olheiras", categoria: "Preenchimento", duracaoMin: 45 },
  { nome: "Preenchimento de mento", categoria: "Preenchimento", duracaoMin: 45 },
  { nome: "Preenchimento de mandíbula", categoria: "Preenchimento", duracaoMin: 60 },
  { nome: "Preenchimento de bigode chinês", categoria: "Preenchimento", duracaoMin: 45 },
  { nome: "Rinomodelação", categoria: "Preenchimento", duracaoMin: 45 },
  { nome: "Bioestimulador de colágeno", categoria: "Bioestimulador", duracaoMin: 60 },
  { nome: "Fios de PDO", categoria: "Fios", duracaoMin: 60, aPartirDe: true },
  {
    nome: "Harmonização facial completa",
    categoria: "Harmonização",
    duracaoMin: 120,
    aPartirDe: true,
  },
  { nome: "Skinbooster", categoria: "Pele", duracaoMin: 45 },
];

const MEDICA: ItemDoCatalogo[] = [
  { nome: "Consulta", categoria: "Consulta", duracaoMin: 30 },
  { nome: "Retorno", categoria: "Consulta", duracaoMin: 20 },
  { nome: "Avaliação", categoria: "Avaliação", duracaoMin: 30 },
];

export function catalogoDaArea(area: AreaDeAtuacao): ItemDoCatalogo[] {
  if (area === "odonto") return ODONTO;
  if (area === "estetica") return ESTETICA;
  if (area === "medica") return MEDICA;
  return [...ODONTO, ...ESTETICA.filter((e) => e.categoria !== "Avaliação")];
}
