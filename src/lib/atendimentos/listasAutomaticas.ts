/**
 * Listas que o sistema monta sozinho a partir do NOME do contato, para tirar
 * do disparo quem não é paciente: empresas, e doutores/dentistas (colegas,
 * fornecedores, quem a clínica conversa a trabalho).
 *
 * ── Por que pelo nome ─────────────────────────────────────────────────────
 *
 * É o único sinal que existe para todo mundo da base: o contato do WhatsApp
 * chega só com nome e número. O nome que a pessoa ou a empresa deu a si mesma
 * no WhatsApp ("Dra. Ana Lima", "Ótica Visão Ltda") costuma dizer o que ela é.
 *
 * ── O lado certo de errar ─────────────────────────────────────────────────
 *
 * Estas listas só servem para TIRAR gente do disparo. Um paciente marcado
 * como empresa por engano deixa de receber uma campanha — ruim, mas visível
 * na contagem e reversível desligando a ficha. Por isso as palavras são as
 * que quase nunca aparecem em nome de pessoa: "Ltda", "Clínica", "Dra.". As
 * ambíguas ficam de fora de propósito: "Centro", "Grupo" e "Bar" também são
 * sobrenome ou apelido, e "Me" é pronome.
 */

/** Sem acento, minúsculo, pontuação virando espaço — "Dra." e "DRA" e "dra"
 *  viram a mesma palavra. */
function normalizar(nome: string): string {
  return ` ${nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

/** Palavras inteiras (o espaço em volta impede "bar" de casar "barbara"). */
const PALAVRAS_DE_EMPRESA = [
  // forma jurídica
  "ltda",
  "eireli",
  "epp",
  "cia",
  "cnpj",
  // saúde e beleza — os vizinhos de uma clínica que mais aparecem na base
  "clinica",
  "clinicas",
  "consultorio",
  "odontologia",
  "odontologica",
  "laboratorio",
  "farmacia",
  "drogaria",
  "estetica",
  "salao",
  "barbearia",
  "spa",
  "otica",
  // comércio e serviço
  "loja",
  "lojas",
  "comercio",
  "comercial",
  "mercado",
  "supermercado",
  "atacado",
  "atacadista",
  "distribuidora",
  "padaria",
  "restaurante",
  "pizzaria",
  "lanchonete",
  "hamburgueria",
  "cafeteria",
  "confeitaria",
  "petshop",
  "pet shop",
  "veterinaria",
  "imobiliaria",
  "construtora",
  "engenharia",
  "arquitetura",
  "advocacia",
  "advogados",
  "contabilidade",
  "contabil",
  "seguros",
  "corretora",
  "transportes",
  "transportadora",
  "logistica",
  "oficina",
  "auto pecas",
  "autopecas",
  "academia",
  "escola",
  "colegio",
  "faculdade",
  "hotel",
  "pousada",
  "condominio",
  "igreja",
  "associacao",
  "instituto",
  "agencia",
  "marketing",
  "studio",
  "store",
  "shop",
  "delivery",
  "eventos",
  "buffet",
  "boutique",
  "atelie",
  "grafica",
  "papelaria",
  "materiais",
  "servicos",
  "solucoes",
  "tecnologia",
  "informatica",
  "telecom",
  "industria",
  "importados",
  "imports",
  "empresa",
  "empreendimentos",
  "representacoes",
  "consultoria",
  "assessoria",
];

/** "Fulano ME" e "Fulano MEI": só no FIM do nome, onde é forma jurídica. */
const FIM_DE_EMPRESA = /\s(me|mei)\s$/;

const PALAVRAS_DE_DOUTOR = [
  "dr",
  "dra",
  "drs",
  "dras",
  "doutor",
  "doutora",
  "doutores",
  "dentista",
  "dentistas",
  "odonto",
  "odontologo",
  "odontologa",
  "cirurgiao",
  "cirurgia",
  "ortodontista",
  "ortodontia",
  "implantodontista",
  "endodontista",
  "periodontista",
  "protesista",
  "harmonizacao",
  "hof",
];

function temPalavra(normalizado: string, palavras: readonly string[]): boolean {
  return palavras.some((p) => normalizado.includes(` ${p} `));
}

/** O nome parece de empresa ou estabelecimento. */
export function pareceEmpresa(nome: string | null | undefined): boolean {
  if (!nome) return false;
  const n = normalizar(nome);
  return temPalavra(n, PALAVRAS_DE_EMPRESA) || FIM_DE_EMPRESA.test(n);
}

/** O nome parece de doutor(a), dentista ou profissional de odontologia. */
export function pareceDoutor(nome: string | null | undefined): boolean {
  if (!nome) return false;
  return temPalavra(normalizar(nome), PALAVRAS_DE_DOUTOR);
}

export type ListaAutomatica = "empresas" | "doutores";

export const LISTAS_AUTOMATICAS: {
  id: ListaAutomatica;
  rotulo: string;
  teste: (nome: string) => boolean;
}[] = [
  { id: "empresas", rotulo: "Empresas", teste: pareceEmpresa },
  { id: "doutores", rotulo: "Doutores e dentistas", teste: pareceDoutor },
];
