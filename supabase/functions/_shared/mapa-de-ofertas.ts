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
/** O resumo vai em TODA conversa: curto de propósito. */
export const LIMITE_DO_RESUMO = 600;
/** Um bloco de conhecimento e o total que entra numa conversa. */
export const LIMITE_DO_BLOCO = 4000;
export const LIMITE_DO_CONHECIMENTO = 12000;

export interface Oferta {
  id: string;
  tipo: TipoDeOferta;
  nome: string;
  estado: EstadoDaOferta;
  inicio: string | null;
  fim: string | null;
  paraQuem: ParaQuem;
  /** O texto curto que vai em toda conversa. */
  resumo: string | null;
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
    resumo: texto(r?.resumo, LIMITE_DO_RESUMO),
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
    resumo: null,
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
  const catalogo = catalogoDeOfertas(lista, hoje, opcoes);
  if (!catalogo.length) return [];
  const temPromocao = catalogo.some((c) => c.oferta.tipo === "promocao");

  const linhas = [
    "## O que está valendo agora",
    "",
    "Estas são as ofertas abertas hoje. Use só o que está escrito aqui como fato.",
    "",
  ];
  for (const { codigo, oferta: o } of catalogo) {
    const periodo = o.inicio && o.fim ? `, de ${diaMes(o.inicio)} a ${diaMes(o.fim)}` : "";
    linhas.push(
      `### ${codigo} · ${o.nome} (${o.tipo === "promocao" ? "promoção" : "edição com vagas"}${periodo})`,
    );
    linhas.push(`Para: ${PARA_QUEM_TEXTO[o.paraQuem]}.`);
    if (o.resumo) linhas.push(`Resumo: ${o.resumo}`);
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
        "Datas, vagas e valores desta oferta não estão cadastrados aqui, a não ser que apareçam no",
        "resumo ou no conhecimento da oferta. Diga que vai confirmar com a equipe, sem inventar.",
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
    "- No campo ofertaEmFoco da sua resposta, ponha o código (F1, F2…) da oferta de que a conversa",
    "  está tratando; deixe vazio se não mudou e escreva NENHUMA se a conversa deixou de ser sobre",
    "  uma oferta. Quando a conversa está numa oferta, o sistema traz o conhecimento dela.",
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

// ── O código de cada oferta e a oferta em foco ─────────────────────────────

export interface OfertaComCodigo {
  codigo: string;
  oferta: Oferta;
}

/**
 * As ofertas abertas, numeradas F1, F2… na ordem do bloco. O modelo devolve o
 * código, nunca o id: é contra esta lista que ele é validado, a mesma que
 * montou a instrução.
 */
export function catalogoDeOfertas(
  lista: Oferta[],
  hoje: string,
  opcoes: OpcoesDoMapa = {},
): OfertaComCodigo[] {
  return ofertasValendo(lista, hoje, opcoes).map((oferta, i) => ({
    codigo: `F${i + 1}`,
    oferta,
  }));
}

/**
 * O que o modelo disse sobre a oferta em foco, validado: o id da oferta, ou
 * `limpar` quando a conversa deixou de ser sobre uma oferta. `null` = não
 * mudou (vazio, ou um código que não está na lista).
 */
export function focoEscolhido(
  codigo: string,
  catalogo: OfertaComCodigo[],
): { id: string | null; limpar: boolean } | null {
  const c = String(codigo ?? "")
    .trim()
    .toUpperCase();
  if (!c) return null;
  if (c === "NENHUMA") return { id: null, limpar: true };
  const achada = catalogo.find((x) => x.codigo === c);
  return achada ? { id: achada.oferta.id, limpar: false } : null;
}

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function termosDaOferta(o: Oferta): string[] {
  const dos = (o.comoReconhecer ?? "")
    .split(/[,;\n]/)
    .map((t) => semAcento(t).trim())
    .filter((t) => t.length >= 4);
  const nome = semAcento(o.nome).trim();
  return nome.length >= 4 ? [...dos, nome] : dos;
}

/**
 * Em que oferta a conversa está, pelo que a pessoa escreveu e, na falta disso,
 * pelo anúncio. Só devolve quando UMA oferta combina: com empate ou sem
 * combinação, `null` — quem decide, nesse caso, é a própria assistente, pelo
 * campo `ofertaEmFoco` da resposta. É uma pista para o primeiro turno, não uma
 * regra: a mensagem da pessoa vence o anúncio.
 */
export function ofertaEmFocoDoContato(p: {
  catalogo: OfertaComCodigo[];
  mensagens?: readonly string[];
  anuncio?: string | null;
}): string | null {
  const unica = (texto: string): string | null => {
    const t = semAcento(texto);
    if (!t.trim()) return null;
    const achadas = p.catalogo.filter((c) => termosDaOferta(c.oferta).some((x) => t.includes(x)));
    return achadas.length === 1 ? achadas[0].oferta.id : null;
  };
  const dasMensagens = unica((p.mensagens ?? []).join(" \n "));
  if (dasMensagens) return dasMensagens;
  // Mensagem que menciona mais de uma oferta é ambígua: o anúncio não desempata.
  const mencionadas = p.catalogo.filter((c) =>
    termosDaOferta(c.oferta).some((x) => semAcento((p.mensagens ?? []).join(" ")).includes(x)),
  );
  if (mencionadas.length > 1) return null;
  return unica(p.anuncio ?? "");
}

// ── Conhecimento: o que a assistente consulta quando a conversa é sobre a oferta

export interface Conhecimento {
  id: string;
  ofertaId: string;
  titulo: string;
  quandoUsar: string | null;
  texto: string;
  ordem: number;
  ativo: boolean;
}

// deno-lint-ignore no-explicit-any
export function conhecimentoDoBanco(r: any): Conhecimento {
  return {
    id: String(r.id),
    ofertaId: String(r.oferta_id),
    titulo: String(r?.titulo ?? "")
      .trim()
      .slice(0, 80),
    quandoUsar: texto(r?.quando_usar, 200),
    texto: String(r?.texto ?? "")
      .trim()
      .slice(0, LIMITE_DO_BLOCO),
    ordem: Number.isFinite(Number(r?.ordem)) ? Number(r.ordem) : 0,
    ativo: r?.ativo !== false,
  };
}

/**
 * A seção de conhecimento da oferta em foco. Vazia sem blocos ativos. Os
 * blocos entram na ordem do cadastro, até o teto: o que passar dele é cortado e
 * a seção avisa, em vez de crescer sem limite a cada oferta nova.
 */
export function secaoDeConhecimento(oferta: Oferta, blocos: Conhecimento[]): string[] {
  const ativos = blocos
    .filter((b) => b.ativo && b.titulo && b.texto)
    .sort((a, b) => a.ordem - b.ordem);
  if (!ativos.length) return [];
  const linhas = [
    `## Conhecimento sobre ${oferta.nome}`,
    "",
    "Esta conversa é sobre esta oferta. Consulte os textos abaixo quando a pessoa perguntar sobre o",
    "assunto de cada um. Eles não substituem os dados cadastrados (preço, datas, vagas) nem as",
    "regras que você nunca pode quebrar: se algo aqui contradisser um dado cadastrado, vale o",
    "cadastrado. Responda o que a pessoa perguntou, com as suas palavras, sem despejar o texto.",
    "",
  ];
  let usado = 0;
  let cortou = false;
  for (const b of ativos) {
    if (usado + b.texto.length > LIMITE_DO_CONHECIMENTO) {
      cortou = true;
      break;
    }
    usado += b.texto.length;
    linhas.push(`### ${b.titulo}`);
    if (b.quandoUsar) linhas.push(`Quando usar: ${b.quandoUsar}`);
    linhas.push(b.texto, "");
  }
  if (cortou) {
    linhas.push(
      "(Há mais textos desta oferta que não couberam aqui. Se a pessoa perguntar algo que não está",
      "acima, diga que vai confirmar com a equipe.)",
    );
  }
  return linhas;
}

// ── O termômetro: quanto a assistente já tem para vender esta oferta ───────

export interface ItemDoTermometro {
  id: "resumo" | "reconhecer" | "condicoes" | "conhecimento" | "materiais" | "instrucoes";
  rotulo: string;
  ok: boolean;
  /** O que fazer quando falta. */
  dica: string;
}

export interface Termometro {
  itens: ItemDoTermometro[];
  feitos: number;
  total: number;
}

/**
 * Os insumos que a assistente precisa para conduzir uma venda da oferta. Não é
 * bloqueio: uma oferta ligada sem tudo funciona, só vende com menos munição. Serve
 * para a tela mostrar o que ainda dá para dar a ela.
 */
export function termometroDaOferta(
  o: Oferta,
  ctx: { blocos: number; materiais: number; temEdicao?: boolean },
): Termometro {
  const condicoesOk = o.tipo === "promocao" ? o.itens.length > 0 : ctx.temEdicao === true;
  const itens: ItemDoTermometro[] = [
    {
      id: "resumo",
      rotulo: "Resumo curto",
      ok: !!o.resumo,
      dica: "Uma ou duas frases do que é a oferta. Vai em toda conversa.",
    },
    {
      id: "reconhecer",
      rotulo: "Como reconhecer",
      ok: !!o.comoReconhecer,
      dica: "As palavras que mostram que a pessoa quer esta oferta.",
    },
    {
      id: "condicoes",
      rotulo: o.tipo === "promocao" ? "Procedimentos e preços" : "Edição com datas e vagas",
      ok: condicoesOk,
      dica:
        o.tipo === "promocao"
          ? "Cadastre ao menos um procedimento com o preço da promoção."
          : "Cadastre a próxima edição, com os dias e as vagas.",
    },
    {
      id: "conhecimento",
      rotulo: "Conhecimento",
      ok: ctx.blocos > 0,
      dica: "Textos para ela consultar: o que é, quem faz, perguntas frequentes, objeções.",
    },
    {
      id: "materiais",
      rotulo: "Fotos e vídeos",
      ok: ctx.materiais > 0,
      dica: "Ligue casos autorizados da biblioteca a esta oferta.",
    },
    {
      id: "instrucoes",
      rotulo: "Instruções comerciais",
      ok: !!o.instrucoes,
      dica: "Como conduzir a venda, em poucas linhas (opcional).",
    },
  ];
  return { itens, feitos: itens.filter((i) => i.ok).length, total: itens.length };
}
