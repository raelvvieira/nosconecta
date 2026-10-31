// O DRE: a demonstração de resultado, mês a mês, a partir dos lançamentos.
//
// ── A decisão que define este arquivo ──────────────────────────────────────
//
// Cada categoria tem um GRUPO no DRE (receita, custo variável, despesa fixa,
// financeiro, investimento), gravado em `financial_categories.grupo_dre`. É
// isso que separa, por exemplo, o aluguel (despesa fixa) da cadeira
// odontológica (investimento): sem a separação, a montagem da clínica em
// 2026 faria todo mês parecer prejuízo, e o DRE não responderia a pergunta
// que existe para responder — "a operação se paga?".
//
// Categoria sem grupo cai num palpite por nome (`grupoSugerido`), e a tela
// deixa trocar. O palpite nunca é gravado sozinho.
//
// Módulo puro: o servidor busca os lançamentos, e tudo o que é conta mora
// aqui, com `tests/dre.ts`.

export type GrupoDre =
  | "receita"
  | "custo_variavel"
  | "despesa_fixa"
  | "financeiro"
  | "investimento";

export const GRUPOS_DRE: { id: GrupoDre; rotulo: string; explica: string }[] = [
  { id: "receita", rotulo: "Receita", explica: "O que entra pelos atendimentos" },
  {
    id: "custo_variavel",
    rotulo: "Custos variáveis",
    explica: "Sobe e desce com o movimento: insumos, laboratório, comissões",
  },
  {
    id: "despesa_fixa",
    rotulo: "Despesas fixas",
    explica: "Existe mesmo sem paciente: aluguel, salários, luz, software",
  },
  {
    id: "financeiro",
    rotulo: "Financeiro e impostos",
    explica: "Juros, tarifas bancárias, impostos",
  },
  {
    id: "investimento",
    rotulo: "Investimentos",
    explica: "Fica fora do resultado: obra, móveis, equipamentos",
  },
];

/** Um palpite pelo nome da categoria, para quem ainda não classificou. */
export function grupoSugerido(nome: string, tipo: "income" | "expense"): GrupoDre {
  if (tipo === "income") return "receita";
  const n = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/constru|obra|movei|mobili|equipamento|reforma|instalacao|cadeira/.test(n))
    return "investimento";
  if (/juro|imposto|tarifa|taxa banc|multa|iof|das\b|simples/.test(n)) return "financeiro";
  if (/insumo|laborat|comiss|material de consumo|protese|descart|maquininha|taxa de cart/.test(n)) {
    return "custo_variavel";
  }
  return "despesa_fixa";
}

export type Regime = "caixa" | "competencia";

export interface LancamentoDoDre {
  tipo: "receivable" | "payable";
  status: string;
  amount: number;
  /** AAAA-MM-DD */
  dueDate: string;
  paidDate: string | null;
  categoriaId: string | null;
  categoriaNome: string | null;
  grupo: GrupoDre | null;
}

/**
 * O cartão de crédito no DRE.
 *
 * A compra no cartão nunca fica "paga": quem é paga é a fatura, uma vez por
 * mês, somando todas. Só que a categoria mora na compra, e a fatura não tem
 * nenhuma. Olhar as duas faria o gasto contar duas vezes na competência e
 * virar um bolo "Sem categoria" no caixa.
 *
 * A régua: a fatura some, e cada compra herda dela a situação, o vencimento
 * e o dia do pagamento. Assim a compra conta com a própria categoria, no
 * mês em que o dinheiro de fato saiu.
 */
export interface LancamentoBruto extends LancamentoDoDre {
  /** Compra no cartão: a fatura a que pertence. */
  faturaId: string | null;
  /** A linha de pagamento da fatura: qual fatura ela quita. */
  quitaFaturaId: string | null;
}

export function resolverFaturas<L extends LancamentoBruto>(linhas: L[]): L[] {
  const faturas = new Map<string, L>();
  for (const l of linhas) if (l.quitaFaturaId) faturas.set(l.quitaFaturaId, l);
  const saida: L[] = [];
  for (const l of linhas) {
    if (l.quitaFaturaId) continue;
    if (!l.faturaId) {
      saida.push(l);
      continue;
    }
    const f = faturas.get(l.faturaId);
    // Fatura fora da janela buscada: a compra fica como está (pendente), e
    // `mesDoLancamento` a descarta no caixa, como hoje.
    if (!f) {
      saida.push(l);
      continue;
    }
    saida.push({ ...l, status: f.status, paidDate: f.paidDate, dueDate: f.dueDate });
  }
  return saida;
}

export interface LinhaDoDre {
  grupo: GrupoDre;
  /** Total do grupo em cada mês, na ordem de `meses`. */
  porMes: number[];
  categorias: { id: string | null; nome: string; porMes: number[] }[];
}

export interface Dre {
  meses: string[];
  linhas: Record<GrupoDre, LinhaDoDre>;
  /** Receita − custos variáveis. */
  margemDeContribuicao: number[];
  /** Margem − despesas fixas. É "a operação se paga?". */
  resultadoOperacional: number[];
  /** Operacional − financeiro e impostos. */
  resultadoLiquido: number[];
  /** Quantos lançamentos entraram sem grupo gravado (caíram no palpite). */
  semGrupo: number;
}

/** O mês em que o lançamento conta, conforme o regime. No caixa só o pago
 *  conta, pelo dia do pagamento; na competência conta pelo vencimento. */
export function mesDoLancamento(l: LancamentoDoDre, regime: Regime): string | null {
  if (l.status === "cancelled") return null;
  if (regime === "caixa") {
    if (l.status !== "paid" || !l.paidDate) return null;
    return l.paidDate.slice(0, 7);
  }
  return l.dueDate.slice(0, 7);
}

/** O grupo em que o lançamento cai: o gravado, ou o palpite pelo nome.
 *  Recebimento é sempre receita, mesmo numa categoria classificada errado. */
export function grupoDoLancamento(l: LancamentoDoDre): GrupoDre {
  if (l.tipo === "receivable") return "receita";
  return l.grupo ?? grupoSugerido(l.categoriaNome ?? "", "expense");
}

export function montarDre(lancamentos: LancamentoDoDre[], meses: string[], regime: Regime): Dre {
  const indice = new Map(meses.map((m, i) => [m, i]));
  const zeros = () => meses.map(() => 0);
  const linhas = Object.fromEntries(
    GRUPOS_DRE.map((g) => [g.id, { grupo: g.id, porMes: zeros(), categorias: [] }]),
  ) as unknown as Record<GrupoDre, LinhaDoDre>;
  const porCategoria = new Map<
    string,
    { grupo: GrupoDre; id: string | null; nome: string; porMes: number[] }
  >();
  let semGrupo = 0;

  for (const l of lancamentos) {
    const mes = mesDoLancamento(l, regime);
    if (!mes) continue;
    const i = indice.get(mes);
    if (i === undefined) continue;
    if (!l.grupo) semGrupo++;
    const grupo = grupoDoLancamento(l);
    const valor = Math.round(l.amount * 100) / 100;
    linhas[grupo].porMes[i] += valor;
    const chave = `${grupo}:${l.categoriaId ?? ""}`;
    const cat =
      porCategoria.get(chave) ??
      (() => {
        const c = {
          grupo,
          id: l.categoriaId,
          nome: l.categoriaNome ?? (l.tipo === "receivable" ? "Atendimentos" : "Sem categoria"),
          porMes: zeros(),
        };
        porCategoria.set(chave, c);
        return c;
      })();
    cat.porMes[i] += valor;
  }

  for (const c of porCategoria.values()) {
    linhas[c.grupo].categorias.push({ id: c.id, nome: c.nome, porMes: c.porMes.map(arredondar) });
  }
  for (const g of GRUPOS_DRE) {
    linhas[g.id].porMes = linhas[g.id].porMes.map(arredondar);
    linhas[g.id].categorias.sort((a, b) => soma(b.porMes) - soma(a.porMes));
  }

  const r = linhas.receita.porMes;
  const cv = linhas.custo_variavel.porMes;
  const df = linhas.despesa_fixa.porMes;
  const fi = linhas.financeiro.porMes;
  const margem = r.map((v, i) => arredondar(v - cv[i]));
  const operacional = margem.map((v, i) => arredondar(v - df[i]));
  const liquido = operacional.map((v, i) => arredondar(v - fi[i]));

  return {
    meses,
    linhas,
    margemDeContribuicao: margem,
    resultadoOperacional: operacional,
    resultadoLiquido: liquido,
    semGrupo,
  };
}

export interface GastosDoPeriodo {
  total: number;
  porGrupo: Record<GrupoDre, number>;
  categorias: { id: string | null; nome: string; grupo: GrupoDre; valor: number }[];
}

/**
 * Para onde foi o dinheiro num intervalo de dias: só o que foi pago, pelo
 * dia do pagamento (caixa), por grupo e por categoria. Investimento entra,
 * porque saiu do caixa — a tela é que diz de que grupo é.
 */
export function gastosDoPeriodo(
  lancamentos: LancamentoDoDre[],
  de: string,
  ate: string,
): GastosDoPeriodo {
  const porGrupo = Object.fromEntries(GRUPOS_DRE.map((g) => [g.id, 0])) as Record<GrupoDre, number>;
  const porCategoria = new Map<string, GastosDoPeriodo["categorias"][number]>();
  let total = 0;
  for (const l of lancamentos) {
    if (l.tipo !== "payable" || l.status !== "paid" || !l.paidDate) continue;
    const dia = l.paidDate.slice(0, 10);
    if (dia < de || dia > ate) continue;
    const grupo = grupoDoLancamento(l);
    const valor = Math.round(l.amount * 100) / 100;
    total += valor;
    porGrupo[grupo] += valor;
    const chave = `${grupo}:${l.categoriaId ?? ""}`;
    const c = porCategoria.get(chave) ?? {
      id: l.categoriaId,
      nome: l.categoriaNome ?? "Sem categoria",
      grupo,
      valor: 0,
    };
    c.valor += valor;
    porCategoria.set(chave, c);
  }
  for (const g of GRUPOS_DRE) porGrupo[g.id] = arredondar(porGrupo[g.id]);
  return {
    total: arredondar(total),
    porGrupo,
    categorias: [...porCategoria.values()]
      .map((c) => ({ ...c, valor: arredondar(c.valor) }))
      .sort((a, b) => b.valor - a.valor),
  };
}

/**
 * Quanto mudou em relação ao mês anterior, em %. `null` quando não há base
 * (mês anterior zerado) — "+∞%" não diz nada a ninguém.
 */
export function variacao(atual: number, anterior: number): number | null {
  if (!anterior) return null;
  return Math.round(((atual - anterior) / Math.abs(anterior)) * 1000) / 10;
}

export function soma(valores: number[]): number {
  return arredondar(valores.reduce((a, b) => a + b, 0));
}

/** Percentual sobre a receita do mês; `null` sem receita. */
export function percentualDaReceita(valor: number, receita: number): number | null {
  if (!receita) return null;
  return Math.round((valor / receita) * 1000) / 10;
}

function arredondar(n: number): number {
  return Math.round(n * 100) / 100;
}
