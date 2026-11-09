// As ofertas do consultório e o bloco "O que está valendo agora" que a assistente
// lê a cada conversa.
//
//   Procedimentos  o que a clínica faz, com o preço normal (tabela de preços);
//   Ofertas        algo especial, com destaque e regras próprias: Paciente
//                  Modelo, Mentoria, uma promoção de preço;
//   Campanhas      disparos e anúncios que levam as pessoas até a clínica.
//
// O anúncio de origem NÃO escolhe a oferta. A assistente recebe o mapa do que
// está aberto hoje e decide pelo que a pessoa diz; o anúncio é uma pista. Por
// isso o bloco termina com as regras de como usá-lo.
//
// Puro (sem banco), com testes em `tests/ofertas.ts`.

import { reais, type Campanha, type ItemDeCampanha } from "./condicoes-do-consultorio.ts";

export type TipoDeOferta = "promocao" | "edicao";
export type EstadoDaOferta = "rascunho" | "teste" | "ligado" | "encerrada";
export type ParaQuem = "paciente" | "profissional" | "todos";
export type ModuloDaOferta = "paciente_modelo" | "mentoria";

/** As instruções comerciais são um complemento: curtas de propósito. */
export const LIMITE_DAS_INSTRUCOES = 1200;

export interface Oferta {
  id: string;
  tipo: TipoDeOferta;
  nome: string;
  estado: EstadoDaOferta;
  inicio: string | null;
  fim: string | null;
  paraQuem: ParaQuem;
  comoReconhecer: string | null;
  instrucoes: string | null;
  itens: ItemDeCampanha[];
  observacoes: string | null;
  modulo: ModuloDaOferta | null;
}

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function texto(v: unknown, limite?: number): string | null {
  const t = String(v ?? "").trim();
  if (!t) return null;
  return limite && t.length > limite ? t.slice(0, limite).trimEnd() : t;
}

function dia(v: unknown): string | null {
  const t = String(v ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

// deno-lint-ignore no-explicit-any
export function ofertaDoBanco(r: any): Oferta {
  const itens = Array.isArray(r?.itens) ? r.itens : [];
  const estado: EstadoDaOferta = ["rascunho", "teste", "ligado", "encerrada"].includes(r?.estado)
    ? r.estado
    : "rascunho";
  const paraQuem: ParaQuem = ["paciente", "profissional", "todos"].includes(r?.para_quem)
    ? r.para_quem
    : "todos";
  return {
    id: String(r.id),
    tipo: r?.tipo === "edicao" ? "edicao" : "promocao",
    nome: String(r?.nome ?? "").trim(),
    estado,
    inicio: dia(r?.inicio),
    fim: dia(r?.fim),
    paraQuem,
    comoReconhecer: texto(r?.como_reconhecer),
    instrucoes: texto(r?.instrucoes_comerciais, LIMITE_DAS_INSTRUCOES),
    // deno-lint-ignore no-explicit-any
    itens: itens
      .map((i: any) => ({
        nome: String(i?.nome ?? "").trim(),
        precoVista: numero(i?.precoVista),
        parcelas: numero(i?.parcelas),
        valorParcela: numero(i?.valorParcela),
      }))
      .filter((i: ItemDeCampanha) => i.nome),
    observacoes: texto(r?.observacoes),
    modulo: r?.modulo === "paciente_modelo" || r?.modulo === "mentoria" ? r.modulo : null,
  };
}

/**
 * Uma campanha de preço da tabela antiga vista como oferta. Só para quando a
 * tabela `ofertas` ainda não existe (migration pendente): o consultório segue
 * com o que já tinha.
 */
export function ofertaDeCampanha(c: Campanha): Oferta {
  return {
    id: c.id,
    tipo: "promocao",
    nome: c.nome,
    estado: c.ativo ? "ligado" : "rascunho",
    inicio: c.inicio,
    fim: c.fim,
    paraQuem: "paciente",
    comoReconhecer: null,
    instrucoes: null,
    itens: c.itens,
    observacoes: c.observacoes,
    modulo: null,
  };
}

export interface OpcoesDoMapa {
  /** Na tela Testar, as ofertas em teste também valem. */
  simulacao?: boolean;
  /**
   * Paciente Modelo só entra quando o módulo dele vale nesta conversa (ligado,
   * ou em teste na simulação). Quem decide é `moduloValeAqui`, no atendimento.
   */
  moduloPacienteModeloVale?: boolean;
}

/** Só as que estão abertas hoje, para esta conversa. */
export function ofertasValendo(lista: Oferta[], hoje: string, opcoes: OpcoesDoMapa = {}): Oferta[] {
  return lista.filter((o) => {
    if (!o.nome) return false;
    // Paciente Modelo é ligado e desligado na gestão do módulo (é lá que mora o
    // estado dele); aqui só vale o que o módulo diz. Duas chaves para a mesma
    // coisa acabariam discordando.
    if (o.tipo === "edicao" && o.modulo === "paciente_modelo") {
      return o.estado !== "encerrada" && opcoes.moduloPacienteModeloVale === true;
    }
    const aberta = o.estado === "ligado" || (o.estado === "teste" && opcoes.simulacao === true);
    if (!aberta) return false;
    if (o.inicio && hoje < o.inicio) return false;
    if (o.fim && hoje > o.fim) return false;
    if (o.tipo === "promocao") return o.itens.length > 0;
    return true;
  });
}

function diaMes(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

const PARA_QUEM_TEXTO: Record<ParaQuem, string> = {
  paciente: "pacientes",
  profissional: "profissionais (dentistas e outros), não pacientes",
  todos: "qualquer pessoa",
};

function linhasDeItens(itens: ItemDeCampanha[]): string[] {
  return itens.map((i) => {
    const partes: string[] = [];
    if (i.precoVista !== null) partes.push(`${reais(i.precoVista)} à vista`);
    if (i.parcelas && i.valorParcela !== null) {
      partes.push(
        `${i.parcelas}x de ${reais(i.valorParcela)} (total ${reais(i.parcelas * i.valorParcela)})`,
      );
    }
    return `- ${i.nome}: ${partes.join(" ou ") || "valor não cadastrado"}`;
  });
}

/**
 * O bloco "O que está valendo agora". Vazio quando nada está aberto: a conversa
 * segue só com a tabela de preços e as condições do consultório.
 */
export function secaoOQueEstaValendo(
  lista: Oferta[],
  hoje: string,
  opcoes: OpcoesDoMapa = {},
): string[] {
  const valendo = ofertasValendo(lista, hoje, opcoes);
  if (!valendo.length) return [];
  const temPromocao = valendo.some((o) => o.tipo === "promocao");

  const linhas = [
    "## O que está valendo agora",
    "",
    "Estas são as ofertas abertas hoje. Use só o que está escrito aqui como fato.",
    "",
  ];
  for (const o of valendo) {
    const periodo = o.inicio && o.fim ? `, de ${diaMes(o.inicio)} a ${diaMes(o.fim)}` : "";
    linhas.push(
      `### ${o.nome} (${o.tipo === "promocao" ? "promoção" : "edição com vagas"}${periodo})`,
    );
    linhas.push(`Para: ${PARA_QUEM_TEXTO[o.paraQuem]}.`);
    if (o.comoReconhecer)
      linhas.push(`Como reconhecer que a pessoa quer esta oferta: ${o.comoReconhecer}.`);
    if (o.tipo === "promocao") {
      linhas.push(...linhasDeItens(o.itens));
    } else if (o.modulo === "paciente_modelo") {
      linhas.push(
        "Datas, horários, vagas, valores e sinal desta oferta vêm na seção de paciente modelo,",
        "quando a conversa for sobre ela. Não os invente antes disso.",
      );
    } else {
      linhas.push(
        "Datas, vagas e valores desta oferta não estão cadastrados aqui. Diga que vai confirmar",
        "com a equipe, sem inventar.",
      );
    }
    if (o.observacoes) linhas.push("", o.observacoes);
    if (o.instrucoes) linhas.push("", `Como conduzir esta oferta: ${o.instrucoes}`);
    linhas.push("");
  }

  linhas.push(
    "Como usar este bloco:",
    "- O que a pessoa diz agora manda. O anúncio de onde ela veio é só uma pista: se ela pedir",
    "  outra coisa, siga o que ela pediu.",
    '- Se a mensagem for vaga (por exemplo "vi o anúncio"), faça uma única pergunta para entender',
    "  o que ela quer, antes de oferecer qualquer coisa.",
    "- Não ofereça uma oferta de profissionais a um paciente, nem o contrário.",
    "- Só trate como oferta o que está neste bloco. Se a oferta que a pessoa conhece (do anúncio)",
    "  não está aqui, ela terminou ou ainda não abriu: diga isso com honestidade e apresente o",
    "  que está valendo.",
    "- Nunca invente data, vaga, preço ou condição que não esteja escrito aqui ou na tabela.",
    "- O que uma oferta define vale só para ela. As instruções de cada oferta valem dentro dos",
    "  dados cadastrados e das regras que você nunca pode quebrar; se houver conflito, vale o",
    "  dado cadastrado.",
  );
  if (temPromocao) {
    linhas.push(
      "- Os valores de uma promoção valem por cima da tabela, só no período. Diga que é condição",
      '  da oferta, com o nome dela, sem inventar urgência ("últimas vagas"). O que a promoção não',
      "  define (regiões, ml, sessões), diga que é definido na avaliação. Não some itens nem crie",
      "  desconto extra. Não vale para paciente modelo.",
    );
  }
  return linhas;
}
