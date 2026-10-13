// O que a IA leu no grupo do financeiro vira — ou não vira — um lançamento.
//
// ── A fronteira ────────────────────────────────────────────────────────────
//
// Terceiro irmão de `agendamento-da-ia.ts` e `casos-da-ia.ts`, e o mais
// traiçoeiro dos três.
//
// No agendamento, o erro aparece no mesmo dia: a paciente chega e não tem
// horário. No caso de antes e depois, aparece na hora: a foto errada está no
// WhatsApp de alguém. Aqui o erro é MUDO. Um valor trocado, uma categoria
// errada ou uma despesa lançada duas vezes não avisa ninguém — fica quieto até
// o fim do mês, quando o painel mostra um número que não bate com o banco e já
// não se sabe qual das cem linhas está torta.
//
// Por isso a regra é a mesma dos irmãos, e mais apertada: o modelo não escreve
// valor em lugar nenhum, não escolhe categoria pelo nome e não calcula data.
// Ele devolve um CÓDIGO de categoria da lista desta mensagem, um número, e uma
// palavra de data entre poucas permitidas. Tudo o que não couber nisso é
// recusado, e recusar significa o robô ficar calado — nunca gravar um palpite.
//
// ── Por que módulo puro ────────────────────────────────────────────────────
//
// Dá para exercitar todo jeito de errar — valor com vírgula, valor com ponto
// de milhar, "mil e duzentos", categoria inventada, data no futuro, mensagem
// que não é gasto nenhum — sem chamar modelo e sem gravar nada. Ver
// `tests/gasto-da-conversa.ts`.

import {
  comoGravar,
  ehForma,
  pedeParcelas,
  rotuloDoPagamento,
  MAX_PARCELAS,
  MIN_PARCELAS,
  type FormaDePagamento,
} from "./forma-de-pagamento.ts";

/** Uma categoria de despesa da clínica, como o banco a entrega. */
export interface CategoriaDaClinica {
  id: string;
  nome: string;
}

/** A mesma categoria, já com o código pelo qual a IA a nomeia. */
export interface CategoriaComCodigo extends CategoriaDaClinica {
  /** `G1`, `G2`… */
  codigo: string;
}

/** Uma conta da clínica — de onde o dinheiro saiu. */
export interface ContaDaClinica {
  id: string;
  nome: string;
}

/** A mesma conta, com o código pelo qual a IA a nomeia. */
export interface ContaComCodigo extends ContaDaClinica {
  /** `C1`, `C2`… */
  codigo: string;
}

/**
 * Quantas categorias entram na instrução.
 *
 * A clínica tem 21 e todas cabem. O teto existe para o dia em que alguém
 * cadastrar duzentas: a lista inteira num prompt não melhora a escolha, piora.
 */
export const MAXIMO_DE_CATEGORIAS = 40;

/**
 * Acima disto o robô não grava sozinho.
 *
 * Não é um limite de gasto da clínica — é um detector de dedo errado. Um zero
 * a mais em "1200" vira 12.000 e passaria despercebido no meio de um mês. O
 * valor alto continua podendo ser lançado; só não por uma mensagem de
 * WhatsApp sem ninguém olhar.
 */
export const TETO_SEM_CONFERIR = 20_000;

/**
 * A tabela de códigos das CONTAS desta mensagem.
 *
 * Prefixo `C`, contra o `G` das categorias, porque as duas listas vão juntas na
 * mesma instrução: com o mesmo prefixo, "1" seria ambíguo e o modelo acabaria
 * gravando a despesa na conta errada — que é um erro que o extrato bancário
 * denuncia meses depois, quando ninguém lembra.
 */
export function catalogoDeContas(
  contas: ContaDaClinica[] | null | undefined,
  maximo: number = MAXIMO_DE_CATEGORIAS,
): ContaComCodigo[] {
  const saida: ContaComCodigo[] = [];
  for (const c of Array.isArray(contas) ? contas : []) {
    if (saida.length >= Math.max(0, maximo)) break;
    const id = String(c?.id ?? "").trim();
    const nome = String(c?.nome ?? "").trim();
    if (!id || !nome) continue;
    saida.push({ codigo: `C${saida.length + 1}`, id, nome });
  }
  return saida;
}

/** A tabela de códigos desta mensagem. Categoria sem id ou sem nome não entra. */
export function catalogoDeCategorias(
  categorias: CategoriaDaClinica[] | null | undefined,
  maximo: number = MAXIMO_DE_CATEGORIAS,
): CategoriaComCodigo[] {
  const saida: CategoriaComCodigo[] = [];
  for (const c of Array.isArray(categorias) ? categorias : []) {
    if (saida.length >= Math.max(0, maximo)) break;
    const id = String(c?.id ?? "").trim();
    const nome = String(c?.nome ?? "").trim();
    if (!id || !nome) continue;
    saida.push({ codigo: `G${saida.length + 1}`, id, nome });
  }
  return saida;
}

/**
 * Vale a pena perguntar ao modelo?
 *
 * O grupo é de gente, não de robô: vai ter "bom dia", "já resolvi", "kkkk". O
 * modelo custa dinheiro a cada mensagem e não precisa ser chamado para ler
 * "ok". Um gasto sempre tem algarismo — não existe despesa sem valor — então
 * mensagem sem algarismo nenhum e sem imagem não é gasto, e isso se decide de
 * graça.
 *
 * Erra para o lado de PERGUNTAR: "paguei 2 contas hoje" tem algarismo e não é
 * lançamento, e aí quem recusa é o modelo. O contrário — deixar passar um
 * gasto de verdade — seria o robô ignorar alguém, que é pior.
 */
export function pareceGasto(texto: unknown, temImagem = false): boolean {
  if (temImagem) return true;
  return /\d/.test(String(texto ?? ""));
}

/** O que o modelo devolve ao ler uma mensagem do grupo. */
export interface LeituraBruta {
  ehGasto?: unknown;
  /** O TOTAL, sempre — nunca o valor de uma parcela. */
  valor?: unknown;
  /** Quando o modelo também leu a parcela, serve de conferência. */
  valorDaParcela?: unknown;
  categoria?: unknown;
  conta?: unknown;
  forma?: unknown;
  parcelas?: unknown;
  quando?: unknown;
  descricao?: unknown;
  fornecedor?: unknown;
  pago?: unknown;
}

/** O que a mensagem não disse e o robô não pode inventar. */
export type DadoQueFalta = "conta" | "forma";

/** O lançamento já conferido, pronto para virar linha no financeiro. */
export interface GastoConferido {
  /** O TOTAL em reais, sempre positivo e com no máximo dois decimais. */
  valor: number;
  /** O id de verdade da categoria, ou `null` quando nenhuma serviu. */
  categoriaId: string | null;
  /** O nome, só para o recado no grupo. */
  categoriaNome: string | null;
  /** De onde o dinheiro saiu. `null` enquanto a mensagem não disser. */
  contaId: string | null;
  contaNome: string | null;
  /** Como foi pago, no vocabulário do sistema. */
  forma: FormaDePagamento | null;
  /** Em quantas vezes, quando foi cartão parcelado. */
  parcelas: number | null;
  /** `financial_transactions.payment_method`, já traduzido. */
  paymentMethod: string | null;
  /** `financial_transactions.installment_total`, já traduzido. */
  installmentTotal: number | null;
  /**
   * O que a mensagem não disse.
   *
   * Vazio é o único estado em que o robô grava sozinho. Com algo aqui, ele
   * pergunta: sem conta o dinheiro não saiu de lugar nenhum e o saldo fica
   * mentindo; sem forma de pagamento a taxa da maquininha não tem como ser
   * calculada depois, e é ela que separa o que entrou do que sobrou.
   */
  faltando: DadoQueFalta[];
  /** "YYYY-MM-DD", no fuso da clínica. */
  data: string;
  descricao: string;
  fornecedor: string | null;
  /** `false` quando é conta a vencer em vez de despesa já paga. */
  pago: boolean;
  /** `true` quando o valor passou do teto e alguém precisa confirmar. */
  precisaConferir: boolean;
}

/** Por que uma leitura foi recusada. Vai para o log, nunca para o grupo. */
export type MotivoDaRecusa =
  | "não é gasto"
  | "sem valor"
  | "valor inválido"
  | "sem descrição"
  | "data inválida";

export type Leitura = { ok: true; gasto: GastoConferido } | { ok: false; motivo: MotivoDaRecusa };

/**
 * O valor, lido como um brasileiro escreve.
 *
 * "1.234,56" e "1234.56" são o mesmo dinheiro, e o modelo pode devolver
 * qualquer um dos dois — ou um número já pronto. A regra que decide: se tem
 * vírgula, a vírgula é o decimal e o ponto é milhar. Sem vírgula, um ponto
 * sozinho com um ou dois dígitos depois é decimal ("240.50"), e qualquer outro
 * ponto é milhar ("1.200" = mil e duzentos, que é como se escreve aqui).
 */
export function valorEmReais(bruto: unknown): number | null {
  if (typeof bruto === "number") {
    return Number.isFinite(bruto) && bruto > 0 ? arredondar(bruto) : null;
  }
  const texto = String(bruto ?? "")
    .replace(/r\$/gi, "")
    .replace(/\s/g, "")
    .trim();
  if (!texto || !/\d/.test(texto)) return null;
  if (/[^\d.,-]/.test(texto)) return null;

  let normalizado: string;
  if (texto.includes(",")) {
    normalizado = texto.replace(/\./g, "").replace(",", ".");
  } else {
    const pontos = texto.split(".").length - 1;
    const depoisDoUltimo = texto.slice(texto.lastIndexOf(".") + 1).length;
    normalizado =
      pontos === 1 && depoisDoUltimo > 0 && depoisDoUltimo <= 2 ? texto : texto.replace(/\./g, "");
  }
  const n = Number(normalizado);
  return Number.isFinite(n) && n > 0 ? arredondar(n) : null;
}

function arredondar(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * A data, a partir de uma palavra ou de uma data escrita.
 *
 * O modelo NÃO calcula data. Ele devolve "hoje", "ontem", "anteontem" ou uma
 * data pronta, e a conta é feita aqui com aritmética de texto — nunca com
 * `new Date("2026-10-13")`, que é meia-noite em UTC e no Brasil ainda é o dia
 * anterior. Mesmo cuidado de `mes.ts` e `plano-de-dias.ts`.
 *
 * Futuro é recusado: despesa que ainda não aconteceu não se lança como paga, e
 * "amanhã" num grupo de gastos é quase sempre o modelo tendo errado o ano.
 */
export function dataDoGasto(bruto: unknown, hoje: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hoje)) return null;
  const palavra = String(bruto ?? "")
    .trim()
    .toLowerCase();
  if (!palavra || palavra === "hoje") return hoje;
  if (palavra === "ontem") return somarDias(hoje, -1);
  if (palavra === "anteontem") return somarDias(hoje, -2);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(palavra)) return null;
  if (palavra > hoje) return null;
  // Um ano para trás cobre qualquer nota atrasada que alguém lance no grupo.
  // Mais do que isso é erro de digitação no ano, e um gasto no ano errado some
  // de todos os relatórios sem avisar.
  if (palavra < somarDias(hoje, -366)) return null;
  return diaExiste(palavra) ? palavra : null;
}

/** Soma dias a "YYYY-MM-DD" sem passar por `Date` com fuso. */
function somarDias(dia: string, quantos: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  const base = Date.UTC(a, m - 1, d);
  const alvo = new Date(base + quantos * 86_400_000);
  return alvo.toISOString().slice(0, 10);
}

/** 2026-02-31 passa no formato e não existe no calendário. */
function diaExiste(dia: string): boolean {
  const [a, m, d] = dia.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  const alvo = new Date(Date.UTC(a, m - 1, d));
  return alvo.getUTCFullYear() === a && alvo.getUTCMonth() === m - 1 && alvo.getUTCDate() === d;
}

const MAX_DESCRICAO = 120;
const MAX_FORNECEDOR = 80;

/**
 * A leitura do modelo, conferida contra o catálogo desta mensagem.
 *
 * Tudo o que não couber vira recusa, e recusa é o robô ficar calado. Gravar um
 * palpite seria pior do que não gravar: ninguém confere o que não sabe que
 * existe.
 */
export function gastoLido(
  bruto: LeituraBruta | null | undefined,
  catalogo: CategoriaComCodigo[],
  contas: ContaComCodigo[],
  hoje: string,
  tetoSemConferir: number = TETO_SEM_CONFERIR,
): Leitura {
  if (bruto?.ehGasto !== true) return { ok: false, motivo: "não é gasto" };

  if (bruto.valor === undefined || bruto.valor === null || bruto.valor === "") {
    return { ok: false, motivo: "sem valor" };
  }
  const valor = valorEmReais(bruto.valor);
  if (valor === null) return { ok: false, motivo: "valor inválido" };

  const descricao = String(bruto.descricao ?? "")
    .trim()
    .slice(0, MAX_DESCRICAO);
  // Sem descrição a linha fica "R$ 240,00" no extrato e ninguém lembra do quê.
  if (!descricao) return { ok: false, motivo: "sem descrição" };

  const data = dataDoGasto(bruto.quando ?? "hoje", hoje);
  if (!data) return { ok: false, motivo: "data inválida" };

  // Código fora da lista não vira categoria nenhuma — e isso NÃO recusa o
  // lançamento. A coluna aceita vazio, e uma despesa sem categoria no lugar
  // certo é melhor que uma despesa na categoria errada: a primeira aparece em
  // "sem categoria" e alguém arruma, a segunda mente para sempre.
  const pedido = String(bruto.categoria ?? "")
    .trim()
    .toUpperCase();
  const categoria =
    (Array.isArray(catalogo) ? catalogo : []).find((c) => c.codigo === pedido) ?? null;

  // A conta segue a mesma regra do código de horário: fora da lista não vira
  // nada. Mas aqui a ausência NÃO é tolerável como na categoria — uma despesa
  // sem conta não tirou dinheiro de lugar nenhum, e o saldo passa a mentir.
  const pedidoDaConta = String(bruto.conta ?? "")
    .trim()
    .toUpperCase();
  const conta =
    (Array.isArray(contas) ? contas : []).find((c) => c.codigo === pedidoDaConta) ?? null;

  const forma = ehForma(bruto.forma) ? bruto.forma : null;
  const parcelasCruas =
    typeof bruto.parcelas === "string" ? Number(bruto.parcelas) : bruto.parcelas;
  const parcelas =
    typeof parcelasCruas === "number" &&
    Number.isInteger(parcelasCruas) &&
    parcelasCruas >= MIN_PARCELAS &&
    parcelasCruas <= MAX_PARCELAS
      ? parcelasCruas
      : null;

  const gravavel = comoGravar(forma, parcelas);

  const faltando: DadoQueFalta[] = [];
  if (!conta) faltando.push("conta");
  // Parcelado sem o número de vezes é o mesmo que não ter dito a forma: a
  // forma afirma algo que o resto da mensagem não sustenta, e gravar "cartão"
  // sem as parcelas perde a informação de que havia parcelamento.
  if (!forma || (pedeParcelas(forma) && parcelas === null)) faltando.push("forma");

  // A conferência do total contra a parcela. "10x de 500" tem duas formas de
  // dar errado — o modelo manda 500 como total, ou multiplica errado — e as
  // duas somem no meio de um extrato. Quando os números não fecham, ninguém
  // grava sozinho.
  const parcelaLida = valorEmReais(bruto.valorDaParcela);
  const contaNaoFecha =
    parcelas !== null &&
    parcelaLida !== null &&
    Math.abs(arredondar(parcelaLida * parcelas) - valor) > 0.05;

  return {
    ok: true,
    gasto: {
      valor,
      categoriaId: categoria?.id ?? null,
      categoriaNome: categoria?.nome ?? null,
      contaId: conta?.id ?? null,
      contaNome: conta?.nome ?? null,
      forma,
      parcelas,
      paymentMethod: gravavel.payment_method,
      installmentTotal: gravavel.installment_total,
      faltando,
      data,
      descricao,
      fornecedor:
        String(bruto.fornecedor ?? "")
          .trim()
          .slice(0, MAX_FORNECEDOR) || null,
      // "pago" é o padrão: quem escreve num grupo de gastos quase sempre
      // acabou de pagar. Conta a vencer é o caso raro e precisa ser dito.
      pago: bruto.pago !== false,
      precisaConferir: valor > Math.max(0, tetoSemConferir) || contaNaoFecha,
    },
  };
}

/**
 * Junta o que faltava com o que a pessoa acabou de responder.
 *
 * O robô perguntou "de qual conta e como foi pago?" e alguém respondeu "pix do
 * Inter". A segunda leitura traz a conta e a forma, e nada mais — o valor, a
 * data e a descrição continuam sendo os da mensagem original.
 *
 * Por que não reler tudo: a resposta curta não tem valor nem data, e um modelo
 * relendo "pix do Inter" inventaria os dois. O que ficou guardado foi lido da
 * mensagem de verdade e não se mexe.
 */
export function completarGasto(
  guardado: GastoConferido,
  novo: GastoConferido | null,
): GastoConferido {
  if (!novo) return guardado;
  const forma = guardado.forma ?? novo.forma;
  const parcelas = guardado.parcelas ?? novo.parcelas;
  const gravavel = comoGravar(forma, parcelas);
  const contaId = guardado.contaId ?? novo.contaId;
  const faltando: DadoQueFalta[] = [];
  if (!contaId) faltando.push("conta");
  if (!forma || (pedeParcelas(forma) && parcelas === null)) faltando.push("forma");
  return {
    ...guardado,
    contaId,
    contaNome: guardado.contaNome ?? novo.contaNome,
    forma,
    parcelas,
    paymentMethod: gravavel.payment_method,
    installmentTotal: gravavel.installment_total,
    faltando,
  };
}

// ── O que a pessoa responde ────────────────────────────────────────────────

/**
 * "sim", "isso", "confirma" — e as variações de quem digita no celular.
 *
 * Só conta como confirmação a mensagem CURTA. "sim, mas o valor era outro" tem
 * um "sim" dentro e não é confirmação de nada; tratar como sim gravaria o
 * número errado exatamente no caso em que a pessoa estava corrigindo.
 */
export function ehConfirmacao(texto: unknown): boolean {
  const t = normalizar(texto);
  if (!t || t.length > 20) return false;
  return [
    "sim",
    "s",
    "isso",
    "isso ai",
    "isso mesmo",
    "e isso",
    "e isso ai",
    "e isso mesmo",
    "correto",
    "ta correto",
    "esta correto",
    "certo",
    "ta certo",
    "confirmo",
    "confirma",
    "confirmado",
    "ok",
    "okay",
    "pode",
    "pode sim",
    "pode lancar",
    "perfeito",
    "exato",
    "exatamente",
    "positivo",
    "uhum",
    "aham",
    "beleza",
    "blz",
  ].includes(t);
}

/** "apaga", "errado", "cancela" — o desfazer. Mesma regra de tamanho. */
export function ehCancelamento(texto: unknown): boolean {
  const t = normalizar(texto);
  if (!t || t.length > 20) return false;
  return [
    "nao",
    "n",
    "negativo",
    "errado",
    "ta errado",
    "esta errado",
    "apaga",
    "apagar",
    "apaga isso",
    "cancela",
    "cancelar",
    "cancelado",
    "desfaz",
    "desfazer",
    "exclui",
    "excluir",
    "remove",
    "remover",
    "ignora",
    "esquece",
  ].includes(t);
}

/** Sem acento, sem pontuação, sem caixa — é assim que se digita com pressa. */
function normalizar(texto: unknown): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── O que o grupo lê ───────────────────────────────────────────────────────

/** "R$ 1.234,56" — o jeito que a pessoa confere sem precisar pensar. */
export function emReais(valor: number): string {
  return `R$ ${valor
    .toFixed(2)
    .replace(".", ",")
    .replace(/\B(?=(\d{3})+(?!\d))/, ".")}`;
}

/** "13/10" — a data curta, que é o bastante para conferir. */
export function dataCurta(dia: string): string {
  const [, m, d] = dia.split("-");
  return `${d}/${m}`;
}

/**
 * O recado de que ficou lançado.
 *
 * É o comprovante. Precisa trazer os três números que alguém conferiria de
 * relance — quanto, do quê, quando — e dizer como desfazer. Robô calado
 * significa que nada foi gravado, e isso só funciona se o robô falado for
 * confiável.
 */
export function recadoDoLancamento(gasto: GastoConferido): string {
  const partes = [`✅ Lançado: ${emReais(gasto.valor)} · ${gasto.descricao}`];
  partes.push(
    [
      gasto.categoriaNome ?? "sem categoria",
      rotuloDoPagamento(gasto.forma, gasto.parcelas) || "forma não informada",
      gasto.contaNome ?? "conta não informada",
      dataCurta(gasto.data),
    ].join(" · ") + (gasto.pago ? "" : " · a vencer"),
  );
  // O valor da parcela sai calculado, e não lido: é o número que a pessoa tem
  // na mão para conferir contra a fatura, e errar nele seria errar o total.
  if (gasto.parcelas && gasto.parcelas > 1) {
    partes.push(`${gasto.parcelas}x de ${emReais(arredondar(gasto.valor / gasto.parcelas))}`);
  }
  if (!gasto.categoriaNome) {
    partes.push("Não achei a categoria — dá para ajustar em Pagamentos.");
  }
  partes.push('Se estiver errado, responde "apaga".');
  return partes.join("\n");
}

/**
 * O recado de que falta dado.
 *
 * Pergunta o que falta e NADA além: "de qual conta saiu?" responde-se em duas
 * palavras, "me dá mais detalhes" não se responde. E repete o que já entendeu,
 * porque é a chance de a pessoa ver o valor errado antes de ele ser gravado.
 */
export function recadoDoQueFalta(gasto: GastoConferido, contas: ContaComCodigo[]): string {
  const perguntas: string[] = [];
  if (gasto.faltando.includes("conta")) perguntas.push("de qual conta saiu");
  if (gasto.faltando.includes("forma")) {
    perguntas.push(gasto.forma && pedeParcelas(gasto.forma) ? "em quantas vezes" : "como foi pago");
  }
  const partes = [
    `Anotei ${emReais(gasto.valor)} · ${gasto.descricao} · ${dataCurta(gasto.data)}`,
    "",
    `Só falta: ${perguntas.join(" e ")}?`,
  ];
  if (gasto.faltando.includes("conta") && contas.length) {
    partes.push("", `Contas: ${contas.map((c) => c.nome).join(", ")}`);
  }
  if (gasto.faltando.includes("forma")) {
    partes.push("Formas: pix, dinheiro, cartão à vista ou cartão em Nx");
  }
  return partes.join("\n");
}

/**
 * O recado de que leu, mas ainda não gravou.
 *
 * Usado quando a leitura veio de uma FOTO, e quando o valor passou do teto.
 * Nos dois casos ninguém conferiu o número: na foto quem leu foi a máquina, no
 * valor alto o estrago de um zero a mais é grande demais para arriscar.
 */
export function recadoParaConferir(gasto: GastoConferido, deFoto: boolean): string {
  const partes = [
    deFoto ? "📄 Li o comprovante:" : "Só conferindo, que o valor é alto:",
    `${emReais(gasto.valor)} · ${gasto.descricao}`,
    [
      gasto.categoriaNome ?? "sem categoria",
      rotuloDoPagamento(gasto.forma, gasto.parcelas) || "forma não informada",
      gasto.contaNome ?? "conta não informada",
      dataCurta(gasto.data),
    ].join(" · "),
  ];
  if (gasto.parcelas && gasto.parcelas > 1) {
    partes.push(`${gasto.parcelas}x de ${emReais(arredondar(gasto.valor / gasto.parcelas))}`);
  }
  partes.push("", 'Está correto? Responde "sim" que eu lanço.');
  return partes.join("\n");
}

/**
 * As linhas que ensinam o modelo a ler uma mensagem do grupo.
 *
 * Moram aqui, ao lado da regra que confere, para as duas não divergirem —
 * mesmo arranjo de `comoUsarOsCasos` e `comoReportarFechamento`.
 */
export function comoLerOGasto(
  catalogo: CategoriaComCodigo[],
  contas: ContaComCodigo[],
  hoje: string,
): string {
  const linhas = [
    "Você lê as mensagens do grupo do financeiro de uma clínica e transforma",
    "em lançamento de despesa o que for despesa.",
    "",
    `Hoje é ${hoje}.`,
    "",
    "Responda SEMPRE com um JSON só, sem texto em volta:",
    "",
    "{",
    '  "ehGasto": true ou false,',
    '  "valor": o TOTAL em reais, sem "R$",',
    '  "valorDaParcela": o valor de UMA parcela, quando a mensagem disser, senão "",',
    '  "categoria": o código G da lista de categorias, ou "" se nenhuma servir,',
    '  "conta": o código C da lista de contas, ou "" se a mensagem não disser,',
    '  "forma": "pix", "dinheiro", "cartao", "cartao_parcelado" ou "",',
    '  "parcelas": o número de vezes, só quando for cartao_parcelado,',
    '  "quando": "hoje", "ontem", "anteontem" ou a data em AAAA-MM-DD,',
    '  "descricao": do que foi o gasto, curto, como num extrato,',
    '  "fornecedor": onde foi gasto, se der para saber, senão "",',
    '  "pago": true se já foi pago, false se é conta a vencer',
    "}",
    "",
    "Categorias desta clínica:",
    "",
  ];

  for (const c of catalogo) linhas.push(`- ${c.codigo} · ${c.nome}`);

  linhas.push("", "Contas desta clínica:", "");
  for (const c of contas) linhas.push(`- ${c.codigo} · ${c.nome}`);

  linhas.push(
    "",
    "Regras:",
    "",
    "- `ehGasto` é false quando a mensagem não registra uma despesa: conversa,",
    "  pergunta, combinado, bom dia, um valor citado sem alguém ter pago nada.",
    "  Na dúvida, false — quem erra para false fica calado e a pessoa repete;",
    "  quem erra para true põe dinheiro inventado no financeiro de alguém.",
    '- `valor` é sempre o TOTAL, nunca o de uma parcela. "10x de 500" tem valor',
    "  5000 e valorDaParcela 500. Mandar 500 como valor registra um décimo da",
    "  despesa, e o resto some.",
    '- `valor` é só o número. "mil e duzentos" vira 1200.',
    "- `categoria` é um código G da lista acima, escrito igual. Se nenhuma tiver",
    '  a ver, devolva "" — é melhor que a errada.',
    "- `conta` é um código C da lista acima. NUNCA chute: se a mensagem não",
    '  disser de onde saiu o dinheiro, devolva "". Quem pergunta depois acerta;',
    "  quem chuta põe a despesa na conta de outra pessoa.",
    '- `forma` vem do que a mensagem disser: "pix" para pix, "dinheiro" para',
    '  espécie, "cartao" para crédito ou débito à vista, "cartao_parcelado"',
    '  quando houver parcelas. Não disse? Devolva "".',
    '- `parcelas` só com "cartao_parcelado", e é o número de vezes (2 a 12).',
    "- `quando` nunca é no futuro, a não ser que a mensagem fale de uma conta a",
    "  vencer; aí `pago` é false.",
    "- `descricao` é o que a pessoa escreveu, limpo. Não invente detalhe que a",
    "  mensagem não tem.",
    "",
    "Nada além do JSON.",
  );

  return linhas.join("\n");
}
