// O que a IA gastou, em tokens, em dólar e em reais.
//
// ── A divisão de trabalho ──────────────────────────────────────────────
//
// `supabase/functions/_shared/consumo-da-ia.ts` GRAVA: lê o `usage` que a
// OpenAI devolve e guarda os tokens. Este arquivo LÊ: pega os tokens e
// responde quanto isso custou. As duas contas não são a mesma, e por isso não
// há cópia — diferente de `phone.ts` ou `cota.ts`, que precisam do mesmo
// cálculo nos dois runtimes.
//
// ── Por que o custo é calculado aqui, e não gravado lá ─────────────────
//
// O modelo desta clínica se chama `gpt-6-luna` e não é de catálogo público.
// Não existe preço que eu possa escrever aqui e garantir: ele vai ser digitado
// por quem lê a fatura, DEPOIS de as chamadas já terem acontecido.
//
// Congelando o custo na gravação, tudo que rodou antes de alguém digitar o
// preço valeria zero para sempre. Guardando só os tokens, cadastrar o preço
// hoje acerta o mês inteiro que já passou.
//
// Tudo aqui é puro. É o que permite conferir um valor em reais sem banco, sem
// rede e sem chamar a OpenAI.

/** Preço de um modelo, em dólares por MILHÃO de tokens — a unidade em que a
 *  OpenAI publica, e a única em que dá para conferir sem conta de cabeça. */
export interface PrecoDoModelo {
  entrada: number;
  /** Nulo quando o modelo não tem desconto de cache, ou quando não se sabe.
   *  Nesse caso o token de cache é cobrado como entrada cheia, que é o lado
   *  caro — estimar barato esconderia gasto. */
  cache: number | null;
  saida: number;
}

/** O que uma chamada gastou. Espelha `UsoDoModelo` do lado que grava. */
export interface TokensGastos {
  /** Entrada cobrada como nova, já SEM os tokens servidos do cache. */
  entrada: number;
  cache: number;
  saida: number;
}

/**
 * Preços de catálogo, em dólares por milhão de tokens.
 *
 * Conferidos em 30/09/2026 na página de preços da OpenAI. Ficam no código
 * porque são iguais para todo mundo e ninguém quer digitá-los. O preço que a
 * clínica digitar (`ai_precos_modelo`) tem precedência sobre esta tabela,
 * porque quem digitou está com a fatura na mão.
 *
 * Um modelo que não está aqui NÃO ganha preço chutado. Ver `custoEmUsd`.
 */
export const PRECOS_DE_CATALOGO: Record<string, PrecoDoModelo> = {
  "gpt-4o": { entrada: 2.5, cache: 1.25, saida: 10 },
  "gpt-4o-mini": { entrada: 0.15, cache: 0.075, saida: 0.6 },
  "gpt-4.1": { entrada: 2, cache: 0.5, saida: 8 },
  "gpt-4.1-mini": { entrada: 0.4, cache: 0.1, saida: 1.6 },
  "gpt-4.1-nano": { entrada: 0.1, cache: 0.025, saida: 0.4 },
};

/**
 * O preço que vale para este modelo, ou `null` se ninguém sabe.
 *
 * Nome comparado sem caixa e sem espaço em volta: ele vem de um campo de texto
 * na tela, e "GPT-4o " com espaço no fim é um erro de digitação que não pode
 * custar um mês de medição.
 */
export function precoDoModelo(
  modelo: string | null | undefined,
  cadastrados: Record<string, PrecoDoModelo>,
): PrecoDoModelo | null {
  const chave = String(modelo ?? "")
    .trim()
    .toLowerCase();
  if (!chave) return null;
  for (const [nome, preco] of Object.entries(cadastrados)) {
    if (nome.trim().toLowerCase() === chave) return preco;
  }
  for (const [nome, preco] of Object.entries(PRECOS_DE_CATALOGO)) {
    if (nome.toLowerCase() === chave) return preco;
  }
  return null;
}

/**
 * O que estas chamadas custaram, em dólares.
 *
 * `null` quando não há preço para o modelo — e `null` tem de atravessar a tela
 * inteira como "não sei", nunca virar zero pelo caminho. Zero é uma afirmação:
 * significa que a IA foi de graça.
 */
export function custoEmUsd(uso: TokensGastos, preco: PrecoDoModelo | null): number | null {
  if (!preco) return null;
  // Sem preço de cache, o token de cache é cobrado como entrada cheia.
  const doCache = preco.cache ?? preco.entrada;
  return (
    (uso.entrada * preco.entrada) / 1_000_000 +
    (uso.cache * doCache) / 1_000_000 +
    (uso.saida * preco.saida) / 1_000_000
  );
}

/** O mesmo em reais, ou `null` se faltar o custo ou a cotação. */
export function custoEmReais(usd: number | null, dolar: number | null): number | null {
  if (usd === null || dolar === null || !Number.isFinite(dolar) || dolar <= 0) return null;
  return usd * dolar;
}

/** Para que serviu a chamada, como a tela nomeia. As chaves espelham `ParaQue`
 *  do lado que grava. */
export const NOME_DO_USO: Record<string, string> = {
  resposta: "Respostas no WhatsApp",
  sugestao: "Sugestões no chat",
  aprendizado: "Leitura das conversas",
  licao: "Lições de atendimento",
  leitura: "Ler confirmação do paciente",
  teste: "Testes na tela",
};

export function nomeDoUso(para: string): string {
  return NOME_DO_USO[para] ?? para;
}

/** Uma linha de `ai_uso`, como a soma do mês a enxerga. */
export interface LinhaDeUso {
  quando: string;
  modelo: string;
  para: string;
  entrada: number;
  cache: number;
  saida: number;
  estimado: boolean;
}

export interface SomaDoMes {
  /** "2026-09" — a chave que ordena e que a tela formata. */
  mes: string;
  tokens: number;
  entrada: number;
  cache: number;
  saida: number;
  chamadas: number;
  usd: number | null;
  /** Quantas linhas do mês não têm preço. Maior que zero significa que o valor
   *  em dinheiro está INCOMPLETO, e a tela precisa dizer isso em vez de
   *  mostrar um total que parece fechado. */
  semPreco: number;
  /** O mês tem linha calculada por cima, e não medida. */
  temEstimativa: boolean;
  /** Quem gastou, do maior para o menor. */
  porUso: { para: string; nome: string; tokens: number; usd: number | null }[];
}

/**
 * Soma o consumo por mês.
 *
 * O mês sai de `quando` em horário de Brasília, e não em UTC: uma chamada das
 * 22h de 30/09 em São Paulo é 01/10 em UTC, e cairia no mês seguinte. Numa
 * tela cuja pergunta é "quanto gastei em setembro", isso é resposta errada.
 *
 * O custo é somado POR LINHA, e não sobre o total de tokens do mês: cada linha
 * pode ter um modelo diferente, com preço diferente. Somar tudo e multiplicar
 * uma vez só daria o número errado no mês em que a clínica trocou de modelo.
 */
export function somarPorMes(
  linhas: LinhaDeUso[],
  precos: Record<string, PrecoDoModelo>,
): SomaDoMes[] {
  const meses = new Map<string, SomaDoMes>();

  for (const l of linhas) {
    const mes = mesDeBrasilia(l.quando);
    if (!mes) continue;

    let m = meses.get(mes);
    if (!m) {
      m = {
        mes,
        tokens: 0,
        entrada: 0,
        cache: 0,
        saida: 0,
        chamadas: 0,
        usd: 0,
        semPreco: 0,
        temEstimativa: false,
        porUso: [],
      };
      meses.set(mes, m);
    }

    m.entrada += l.entrada;
    m.cache += l.cache;
    m.saida += l.saida;
    m.tokens += l.entrada + l.cache + l.saida;
    m.chamadas++;
    if (l.estimado) m.temEstimativa = true;

    const usd = custoEmUsd(l, precoDoModelo(l.modelo, precos));
    if (usd === null) m.semPreco++;
    else if (m.usd !== null) m.usd += usd;

    const linhaDoUso = m.porUso.find((u) => u.para === l.para);
    const tokensDaLinha = l.entrada + l.cache + l.saida;
    if (linhaDoUso) {
      linhaDoUso.tokens += tokensDaLinha;
      if (usd !== null && linhaDoUso.usd !== null) linhaDoUso.usd += usd;
    } else {
      m.porUso.push({ para: l.para, nome: nomeDoUso(l.para), tokens: tokensDaLinha, usd });
    }
  }

  // Um mês em que NENHUMA linha tem preço não vale zero, vale "não sei".
  // Zero diria que a clínica não gastou nada naquele mês.
  for (const m of meses.values()) {
    if (m.semPreco === m.chamadas) m.usd = null;
    m.porUso.sort((a, b) => b.tokens - a.tokens);
  }

  return [...meses.values()].sort((a, b) => b.mes.localeCompare(a.mes));
}

/**
 * O mês de uma data, em horário de Brasília.
 *
 * Feito com `Intl` em vez de subtrair três horas na mão porque o fuso do
 * Brasil já mudou de regra antes e vai mudar de novo; `Intl` acompanha, uma
 * subtração fixa não.
 */
export function mesDeBrasilia(quando: string): string | null {
  const d = new Date(quando);
  if (Number.isNaN(d.getTime())) return null;
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).format(d);
  // "en-CA" devolve "2026-09"; qualquer outra coisa é mudança de comportamento
  // do runtime, e melhor devolver nada que um mês inventado.
  return /^\d{4}-\d{2}$/.test(partes) ? partes : null;
}

/** "2026-09" vira "setembro de 2026". */
export function nomeDoMes(mes: string): string {
  const [ano, m] = mes.split("-").map(Number);
  if (!ano || !m) return mes;
  const nome = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(ano, m - 1, 1));
  return `${nome} de ${ano}`;
}

/**
 * Tokens como uma pessoa lê.
 *
 * 315.723 não diz nada a ninguém; "316 mil" diz. Abaixo de mil vai inteiro,
 * porque arredondar 40 para "0 mil" seria pior que o número cru.
 */
export function tokensLegiveis(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  if (n < 1_000) return String(Math.round(n));
  if (n < 1_000_000) return `${(n / 1_000).toFixed(n < 10_000 ? 1 : 0).replace(".", ",")} mil`;
  return `${(n / 1_000_000).toFixed(1).replace(".", ",")} mi`;
}

/** Reais com centavos, ou o travessão de "não sei". Centavos importam aqui:
 *  o gasto de um mês pode ser R$ 4,20, e "R$ 4" esconderia um quinto dele. */
export function reaisLegiveis(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
