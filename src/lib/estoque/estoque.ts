// O núcleo do estoque: contas puras, sem banco e sem tela.
//
// Tudo é guardado em UNIDADES (a menor peça). A caixa é só a forma de falar:
// "3 caixas + 12 unidades" e 156 são a mesma coisa quando a caixa tem 48.
// Separar a conta da tela deixa as regras que decidem "está acabando" num lugar
// só, testável, e a mesma para a lista, para os cards e para o alerta que virá.

export type TipoDeMovimento = "entrada" | "saida" | "ajuste" | "perda";

/** Um movimento como as contas precisam dele. A quantidade vem COM SINAL. */
export interface MovimentoDoEstoque {
  tipo: TipoDeMovimento;
  /** Em unidades: entrada positiva, saída e perda negativas. */
  quantidade: number;
  custoTotal: number | null;
  custoUnitario: number | null;
  /** AAAA-MM-DD (dia da clínica). */
  dia: string;
}

const arredondar = (n: number, casas: number) => {
  const f = 10 ** casas;
  return Math.round((n + Number.EPSILON) * f) / f;
};

// ── Caixas e unidades ───────────────────────────────────────────────────────

/** Caixas e peças soltas viram o total de unidades. */
export function emUnidades(caixas: number, avulsas: number, porEmbalagem: number): number {
  const por = Number(porEmbalagem);
  if (!(por > 0)) return 0;
  return arredondar(Math.max(0, Number(caixas) || 0) * por + Math.max(0, Number(avulsas) || 0), 3);
}

/** O total de unidades vira "caixas cheias + peças soltas". */
export function emCaixas(
  unidades: number,
  porEmbalagem: number,
): { caixas: number; avulsas: number } {
  const por = Number(porEmbalagem);
  const total = Number(unidades) || 0;
  if (!(por > 0) || total <= 0) return { caixas: 0, avulsas: Math.max(0, arredondar(total, 3)) };
  const caixas = Math.floor(arredondar(total / por, 6));
  return { caixas, avulsas: arredondar(total - caixas * por, 3) };
}

function plural(n: number, singular: string, pl?: string): string {
  if (n === 1) return singular;
  if (pl) return pl;
  return /[mrz]$/i.test(singular) ? `${singular}es` : `${singular}s`;
}

const numero = (n: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(n);

/** "3 caixas + 12 unidades", "1 caixa", "12 unidades", "0". */
export function rotuloDoSaldo(
  unidades: number,
  porEmbalagem: number,
  rotuloEmbalagem = "caixa",
  rotuloUnidade = "unidade",
): string {
  const total = Number(unidades) || 0;
  if (total <= 0) return "0";
  const { caixas, avulsas } = emCaixas(total, porEmbalagem);
  const partes: string[] = [];
  // Embalagem de uma peça só ("1 por caixa") não precisa de duas contagens.
  if (Number(porEmbalagem) <= 1) return `${numero(total)} ${plural(total, rotuloUnidade)}`;
  if (caixas > 0) partes.push(`${numero(caixas)} ${plural(caixas, rotuloEmbalagem)}`);
  if (avulsas > 0) partes.push(`${numero(avulsas)} ${plural(avulsas, rotuloUnidade)}`);
  return partes.join(" + ");
}

// ── Consumo e projeção ──────────────────────────────────────────────────────

/** Dias entre duas datas AAAA-MM-DD (b - a). */
export function diasEntre(a: string, b: string): number {
  const ms = Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export interface ConsumoMedio {
  /** Unidades por dia, ou `null` quando ainda não há base para dizer. */
  porDia: number | null;
  /** Quantos dias de histórico sustentam a média. */
  diasObservados: number;
}

/**
 * Quanto o item é gasto por dia.
 *
 * Olha as saídas e as perdas dos últimos `janelaDias` dias (padrão 60). A
 * janela encolhe para o tempo de vida do item quando ele é novo: um item que
 * entrou há 10 dias e gastou 20 peças gasta 2 por dia, e não 20 / 60. Com menos
 * de `minimoDeDias` de história (padrão 7) não se arrisca média nenhuma: um
 * número tirado de três dias engana mais do que ajuda.
 *
 * Ajuste não conta como consumo: é a correção de uma contagem, não um gasto.
 */
export function consumoMedio(
  movimentos: readonly MovimentoDoEstoque[],
  hoje: string,
  janelaDias = 60,
  minimoDeDias = 7,
): ConsumoMedio {
  if (!movimentos.length) return { porDia: null, diasObservados: 0 };
  const primeiro = movimentos.reduce((m, x) => (x.dia < m ? x.dia : m), movimentos[0].dia);
  const vida = Math.max(0, diasEntre(primeiro, hoje));
  const dias = Math.min(janelaDias, vida);
  if (dias < minimoDeDias) return { porDia: null, diasObservados: dias };
  const desde = `${new Date(Date.parse(`${hoje}T12:00:00Z`) - dias * 86_400_000)
    .toISOString()
    .slice(0, 10)}`;
  const gasto = movimentos
    .filter((m) => (m.tipo === "saida" || m.tipo === "perda") && m.dia > desde && m.dia <= hoje)
    .reduce((s, m) => s + Math.abs(m.quantidade), 0);
  return { porDia: arredondar(gasto / dias, 4), diasObservados: dias };
}

/** Quantos dias o saldo aguenta no ritmo atual. `null` sem consumo conhecido. */
export function diasRestantes(saldo: number, porDia: number | null): number | null {
  if (!(Number(saldo) > 0)) return 0;
  if (porDia == null || !(porDia > 0)) return null;
  return Math.floor(saldo / porDia);
}

// ── Preço ───────────────────────────────────────────────────────────────────

export interface UltimaCompra {
  dia: string;
  custoTotal: number | null;
  /** Por unidade (a peça solta). */
  custoUnitario: number;
  /** Quanto custou a embalagem inteira. */
  custoPorEmbalagem: number | null;
  /** Variação percentual sobre a compra anterior, quando existe. */
  variacaoPct: number | null;
}

/** A última entrada com preço, e quanto ele mudou desde a anterior. */
export function ultimaCompra(
  movimentos: readonly MovimentoDoEstoque[],
  porEmbalagem: number,
): UltimaCompra | null {
  const compras = movimentos
    .filter((m) => m.tipo === "entrada" && m.custoUnitario != null && m.custoUnitario > 0)
    .sort((a, b) => (a.dia < b.dia ? 1 : a.dia > b.dia ? -1 : 0));
  if (!compras.length) return null;
  const [atual, anterior] = compras;
  const unit = Number(atual.custoUnitario);
  const variacaoPct =
    anterior && Number(anterior.custoUnitario) > 0
      ? arredondar(
          ((unit - Number(anterior.custoUnitario)) / Number(anterior.custoUnitario)) * 100,
          1,
        )
      : null;
  return {
    dia: atual.dia,
    custoTotal: atual.custoTotal,
    custoUnitario: arredondar(unit, 4),
    custoPorEmbalagem: Number(porEmbalagem) > 0 ? arredondar(unit * Number(porEmbalagem), 2) : null,
    variacaoPct,
  };
}

/** O custo por unidade a partir do que foi pago e de quantas peças entraram. */
export function custoPorUnidade(custoTotal: number, unidadesQueEntraram: number): number | null {
  if (!(unidadesQueEntraram > 0) || !(custoTotal >= 0)) return null;
  return arredondar(custoTotal / unidadesQueEntraram, 4);
}

// ── O termômetro ────────────────────────────────────────────────────────────

export type SituacaoDoEstoque = "zerado" | "critico" | "baixo" | "medio" | "ok" | "sem_dados";

/** Dias de folga que enchem a barra por inteiro. */
export const DIAS_DA_BARRA_CHEIA = 30;

export interface LeituraDoEstoque {
  situacao: SituacaoDoEstoque;
  /** 0 a 1: o quanto a barra está cheia. */
  nivel: number;
  /** A cor da barra, em CSS (degradê do vermelho ao verde). */
  cor: string;
}

/** Vermelho (0) → laranja → amarelo → verde (1), em HSL, para a barra. */
export function corDoNivel(nivel: number): string {
  const n = Math.min(1, Math.max(0, Number(nivel) || 0));
  // 0° é vermelho e 130° é verde; o meio passa por laranja e amarelo.
  const matiz = Math.round(n * 130);
  return `hsl(${matiz} 72% 46%)`;
}

/**
 * Em que pé está o item.
 *
 * Com consumo conhecido, manda o TEMPO: a barra enche com 30 dias de folga, e
 * "acabando" é uma semana ou menos. Sem consumo conhecido (item novo, ou que
 * ninguém usa), manda o que o dono já definiu: o mínimo de reposição. Sem
 * nenhum dos dois, a barra mostra a quantidade em relação à maior compra e a
 * situação é "sem dados" — o sistema não finge saber quanto tempo dura.
 */
export function leituraDoEstoque(args: {
  saldo: number;
  minimo: number;
  dias: number | null;
  /** A maior quantidade já comprada de uma vez, para a barra de item sem consumo. */
  referencia?: number | null;
}): LeituraDoEstoque {
  const saldo = Number(args.saldo) || 0;
  const minimo = Math.max(0, Number(args.minimo) || 0);
  const { dias } = args;
  if (saldo <= 0) return { situacao: "zerado", nivel: 0, cor: corDoNivel(0) };

  if (dias != null) {
    const nivel = Math.min(1, dias / DIAS_DA_BARRA_CHEIA);
    const abaixoDoMinimo = minimo > 0 && saldo <= minimo;
    const situacao: SituacaoDoEstoque =
      dias <= 7 || abaixoDoMinimo ? "critico" : dias <= 14 ? "baixo" : dias <= 30 ? "medio" : "ok";
    // Item abaixo do mínimo nunca aparece mais cheio do que o limite do crítico.
    const nivelFinal = abaixoDoMinimo ? Math.min(nivel, 0.2) : nivel;
    return { situacao, nivel: nivelFinal, cor: corDoNivel(nivelFinal) };
  }

  if (minimo > 0) {
    const nivel = Math.min(1, saldo / (minimo * 3));
    const situacao: SituacaoDoEstoque =
      saldo <= minimo ? "critico" : saldo <= minimo * 2 ? "baixo" : "ok";
    return { situacao, nivel, cor: corDoNivel(nivel) };
  }

  const ref = Number(args.referencia) || 0;
  const nivel = ref > 0 ? Math.min(1, saldo / ref) : 0.5;
  return { situacao: "sem_dados", nivel, cor: corDoNivel(nivel) };
}

export const ROTULO_DA_SITUACAO: Record<SituacaoDoEstoque, string> = {
  zerado: "Acabou",
  critico: "Acabando",
  baixo: "Baixo",
  medio: "Atenção",
  ok: "Tranquilo",
  sem_dados: "Sem histórico",
};

// ── Os cards do topo ────────────────────────────────────────────────────────

export interface ItemParaOsCards {
  saldo: number;
  situacao: SituacaoDoEstoque;
  /** Custo por unidade da última compra. */
  custoUnitario: number | null;
}

export interface ResumoDoEstoque {
  itens: number;
  /** Zerados mais acabando. */
  acabando: number;
  zerados: number;
  /** Saldo × custo da última compra, só dos itens com preço. */
  valorEmEstoque: number;
  /** Itens com saldo mas sem nenhum preço de compra: o valor total está subestimado. */
  semPreco: number;
}

export function resumoDoEstoque(itens: readonly ItemParaOsCards[]): ResumoDoEstoque {
  let acabando = 0;
  let zerados = 0;
  let valor = 0;
  let semPreco = 0;
  for (const i of itens) {
    if (i.situacao === "zerado") zerados++;
    if (i.situacao === "zerado" || i.situacao === "critico") acabando++;
    if (i.saldo > 0) {
      if (i.custoUnitario != null && i.custoUnitario > 0) valor += i.saldo * i.custoUnitario;
      else semPreco++;
    }
  }
  return {
    itens: itens.length,
    acabando,
    zerados,
    valorEmEstoque: arredondar(valor, 2),
    semPreco,
  };
}

/** Gasto com compras (entradas) entre duas datas AAAA-MM-DD, inclusive. */
export function comprasNoPeriodo(
  movimentos: readonly MovimentoDoEstoque[],
  de: string,
  ate: string,
): number {
  return arredondar(
    movimentos
      .filter((m) => m.tipo === "entrada" && m.dia >= de && m.dia <= ate)
      .reduce((s, m) => s + (Number(m.custoTotal) || 0), 0),
    2,
  );
}
