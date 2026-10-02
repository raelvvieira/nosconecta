#!/usr/bin/env node
/**
 * Lê extrato bancário e faturas de cartão e PROPÕE os lançamentos do
 * financeiro. Não escreve nada no banco.
 *
 * ── Por que uma proposta, e não uma importação direta ────────────────────────
 *
 * Porque o extrato tem dinheiro que não é da clínica (outros negócios do dono,
 * aporte de sócio, aplicação no CDB) e porque a mesma compra aparece em dois
 * lugares: na fatura do cartão (quando foi comprada) e no extrato (quando a
 * fatura foi paga). Importar os dois é contar a despesa duas vezes. Lançar
 * despesa que não existe é pior que não lançar nada: o custo por hora de
 * cadeira sai errado e o preço de todo procedimento sai errado com ele.
 *
 * ── A regra de ouro deste script ────────────────────────────────────────────
 *
 * A DESPESA DO CARTÃO É A PARCELA, NÃO O PAGAMENTO DA FATURA.
 *
 * Cada parcela vira uma conta a pagar com vencimento na data da fatura; o
 * pagamento da fatura no extrato é transferência (sai do caixa para quitar o
 * que já foi lançado) e fica FORA. A conferência que prova isso está no
 * relatório: a soma das parcelas de cada fatura tem de bater, ao centavo, com
 * o valor pago no extrato. Nos cinco meses do Inter bateu.
 *
 * ── Por que não usa biblioteca de xlsx ──────────────────────────────────────
 *
 * Mesmo motivo de `scripts/importar-custos-planilha.mjs`, e o leitor de ZIP e
 * de aba é CÓPIA do de lá, de propósito: dependência de build para script que
 * roda uma vez se paga para sempre. Se mexer em `abrirZip`/`lerAba` aqui,
 * mexa no gêmeo — e vice-versa.
 *
 * Uma diferença existe e é de propósito: aqui todo nome de elemento aceita
 * prefixo de namespace (`<x:row>`, `<x:c>`, `<x:v>`), porque o export do Inter
 * escreve com prefixo e o do Google Planilhas, sem. A primeira versão deste
 * leitor devolveu "não tem aba legível" para uma planilha perfeitamente boa. O
 * gêmeo não recebeu a mudança porque a planilha dele não está mais à mão para
 * reconferir — quando estiver, é a mesma troca e os dois voltam a ser iguais.
 *
 * Uso:
 *   node scripts/importar-financeiro.mjs \
 *     --extrato <extrato.txt> \
 *     [--fatura-inter <faturas.xlsx>] [--fatura-mp <fatura-mp.txt>] \
 *     [--existentes <financial_transactions.csv>] \
 *     [--saida financeiro/importacao]
 *
 * A saída cai em `financeiro/importacao/`, que o `.gitignore` de lá mantém fora
 * do repositório: extrato tem nome de terceiro e valor de conta pessoal, e o
 * histórico do código é lido, clonado e copiado.
 *
 * `--extrato` e `--fatura-mp` são a saída de `pdftotext -layout <pdf>`.
 * `--existentes` é um CSV com as colunas `id,description,supplier_name,amount,
 * due_date,paid_date,status,categoria` — o que JÁ está no sistema. Sem ele o
 * script não sabe o que é novo, e avisa.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { basename, join } from "node:path";

// ── Argumentos ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function arg(nome, padrao = null) {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : padrao;
}

const caminhoExtrato = arg("extrato");
const caminhoInter = arg("fatura-inter");
const caminhoMp = arg("fatura-mp");
const caminhoExistentes = arg("existentes");
const dirSaida = arg("saida", "financeiro/importacao");

if (!caminhoExtrato && !caminhoInter && !caminhoMp) {
  console.error("Falta pelo menos uma fonte: --extrato, --fatura-inter ou --fatura-mp");
  process.exit(1);
}
for (const [rotulo, caminho] of [
  ["--extrato", caminhoExtrato],
  ["--fatura-inter", caminhoInter],
  ["--fatura-mp", caminhoMp],
  ["--existentes", caminhoExistentes],
]) {
  if (caminho && !existsSync(caminho)) {
    console.error(`Não achei o arquivo de ${rotulo}: ${caminho}`);
    process.exit(1);
  }
}

const avisos = [];

// ── Números e datas ─────────────────────────────────────────────────────────

/** "-R$ 1.234,56" → -1234.56. Devolve null para o que não é número. */
function dinheiro(s) {
  const limpo = String(s ?? "")
    .replace(/R\$/g, "")
    .replace(/ /g, "")
    .replace(/\s/g, "");
  const negativo = limpo.startsWith("-");
  const semSinal = limpo.replace(/^-/, "").replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(semSinal)) return null;
  const v = Number(semSinal);
  return negativo ? -v : v;
}

const brl = (v) =>
  (v === null || v === undefined ? 0 : v).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const money = (v) => (v === null || v === undefined ? "—" : `R$ ${brl(v)}`);

const MESES = {
  janeiro: 1,
  fevereiro: 2,
  março: 3,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

const iso = (a, m, d) =>
  `${String(a).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Serial de data do Excel → "AAAA-MM-DD". A época é 30/12/1899, e não
 *  01/01/1900: a planilha finge que 1900 foi bissexto. */
function dataDoSerial(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n)) return null;
  const ms = Date.UTC(1899, 11, 30) + Math.trunc(n) * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Soma meses a "AAAA-MM-DD" preservando o dia (31/01 + 1 mês = 28/02). */
function somarMeses(data, quantos) {
  const [a, m, d] = data.split("-").map(Number);
  const total = a * 12 + (m - 1) + quantos;
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return iso(ano, mes, Math.min(d, ultimoDia));
}

const normalizar = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// ── O extrato ───────────────────────────────────────────────────────────────

/**
 * O extrato do Inter em PDF tem a data como cabeçalho de bloco ("1 de Março de
 * 2026   Saldo do dia") e as movimentações do dia abaixo, cada uma com valor e
 * saldo. Então a data de uma linha é a do último cabeçalho visto — ler linha a
 * linha sem guardar esse estado dá movimentação sem data.
 */
function lerExtrato(caminho) {
  const linhas = readFileSync(caminho, "utf8").split("\n");
  const CABECALHO = /^\s*(\d{1,2}) de (\S+) de (\d{4})\s+Saldo do dia/i;
  // descrição, dois ou mais espaços, valor, dois ou mais espaços, saldo
  const MOVIMENTO = /^\s*(.+?)\s{2,}(-?R\$\s*[\d.,]+)\s+(-?R\$\s*[\d.,]+)\s*$/;

  const movimentos = [];
  let dia = null;
  for (const linha of linhas) {
    const c = CABECALHO.exec(linha);
    if (c) {
      const mes = MESES[c[2].toLowerCase()];
      dia = mes ? iso(Number(c[3]), mes, Number(c[1])) : null;
      continue;
    }
    const m = MOVIMENTO.exec(linha);
    if (!m || !dia) continue;
    const valor = dinheiro(m[2]);
    if (valor === null) continue;
    movimentos.push({ data: dia, descricao: m[1].trim(), valor });
  }
  return movimentos;
}

/** O nome da contraparte, sem o ISPB do banco na frente.
 *  `Pix enviado: "Cp :00360305-Andreia Carvalho Cortes"` → `Andreia Carvalho Cortes`.
 *  O número antes do hífen é o ISPB da INSTITUIÇÃO, não da pessoa — dois
 *  fornecedores no mesmo banco têm o mesmo número, então ele não identifica
 *  ninguém e é só ruído no nome. */
function contraparte(descricao) {
  let nome = descricao;
  const entreAspas = /"([^"]*)"/.exec(descricao);
  if (entreAspas) nome = entreAspas[1];
  else nome = descricao.replace(/^[^:]*:\s*/, "");
  return nome
    .replace(/^Cp\s*:?\s*\d*\s*-?/i, "")
    .replace(/^\d{4,}\s+\d+\s*/, "")
    .replace(/^\d+\s*/, "")
    .trim();
}

// ── Quem é da clínica e quem não é ──────────────────────────────────────────

/**
 * Ordem importa: a primeira regra que casar ganha. As de FORA vêm primeiro
 * porque "MERCADO PAGO INSTITUICAO" é pagamento de fatura e "PIX Marketplace"
 * é compra — os dois têm o mesmo ISPB e só o nome distingue.
 */
const REGRAS_DO_EXTRATO = [
  // [padrão, destino, categoria/motivo, fornecedor, descrição]
  // Fornecedor e descrição nulos significam "use o nome que o banco escreveu".
  // ── Fora: é o mesmo dinheiro mudando de bolso ─────────────────────────────
  [/^Aplicacao:|^Resgate:|CDB /i, "FORA", "aplicação/resgate no CDB", null],
  [
    /PAGAMENTO FATURA|Pagamento Fatura|MERCADO PAGO INSTITUIC/i,
    "FORA",
    "pagamento de fatura de cartão — a despesa é a parcela, não a fatura",
    null,
  ],
  [/ANDREIA CARVALHO CORTES/i, "FORA", "outro negócio do dono", null],
  [/RAEL DO VALE VIEIRA|RAEL VIEIRA/i, "FORA", "aporte próprio / transferência sua", null],
  [/MARIANE DOMINGUES BOTTI/i, "FORA", "aporte da sócia", null],

  // Confirmados por você em 02/10: não são do consultório. Ficam nomeados aqui
  // para que o próximo extrato os classifique sozinho, sem perguntar de novo.
  [/IZAIAS DE MOURA CORTES/i, "FORA", "outro negócio do dono", null],
  [/NILTON LUIZ SILVEIRA VIEIRA/i, "FORA", "outro negócio do dono", null],
  [/R\.?M\.? DOS SANTOS INFORMATICA/i, "FORA", "outro negócio do dono", null],
  [/FABRICIO CARDOSO DA CUNHA/i, "FORA", "outro negócio do dono", null],

  // ── Clínica: a obra da sala ───────────────────────────────────────────────
  [/JESIEL/i, "NOS", "Serviços de Instalação e Manutenção", "Jesiel da Silva"],
  [/CHRISTIAN DA CUNHA/i, "NOS", "Serviços de Instalação e Manutenção", "Christian da Cunha"],
  [/JONATHAN MOLINO/i, "NOS", "Serviços de Instalação e Manutenção", "Jonathan Molino"],
  [/CEODONTO/i, "NOS", "Serviços de Instalação e Manutenção", "Ceodonto"],

  // ── Clínica: a sala ───────────────────────────────────────────────────────
  [/AZEVEDO FILHOS/i, "NOS", "Aluguel", "Azevedo Filhos Neg Imob"],
  [/OPPORTUNITA/i, "NOS", "Aluguel", "Opportunita Empresarial"],
  [/CELESC/i, "NOS", "Energia", "CELESC", "Conta de Energia"],
  [/FULL ESQUADRIAS/i, "NOS", "Móveis", "Full Esquadrias"],
  [/CASSOL|MARMORARIA/i, "NOS", "Móveis", null],

  // Ar-condicionado da sala, pago por pix dentro do marketplace (22/09).
  // O nome que o banco imprime é "PIX Marketplace" e não diz o que foi.
  [/PIX Marketplace/i, "NOS", "Equipamentos", "Mercado Livre", "Ar-condicionado da sala"],

  // ── Clínica: material de obra ─────────────────────────────────────────────
  [
    /ATACADAO DAS TINTAS|PEDRA BRANCA|LEROY MERLIN|ZONA NOVA|LAGE MATERIAIS|CASAS DA AGUA|CASA DA AGUA|JOAO DE BARRO|CASAS DO CANO/i,
    "NOS",
    "Material de Construção",
    null,
  ],

  // ── Clínica: operação ─────────────────────────────────────────────────────
  [/SUJINHO/i, "NOS", "Limpeza", "Sujinho"],
  [/RMS TELECOM/i, "NOS", "Internet e Telefone", "RMS Telecom"],
  [/GUARDIAN/i, "NOS", "Custo de Operação", null],
  [/BEM A JEITO|MUNDIALMIX/i, "NOS", "Alimentação", null],
];

function classificarMovimento(descricao) {
  for (const [padrao, destino, motivo, fornecedor, rotulo] of REGRAS_DO_EXTRATO) {
    if (padrao.test(descricao)) return { destino, motivo, fornecedor, rotulo: rotulo ?? null };
  }
  return { destino: "DECIDIR", motivo: "—", fornecedor: null, rotulo: null };
}

// ── Os estabelecimentos do cartão ───────────────────────────────────────────

/**
 * Cartão não tem nome de fornecedor: tem nome de credenciadora
 * ("SHOPEE *DastyShop", "MP *QUALITATE"). Então categoria e fornecedor vêm
 * desta lista. `confirmado: false` é suposição minha pelo nome — vai para o
 * relatório marcada como tal, porque categoria errada é custo errado no
 * procedimento que a usa.
 */
const ESTABELECIMENTOS = [
  // Confirmados por você
  [/OLSEN/i, "Equipamentos", "Olsen", "Cadeira Odontológica", true],
  [/QUALITATE/i, "Móveis", "Qualitate", "Móveis planejados da sala", true],
  [/DASTYSHOP/i, "Material de Construção", "DastyShop (Shopee)", "Torneiras da sala", true],
  [/Shopee\*?50487836/i, "Material de Consumo", "Shopee", "Itens operacionais da sala", true],
  [
    /MERCADOLIVRE\*MERCADOL|MERCADOLIVRE\*MERCADOLIVRE/i,
    "Material de Consumo",
    "Mercado Livre",
    "Limpeza, suportes e manutenção da sala",
    true,
  ],
  [/ELECTROLUX/i, "Equipamentos", "Electrolux (Shopee)", "Frigobar da sala", true],
  [/LUMINIART/i, "Material de Construção", "Luminiart (Mercado Livre)", "LED da sala", true],
  [/ANCORA/i, "Material de Construção", "Âncora (Mercado Livre)", "Luminária da sala", true],
  [/DUNAMOBI/i, "Móveis", "DunaMobi", "Cadeiras da sala", true],

  // Suposições pelo nome — confirmar antes de gravar
  [/SEGURO CARTAO/i, "Taxas de Operação", "Banco Inter", "Seguro do cartão", false],
  [
    /CredAluga|CREDALUGA/i,
    "Taxas de Operação",
    "Azevedo Filhos Neg Imob",
    "Calção do aluguel",
    false,
  ],
  [/FACEBK|FACEBOOK|META PLATFORMS/i, "Anúncios", "Meta", "Anúncios", false],
  [
    /COMERCIO DE TINTAS|TINTAS/i,
    "Material de Construção",
    "IR Comércio de Tintas",
    "Tintas da sala",
    false,
  ],
  [/MARMORARIA/i, "Material de Construção", "Marmoraria Passos", "Bancada da sala", false],
  [/DivinaLuz/i, "Material de Construção", "Divina Luz (Shopee)", "Iluminação da sala", false],
  [/AcoDecor/i, "Material de Construção", "AçoDecor (Shopee)", "Acabamento da sala", false],
  [/MadeiraMad|MADEIRAMADEIRA/i, "Móveis", "MadeiraMadeira", "Móveis da sala", false],
  [/OutletdosEspel/i, "Móveis", "Outlet dos Espelhos (Shopee)", "Espelhos da sala", false],
  [/Webcontinental/i, "Equipamentos", "Webcontinental (Shopee)", "Equipamento da sala", false],
];

function classificarEstabelecimento(estab) {
  for (const [padrao, categoria, fornecedor, descricao, confirmado] of ESTABELECIMENTOS) {
    if (padrao.test(estab)) return { categoria, fornecedor, descricao, confirmado };
  }
  return { categoria: null, fornecedor: estab, descricao: estab, confirmado: false };
}

// ── O .xlsx, sem biblioteca ─────────────────────────────────────────────────
// Gêmeo de `scripts/importar-custos-planilha.mjs`. Ver o comentário longo de lá
// sobre por que a leitura é pelo DIRETÓRIO CENTRAL e por que a célula vazia
// autofechada vem primeiro na alternância do regex de `<c>`.

function abrirZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("não parece um .xlsx: não achei o fim do ZIP");

  const quantos = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  const saida = {};
  for (let k = 0; k < quantos; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const metodo = buf.readUInt16LE(p + 10);
    const compactado = buf.readUInt32LE(p + 20);
    const tamNome = buf.readUInt16LE(p + 28);
    const tamExtra = buf.readUInt16LE(p + 30);
    const tamComentario = buf.readUInt16LE(p + 32);
    const offsetLocal = buf.readUInt32LE(p + 42);
    const nome = buf.subarray(p + 46, p + 46 + tamNome).toString("utf8");

    const tnLocal = buf.readUInt16LE(offsetLocal + 26);
    const teLocal = buf.readUInt16LE(offsetLocal + 28);
    const inicio = offsetLocal + 30 + tnLocal + teLocal;
    const dados = buf.subarray(inicio, inicio + compactado);
    try {
      saida[nome] = metodo === 0 ? Buffer.from(dados) : inflateRawSync(dados);
    } catch {
      // Membro ilegível não derruba os outros.
    }
    p += 46 + tamNome + tamExtra + tamComentario;
  }
  return saida;
}

const decodificar = (s) =>
  String(s)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");

function textoDeElemento(xml) {
  const partes = [...xml.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map(
    (m) => m[1],
  );
  return decodificar(partes.join(""));
}

function lerAba(xml, compartilhadas) {
  const linhas = [];
  for (const mr of xml.matchAll(
    /<(?:\w+:)?row(?=[\s/>])[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g,
  )) {
    const n = Number(mr[1]);
    const celulas = {};
    for (const mc of mr[2].matchAll(
      /<(?:\w+:)?c(?=[\s/>])([^>]*?)\/>|<(?:\w+:)?c(?=[\s/>])([^>]*?)>([\s\S]*?)<\/(?:\w+:)?c>/g,
    )) {
      const autofechada = mc[1] !== undefined;
      const attrs = autofechada ? mc[1] : (mc[2] ?? "");
      const corpo = autofechada ? "" : (mc[3] ?? "");
      const ref = (attrs.match(/r="([A-Z]+)\d+"/) || [])[1];
      if (!ref) continue;
      const tipo = (attrs.match(/t="([^"]*)"/) || [])[1];
      let valor = null;
      if (tipo === "s") {
        const v = (corpo.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/) || [])[1];
        if (v !== undefined) valor = compartilhadas[Number(v)] ?? null;
      } else if (tipo === "inlineStr") {
        valor = textoDeElemento(corpo);
      } else {
        const v = (corpo.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/) || [])[1];
        if (v !== undefined) valor = decodificar(v);
      }
      if (valor !== null && String(valor).trim() !== "") celulas[ref] = String(valor).trim();
    }
    if (Object.keys(celulas).length) linhas.push({ n, celulas });
  }
  return linhas;
}

function lerPlanilha(caminho) {
  const zip = abrirZip(readFileSync(caminho));
  const compartilhadas = zip["xl/sharedStrings.xml"]
    ? [
        ...zip["xl/sharedStrings.xml"]
          .toString("utf8")
          .matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g),
      ].map((m) => textoDeElemento(m[1]))
    : [];

  const rels = (zip["xl/_rels/workbook.xml.rels"] || Buffer.from("")).toString("utf8");
  // Atributo por atributo, e não num regex só: `Id` e `Target` aparecem em
  // ORDEM DIFERENTE conforme quem gravou o arquivo. O export do Inter escreve
  // `Type … Target … Id`, e um regex que exigia `Id` antes de `Target` não
  // casava nada — o script dizia "não tem aba legível" sobre uma planilha boa.
  const porId = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*\/?>/g)) {
    const tag = m[0];
    const id = (tag.match(/\bId="([^"]+)"/) || [])[1];
    const alvo = (tag.match(/\bTarget="([^"]+)"/) || [])[1];
    if (!id || !alvo) continue;
    porId[id] = alvo.replace(/^\/?xl\//, "").replace(/^\.\//, "");
  }

  const wb = (zip["xl/workbook.xml"] || Buffer.from("")).toString("utf8");
  const abas = [];
  for (const m of wb.matchAll(/<(?:\w+:)?sheet(?=[\s/>])[^>]*\/>/g)) {
    const tag = m[0];
    const nome = decodificar((tag.match(/name="([^"]*)"/) || [])[1] || "");
    const rid = (tag.match(/r:id="([^"]*)"/) || [])[1];
    const alvo = porId[rid];
    const arquivo = alvo ? `xl/${alvo}` : null;
    if (!arquivo || !zip[arquivo]) continue;
    abas.push({ nome, linhas: lerAba(zip[arquivo].toString("utf8"), compartilhadas) });
  }
  return abas;
}

// ── A fatura do Inter (planilha) ────────────────────────────────────────────

const FATURA_NOME = /^(\S+)\s*\/\s*(\d{4})$/;

/** "Setembro/2026" → "2026-09". Sem isso não se ordena fatura por mês. */
function mesDaFatura(rotulo) {
  const m = FATURA_NOME.exec(String(rotulo ?? "").trim());
  if (!m) return null;
  const mes = MESES[m[1].toLowerCase()];
  return mes ? `${m[2]}-${String(mes).padStart(2, "0")}` : null;
}

function lerFaturaInter(caminho) {
  const abas = lerPlanilha(caminho);
  if (!abas.length) {
    avisos.push(`A planilha ${basename(caminho)} não tem aba legível.`);
    return [];
  }
  const linhas = abas[0].linhas;
  const transacoes = [];
  for (const { n, celulas } of linhas) {
    const data = /^\d+(\.\d+)?$/.test(celulas.A ?? "")
      ? dataDoSerial(celulas.A)
      : /^\d{4}-\d{2}-\d{2}/.test(celulas.A ?? "")
        ? celulas.A.slice(0, 10)
        : null;
    const valor = Number(String(celulas.C ?? "").replace(",", "."));
    if (!data || !Number.isFinite(valor)) continue; // cabeçalho e linha solta
    transacoes.push({
      linha: n,
      data,
      estabelecimento: celulas.B ?? "",
      valor,
      parcela: celulas.D ? Math.trunc(Number(celulas.D)) : 1,
      totalParcelas: celulas.E ? Math.trunc(Number(celulas.E)) : 1,
      fatura: celulas.F ?? "",
      cartao: "Inter",
    });
  }
  return transacoes;
}

// ── A fatura do Mercado Pago (PDF virado em texto) ──────────────────────────

/**
 * O PDF do Mercado Pago imprime uma linha por movimentação:
 *   `04/09      SHOPEE *ELECTROLUX          Parcela 1 de 8             R$ 60,60`
 * O ano não aparece na linha — vem do vencimento da fatura, que aparece em
 * "Vencimento: 16/09/2026". E a compra pode ser do mês anterior ao vencimento
 * (consumos de 12/08 a 11/09), então dia 20/08 numa fatura que vence em
 * setembro é agosto, não setembro: o ano só se resolve olhando se o mês da
 * compra é maior que o mês do vencimento (virada de ano).
 */
function lerFaturaMercadoPago(caminho) {
  const texto = readFileSync(caminho, "utf8");
  const venc = /Vencimento:\s*(\d{2})\/(\d{2})\/(\d{4})/.exec(texto);
  if (!venc) {
    avisos.push(`Não achei "Vencimento:" em ${basename(caminho)} — a fatura do MP foi ignorada.`);
    return { transacoes: [], vencimento: null, total: null };
  }
  const vencimento = iso(Number(venc[3]), Number(venc[2]), Number(venc[1]));
  const anoVenc = Number(venc[3]);
  const mesVenc = Number(venc[2]);

  const LINHA =
    /^\s*(\d{2})\/(\d{2})\s+(.+?)\s{2,}(?:Parcela\s+(\d+)\s+de\s+(\d+))?\s*R\$\s*([\d.,]+)\s*$/;
  const transacoes = [];
  let creditos = 0;
  for (const linha of texto.split("\n")) {
    const m = LINHA.exec(linha);
    if (!m) continue;
    const descricao = m[3].trim();
    const valor = dinheiro(m[6]);
    // "Crédito concedido", "Pagamento" e afins não são compra. Mas entram na
    // CONTA da fatura: sem somá-los à parte, a conferência acusa diferença
    // (aqui, R$ 66,49) e dá a impressão de fonte incompleta.
    if (/credito concedido|pagamento|estorno|devolvid/i.test(normalizar(descricao))) {
      if (valor !== null) creditos += valor;
      continue;
    }
    if (valor === null) continue;
    const mesCompra = Number(m[2]);
    const ano = mesCompra > mesVenc ? anoVenc - 1 : anoVenc;
    transacoes.push({
      linha: 0,
      data: iso(ano, mesCompra, Number(m[1])),
      estabelecimento: descricao,
      valor,
      parcela: m[4] ? Number(m[4]) : 1,
      totalParcelas: m[5] ? Number(m[5]) : 1,
      fatura: `${anoVenc}-${String(mesVenc).padStart(2, "0")}`,
      vencimento,
      cartao: "Mercado Pago",
    });
  }
  const tot = /^Total\s+R\$\s*([\d.,]+)\s*$/m.exec(texto);
  return { transacoes, vencimento, creditos, total: tot ? dinheiro(tot[1]) : null };
}

// ── O que já está no sistema ────────────────────────────────────────────────

/** CSV simples com aspas duplas. Não é um parser geral de CSV: é o nosso
 *  arquivo, com forma conhecida, e dependência nova para isto não se paga. */
function lerCsv(caminho) {
  const texto = readFileSync(caminho, "utf8").replace(/^﻿/, "");
  const linhas = [];
  let campo = "";
  let atual = [];
  let dentroDeAspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (dentroDeAspas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') dentroDeAspas = false;
      else campo += c;
      continue;
    }
    if (c === '"') dentroDeAspas = true;
    else if (c === ",") {
      atual.push(campo);
      campo = "";
    } else if (c === "\n") {
      atual.push(campo);
      linhas.push(atual);
      atual = [];
      campo = "";
    } else if (c !== "\r") campo += c;
  }
  if (campo !== "" || atual.length) {
    atual.push(campo);
    linhas.push(atual);
  }
  if (!linhas.length) return [];
  const cabecalho = linhas[0].map((h) => h.trim());
  return linhas
    .slice(1)
    .filter((l) => l.some((v) => v.trim() !== ""))
    .map((l) => Object.fromEntries(cabecalho.map((h, i) => [h, (l[i] ?? "").trim()])));
}

const existentes = caminhoExistentes
  ? lerCsv(caminhoExistentes).map((r) => ({
      id: r.id ?? "",
      descricao: r.description ?? r.descricao ?? "",
      fornecedor: r.supplier_name ?? r.fornecedor ?? "",
      valor: Number(String(r.amount ?? r.valor ?? "0").replace(",", ".")),
      vencimento: (r.due_date ?? r.vencimento ?? "").slice(0, 10) || null,
      pagoEm: (r.paid_date ?? r.pago_em ?? "").slice(0, 10) || null,
      status: r.status ?? "",
      categoria: r.categoria ?? r.category ?? "",
      casou: false,
    }))
  : [];

if (!existentes.length) {
  avisos.push(
    "Sem `--existentes`, este relatório NÃO sabe o que já está lançado. " +
      "Rode de novo passando o CSV das contas a pagar antes de gravar qualquer coisa.",
  );
}

/** A parcela "(3/10)" escrita na descrição de um lançamento que já existe. */
function parcelaDaDescricao(descricao) {
  const m = /\((\d+)\s*\/\s*(\d+)\)/.exec(descricao);
  return m ? { parcela: Number(m[1]), total: Number(m[2]) } : null;
}

const diasEntre = (a, b) =>
  !a || !b ? Infinity : Math.abs((Date.parse(a) - Date.parse(b)) / 86400000);

/**
 * Acha o lançamento que já existe para esta proposta. Duas chaves, nesta ordem:
 *
 * 1. valor igual + MESMA parcela n/N → é a mesma parcela, mesmo que a data
 *    esteja diferente. A data do sistema é o vencimento que alguém digitou; a
 *    nossa é o da fatura. Exigir data igual aqui faria a cadeira do Olsen ser
 *    lançada dez vezes de novo.
 * 2. valor igual + fornecedor parecido + data até 7 dias de distância.
 */
function acharExistente(proposta) {
  const forn = normalizar(proposta.fornecedor);
  const candidatos = existentes.filter(
    (e) => !e.casou && Math.abs(e.valor - proposta.valor) < 0.011,
  );

  if (proposta.parcela && proposta.totalParcelas > 1) {
    const porParcela = candidatos.find((e) => {
      const p = parcelaDaDescricao(e.descricao);
      return (
        p &&
        p.parcela === proposta.parcela &&
        p.total === proposta.totalParcelas &&
        (normalizar(e.fornecedor).includes(forn.split(" ")[0]) ||
          forn.includes(normalizar(e.fornecedor).split(" ")[0]))
      );
    });
    if (porParcela) return porParcela;
  }

  const quandoDa = (e) => e.pagoEm ?? e.vencimento;
  const quandoDaProposta = proposta.pagoEm ?? proposta.vencimento;
  const perto = (e, dias) => diasEntre(quandoDa(e), quandoDaProposta) <= dias;

  const porNome = candidatos.find((e) => {
    const en = normalizar(e.fornecedor);
    const primeiro = forn.split(" ")[0];
    const parecido =
      primeiro.length >= 4 && (en.includes(primeiro) || forn.includes(en.split(" ")[0]));
    return parecido && perto(e, 7);
  });
  if (porNome) return porNome;

  // Valor exato e data a até 7 dias, ainda que o NOME seja outro. Parece
  // frouxo e não é: foi assim que "Material para Instalação Elétrica · Casa
  // Da Água, R$ 1.195,00 em 09/07" se revelou o pix de R$ 1.195,00 do mesmo
  // dia para a Pedra Branca. Sem esta chave, o lançamento ficava "sem lastro"
  // e o pix virava despesa nova — o mesmo dinheiro contado duas vezes, com
  // dois nomes diferentes. Dois gastos de valor idêntico ao centavo na mesma
  // semana para fornecedores de fato diferentes é raro, e quando acontece a
  // correção de nome vai para o relatório e uma pessoa vê.
  const porValorEData = candidatos.find((e) => perto(e, 7));
  if (porValorEData) return porValorEData;

  // Quase o mesmo valor, mesmo fornecedor, mesma semana: é a parcela paga com
  // juros ou correção. A Esquadrias 3/6 é de R$ 1.715,00 e saiu R$ 1.749,48.
  // Casar aqui evita a parcela ficar `pending` para sempre E o pagamento
  // entrar como despesa nova; a diferença não é esquecida — vira uma linha
  // em `a-decidir.csv`.
  const quase = existentes.find((e) => {
    if (e.casou) return false;
    const dif = Math.abs(e.valor - proposta.valor);
    if (dif < 0.011 || dif > Math.max(50, e.valor * 0.05)) return false;
    const en = normalizar(e.fornecedor);
    const primeiro = forn.split(" ")[0];
    const parecido =
      primeiro.length >= 4 && (en.includes(primeiro) || forn.includes(en.split(" ")[0]));
    return parecido && perto(e, 7);
  });
  if (quase) {
    diferencasDeValor.push({
      data: quandoDaProposta,
      descricao: `${quase.descricao} · ${quase.fornecedor}`,
      valor: -(proposta.valor - quase.valor),
      nome: quase.fornecedor,
      motivo: `pago ${money(proposta.valor)} contra ${money(quase.valor)} lançados — juros, correção ou valor digitado errado?`,
    });
    return quase;
  }

  return null;
}

// ── Monta as propostas ──────────────────────────────────────────────────────

/** Diferença entre o que foi pago e o que está lançado, quando o cruzamento
 *  casou os dois por aproximação. Fica em `a-decidir.csv`: é dinheiro real que
 *  nenhuma das duas linhas explica. */
const diferencasDeValor = [];

const propostas = []; // o que entra como conta a pagar
const fora = []; // deliberadamente de fora, com motivo
const decidir = []; // precisa de uma pessoa
const entradas = []; // dinheiro que entrou — receita não se adivinha

const movimentos = caminhoExtrato ? lerExtrato(caminhoExtrato) : [];

/** Pagamentos de fatura vistos no extrato, por mês — é o que prova que uma
 *  parcela de cartão já saiu do caixa. */
const faturasPagas = [];
for (const m of movimentos) {
  if (m.valor >= 0) continue;
  // O pagamento da fatura do Inter se chama "fatura" no extrato. O do Mercado
  // Pago não: sai como pix para "MERCADO PAGO INSTITUICAO DE PAGAMENTO LTDA".
  // Procurar só a palavra "fatura" deixava as parcelas do MP eternamente
  // `pending`, mesmo com a fatura quitada.
  const ehMp = /MERCADO PAGO INSTITUIC/i.test(m.descricao);
  if (!ehMp && !/fatura/i.test(m.descricao)) continue;
  faturasPagas.push({
    data: m.data,
    valor: -m.valor,
    cartao: ehMp ? "Mercado Pago" : "Inter",
    descricao: m.descricao,
  });
}

for (const m of movimentos) {
  const { destino, motivo, fornecedor, rotulo } = classificarMovimento(m.descricao);
  const nome = fornecedor ?? contraparte(m.descricao);

  // Resgate de CDB e aporte de sócio entram como dinheiro, mas não são receita
  // nem despesa: o destino manda, e não o sinal do valor. Sem este teste antes
  // do sinal, R$ 155 mil de resgate do CDB apareceriam como "entrada a
  // conferir" e esconderiam as poucas entradas que importam.
  if (destino === "FORA") {
    fora.push({ ...m, nome, motivo });
    continue;
  }
  if (m.valor > 0) {
    // Entrada. Mesmo a da clínica não vira receita aqui: receita do consultório
    // nasce de consulta realizada com valor cobrado, e lançar entrada de banco
    // como receita duplicaria o faturamento. Vai para conferência.
    entradas.push({ ...m, nome, motivo: "entrada a conferir" });
    continue;
  }
  if (destino === "DECIDIR") {
    decidir.push({ ...m, nome, motivo: "não sei o que é" });
    continue;
  }
  propostas.push({
    fonte: "extrato",
    data: m.data,
    descricao: rotulo ?? nome,
    fornecedor: nome,
    categoria: motivo,
    valor: -m.valor,
    vencimento: m.data,
    pagoEm: m.data,
    status: "paid",
    parcela: 1,
    totalParcelas: 1,
    confirmado: true,
    origem: m.descricao,
  });
}

// ── O cartão: uma conta a pagar por PARCELA ─────────────────────────────────

const mp = caminhoMp
  ? lerFaturaMercadoPago(caminhoMp)
  : { transacoes: [], vencimento: null, creditos: 0, total: null };
const transacoesDeCartao = [
  ...(caminhoInter ? lerFaturaInter(caminhoInter) : []),
  ...mp.transacoes,
];

/** Crédito dado dentro da fatura, por cartão e mês: abate o que saiu do caixa. */
const creditosDaFatura = new Map();
if (mp.vencimento && mp.creditos) {
  creditosDaFatura.set(`Mercado Pago|${mp.vencimento.slice(0, 7)}`, mp.creditos);
}

/**
 * Cada linha da fatura é UMA parcela já faturada. As parcelas seguintes de uma
 * compra em N vezes ainda não apareceram em fatura nenhuma — e são compromisso
 * real, que o planejamento precisa ver. Então a compra (parcela 1 de N) gera N
 * contas a pagar: as que já vieram em fatura ficam com o vencimento daquela
 * fatura, e as futuras ganham vencimento estimado, somando mês a mês.
 */
const vencimentoDaFatura = new Map(); // "Inter|2026-09" → "2026-09-21"
for (const f of faturasPagas) {
  const mes = f.data.slice(0, 7);
  vencimentoDaFatura.set(`${f.cartao}|${mes}`, f.data);
}

const jaFaturadas = new Set();
for (const t of transacoesDeCartao) {
  const mes = t.cartao === "Inter" ? mesDaFatura(t.fatura) : t.fatura;
  jaFaturadas.add(`${t.cartao}|${normalizar(t.estabelecimento)}|${t.data}|${t.parcela}`);
  t.mesDaFatura = mes;
}

for (const t of transacoesDeCartao) {
  const info = classificarEstabelecimento(t.estabelecimento);
  if (!info.categoria) {
    decidir.push({
      data: t.data,
      descricao: `${t.cartao} · ${t.estabelecimento}`,
      valor: -t.valor * t.totalParcelas,
      nome: t.estabelecimento,
      motivo: "estabelecimento de cartão que não sei categorizar",
    });
    continue;
  }

  // Só a parcela 1 gera a compra inteira; as demais linhas da fatura são a
  // mesma compra aparecendo de novo e já estão cobertas.
  const ehPrimeira = t.parcela === 1;
  const parcelasAGerar = ehPrimeira
    ? Array.from({ length: t.totalParcelas }, (_, i) => i + 1)
    : jaFaturadas.has(`${t.cartao}|${normalizar(t.estabelecimento)}|${t.data}|1`)
      ? [] // a parcela 1 está no arquivo, ela cuida de todas
      : [t.parcela]; // só a do meio veio (fatura antiga faltando)

  for (const p of parcelasAGerar) {
    const mesDestaParcela = t.mesDaFatura
      ? somarMeses(`${t.mesDaFatura}-01`, p - t.parcela).slice(0, 7)
      : null;
    const pagoNaFatura = mesDestaParcela
      ? (vencimentoDaFatura.get(`${t.cartao}|${mesDestaParcela}`) ?? null)
      : null;
    const vencimentoEstimado =
      pagoNaFatura ??
      (t.vencimento
        ? somarMeses(t.vencimento, p - t.parcela)
        : mesDestaParcela
          ? `${mesDestaParcela}-15`
          : t.data);

    propostas.push({
      fonte: `cartão ${t.cartao}`,
      data: t.data,
      descricao:
        t.totalParcelas > 1 ? `${info.descricao} (${p}/${t.totalParcelas})` : info.descricao,
      fornecedor: info.fornecedor,
      categoria: info.categoria,
      valor: t.valor,
      vencimento: vencimentoEstimado,
      pagoEm: pagoNaFatura,
      status: pagoNaFatura ? "paid" : "pending",
      parcela: p,
      totalParcelas: t.totalParcelas,
      confirmado: info.confirmado,
      origem: `${t.estabelecimento} · compra ${t.data} · fatura ${t.fatura || mesDestaParcela || "—"}`,
    });
  }
}

// ── Conferência das faturas: a soma das parcelas bate com o que foi pago? ───

const conferenciaDeFaturas = [];
for (const f of faturasPagas) {
  const mes = f.data.slice(0, 7);
  const soma = transacoesDeCartao
    .filter((t) => t.cartao === f.cartao && t.mesDaFatura === mes)
    .reduce((a, t) => a + t.valor, 0);
  const credito = creditosDaFatura.get(`${f.cartao}|${mes}`) ?? 0;
  conferenciaDeFaturas.push({
    cartao: f.cartao,
    mes,
    pagoNoExtrato: f.valor,
    somaDasParcelas: soma,
    credito,
    diferenca: soma - credito - f.valor,
    temDetalhe: soma > 0,
  });
}

// ── Cruzamento com o que já existe ──────────────────────────────────────────

const duplicados = [];
const ajustes = [];
const novas = [];

for (const p of propostas) {
  const e = acharExistente(p);
  if (!e) {
    novas.push(p);
    continue;
  }
  e.casou = true;
  duplicados.push({ proposta: p, existente: e });

  // O cruzamento vale mais pelo que CORRIGE do que pelo que descarta.
  if (p.status === "paid" && e.status !== "paid") {
    ajustes.push({
      id: e.id,
      o_que: "marcar como paga",
      descricao: e.descricao,
      fornecedor: e.fornecedor,
      valor: e.valor,
      de: `${e.status}${e.pagoEm ? ` (pago em ${e.pagoEm})` : ""}`,
      para: `paid, pago em ${p.pagoEm}`,
      prova: p.origem,
    });
  } else if (p.pagoEm && e.pagoEm && p.pagoEm !== e.pagoEm) {
    ajustes.push({
      id: e.id,
      o_que: "corrigir a data de pagamento",
      descricao: e.descricao,
      fornecedor: e.fornecedor,
      valor: e.valor,
      de: e.pagoEm,
      para: p.pagoEm,
      prova: p.origem,
    });
  }
  if (p.vencimento && e.vencimento && diasEntre(p.vencimento, e.vencimento) > 20) {
    ajustes.push({
      id: e.id,
      o_que: "conferir o vencimento",
      descricao: e.descricao,
      fornecedor: e.fornecedor,
      valor: e.valor,
      de: e.vencimento,
      para: p.vencimento,
      prova: p.origem,
    });
  }
  const fn = normalizar(p.fornecedor);
  const fe = normalizar(e.fornecedor);
  if (fn && fe && fn !== fe && !fe.includes(fn.split(" ")[0]) && !fn.includes(fe.split(" ")[0])) {
    ajustes.push({
      id: e.id,
      o_que: "alinhar o nome do fornecedor",
      descricao: e.descricao,
      fornecedor: e.fornecedor,
      valor: e.valor,
      de: e.fornecedor,
      para: p.fornecedor,
      prova: "é assim que o nome sai no extrato/fatura",
    });
  }
}

/** Até quando as fontes alcançam. Conta a pagar que vence depois disto não
 *  tem como ter lastro: ela ainda não aconteceu. */
const ultimaDataDasFontes =
  [...movimentos.map((m) => m.data), ...transacoesDeCartao.map((t) => t.data)].sort().at(-1) ??
  null;

/** Lançamento que existe no sistema e não tem lastro em nenhuma das fontes.
 *  Pode ser despesa real que não passou por este banco — ou lançamento
 *  duplicado. Quem decide é uma pessoa.
 *
 *  Parcela futura ainda `pending` fica de fora: listá-la como "sem lastro"
 *  enche a tabela de linhas corretas e esconde as poucas que são problema. */
const semLastro = existentes.filter(
  (e) =>
    !e.casou &&
    !(
      e.status !== "paid" &&
      e.vencimento &&
      ultimaDataDasFontes &&
      e.vencimento > ultimaDataDasFontes
    ),
);

for (const d of diferencasDeValor) decidir.push(d);

// ── Os arquivos ─────────────────────────────────────────────────────────────

mkdirSync(dirSaida, { recursive: true });

const csv = (linhas) =>
  linhas
    .map((l) =>
      l
        .map((c) => {
          const s = c === null || c === undefined ? "" : String(c);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n") + "\n";

const num = (v) => (v === null || v === undefined ? "" : v.toFixed(2));

writeFileSync(
  join(dirSaida, "despesas-novas.csv"),
  csv([
    [
      "fonte",
      "data_da_compra",
      "descricao",
      "fornecedor",
      "categoria",
      "valor",
      "vencimento",
      "pago_em",
      "status",
      "categoria_confirmada",
      "origem",
    ],
    ...novas
      .slice()
      .sort((a, b) => (a.vencimento ?? "").localeCompare(b.vencimento ?? ""))
      .map((p) => [
        p.fonte,
        p.data,
        p.descricao,
        p.fornecedor,
        p.categoria,
        num(p.valor),
        p.vencimento,
        p.pagoEm ?? "",
        p.status,
        p.confirmado ? "sim" : "SUPOSIÇÃO",
        p.origem,
      ]),
  ]),
);

writeFileSync(
  join(dirSaida, "ajustes-no-que-existe.csv"),
  csv([
    ["id", "o_que_fazer", "descricao", "fornecedor", "valor", "de", "para", "prova"],
    ...ajustes.map((a) => [
      a.id,
      a.o_que,
      a.descricao,
      a.fornecedor,
      num(a.valor),
      a.de,
      a.para,
      a.prova,
    ]),
  ]),
);

writeFileSync(
  join(dirSaida, "a-decidir.csv"),
  csv([
    ["data", "de_onde_vem", "valor", "por_que_parei", "ESCOLHA_AQUI_categoria"],
    ...decidir
      .slice()
      .sort((a, b) => a.valor - b.valor)
      .map((d) => [d.data, d.descricao, num(d.valor), d.motivo, ""]),
  ]),
);

writeFileSync(
  join(dirSaida, "fora-do-financeiro.csv"),
  csv([
    ["data", "o_que_o_banco_escreveu", "valor", "por_que_fica_fora"],
    ...fora.map((f) => [f.data, f.descricao, num(f.valor), f.motivo]),
  ]),
);

writeFileSync(
  join(dirSaida, "entradas-a-conferir.csv"),
  csv([
    ["data", "o_que_o_banco_escreveu", "valor", "observacao"],
    ...entradas.map((e) => [e.data, e.descricao, num(e.valor), e.motivo]),
  ]),
);

// ── O relatório que uma pessoa lê ───────────────────────────────────────────

const somaDe = (lista, campo = "valor") => lista.reduce((a, x) => a + (x[campo] ?? 0), 0);
const pagas = novas.filter((p) => p.status === "paid");
const futuras = novas.filter((p) => p.status !== "paid");

const r = [];
r.push("# Importação do financeiro — proposta");
r.push("");
r.push("Fontes lidas:");
for (const [rotulo, caminho] of [
  ["extrato", caminhoExtrato],
  ["fatura do Inter", caminhoInter],
  ["fatura do Mercado Pago", caminhoMp],
  ["o que já está no sistema", caminhoExistentes],
]) {
  if (caminho) r.push(`- ${rotulo}: \`${basename(caminho)}\``);
}
r.push("");
r.push(`Gerado em: ${new Date().toISOString().slice(0, 10)}`);
r.push("");
r.push(
  "**Nada foi gravado no banco.** Isto e os CSVs ao lado são uma proposta.",
  "A ordem de leitura é: primeiro a conferência das faturas (é ela que diz se as",
  "fontes estão completas), depois os ajustes, e só então as despesas novas.",
);
r.push("");

r.push("## Resumo");
r.push("");
r.push("| | |");
r.push("|---|---:|");
r.push(`| Movimentações lidas no extrato | ${movimentos.length} |`);
r.push(`| Transações lidas nas faturas | ${transacoesDeCartao.length} |`);
r.push(`| **Despesas novas a lançar** | **${novas.length}** |`);
r.push(`| ...já pagas | ${pagas.length} — ${money(somaDe(pagas))} |`);
r.push(`| ...a vencer (parcela de cartão) | ${futuras.length} — ${money(somaDe(futuras))} |`);
r.push(`| ...com categoria que é suposição minha | ${novas.filter((p) => !p.confirmado).length} |`);
r.push(`| Já estavam no sistema (não duplicar) | ${duplicados.length} |`);
r.push(`| Correções no que já existe | **${ajustes.length}** |`);
r.push(`| Lançamentos do sistema sem lastro nas fontes | ${semLastro.length} |`);
r.push(
  `| Fora do financeiro (outro negócio, aporte, CDB, fatura) | ${fora.length} — ${money(somaDe(fora))} |`,
);
r.push(`| Entradas a conferir | ${entradas.length} — ${money(somaDe(entradas))} |`);
r.push(`| **Esperando você dizer o que é** | **${decidir.length}** |`);
r.push("");

if (conferenciaDeFaturas.length) {
  r.push("## Conferência das faturas de cartão");
  r.push("");
  r.push(
    "A soma das parcelas de uma fatura tem de dar exatamente o que saiu do caixa para",
    "pagá-la. Quando dá, as duas fontes estão completas e as parcelas podem ser lançadas",
    "com segurança. Quando não dá, está faltando fatura — e lançar assim deixa buraco.",
  );
  r.push("");
  r.push(
    "| Cartão | Fatura | Pago no extrato | Soma das parcelas | Crédito na fatura | Diferença |",
  );
  r.push("|---|---|---:|---:|---:|---:|");
  for (const c of conferenciaDeFaturas.sort((a, b) => a.mes.localeCompare(b.mes))) {
    const estado = !c.temDetalhe
      ? "— fatura não informada —"
      : Math.abs(c.diferenca) < 0.011
        ? "bate"
        : `${c.diferenca >= 0 ? "+" : ""}${brl(c.diferenca)}`;
    r.push(
      `| ${c.cartao} | ${c.mes} | ${money(c.pagoNoExtrato)} | ${c.temDetalhe ? money(c.somaDasParcelas) : "—"} | ${c.credito ? money(-c.credito) : "—"} | ${estado} |`,
    );
  }
  r.push("");
  const semDetalhe = conferenciaDeFaturas.filter((c) => !c.temDetalhe);
  if (semDetalhe.length) {
    r.push(
      `⚠️ ${semDetalhe.length} fatura(s) foram pagas mas o detalhe não foi informado ` +
        `(${money(somaDe(semDetalhe, "pagoNoExtrato"))} no total). As compras dentro delas ` +
        "não entram nesta proposta — é despesa real que vai continuar faltando no sistema.",
    );
    r.push("");
  }
}

if (ajustes.length) {
  r.push("## Correções no que já está lançado");
  r.push("");
  r.push(
    "São o que o cruzamento descobriu: parcela que está `pending` no sistema e cuja fatura",
    "já foi paga, data errada, nome de fornecedor diferente do que sai no banco. Corrigir",
    "isto vale mais que lançar o que falta — é despesa que o sistema já tem e mostra errado.",
  );
  r.push("");
  r.push("| O que fazer | Lançamento | Valor | De | Para |");
  r.push("|---|---|---:|---|---|");
  for (const a of ajustes) {
    r.push(
      `| ${a.o_que} | ${a.descricao} · ${a.fornecedor} | ${money(a.valor)} | ${a.de} | ${a.para} |`,
    );
  }
  r.push("");
}

if (decidir.length) {
  r.push("## Esperando você dizer o que é");
  r.push("");
  r.push("| Data | De onde vem | Valor | Por que eu parei |");
  r.push("|---|---|---:|---|");
  for (const d of decidir.slice().sort((a, b) => a.valor - b.valor)) {
    r.push(`| ${d.data} | ${d.descricao} | ${money(d.valor)} | ${d.motivo} |`);
  }
  r.push("");
}

const suposicoes = novas.filter((p) => !p.confirmado);
if (suposicoes.length) {
  r.push("## Categorias que são suposição minha");
  r.push("");
  r.push(
    "Deduzi pelo nome do estabelecimento. Categoria errada aqui não é só rótulo: é custo",
    "errado no rateio por hora de cadeira, e preço errado no procedimento que a usa.",
  );
  r.push("");
  const porEstab = new Map();
  for (const p of suposicoes) {
    const k = `${p.fornecedor}|${p.categoria}`;
    const g = porEstab.get(k) ?? {
      fornecedor: p.fornecedor,
      categoria: p.categoria,
      n: 0,
      total: 0,
      descricao: p.descricao,
    };
    g.n++;
    g.total += p.valor;
    porEstab.set(k, g);
  }
  r.push("| Fornecedor | O que eu supus | Parcelas | Total |");
  r.push("|---|---|---:|---:|");
  for (const g of [...porEstab.values()].sort((a, b) => b.total - a.total)) {
    r.push(`| ${g.fornecedor} | ${g.categoria} | ${g.n} | ${money(g.total)} |`);
  }
  r.push("");
}

r.push("## Despesas novas, por categoria");
r.push("");
const porCategoria = new Map();
for (const p of novas) {
  const g = porCategoria.get(p.categoria) ?? { n: 0, pago: 0, aVencer: 0 };
  g.n++;
  if (p.status === "paid") g.pago += p.valor;
  else g.aVencer += p.valor;
  porCategoria.set(p.categoria, g);
}
r.push("| Categoria | Lançamentos | Já pago | A vencer | Total |");
r.push("|---|---:|---:|---:|---:|");
for (const [cat, g] of [...porCategoria.entries()].sort(
  (a, b) => b[1].pago + b[1].aVencer - (a[1].pago + a[1].aVencer),
)) {
  r.push(
    `| ${cat} | ${g.n} | ${money(g.pago)} | ${money(g.aVencer)} | **${money(g.pago + g.aVencer)}** |`,
  );
}
r.push("");

r.push("## Despesas novas, por mês de competência");
r.push("");
r.push(
  "É esta tabela que alimenta o custo por hora de cadeira. Mês vazio aqui é mês em que a",
  "precificação vai mentir para o lado barato.",
);
r.push("");
const porMes = new Map();
for (const p of novas) {
  const mes = (p.pagoEm ?? p.vencimento ?? p.data).slice(0, 7);
  const g = porMes.get(mes) ?? { n: 0, total: 0 };
  g.n++;
  g.total += p.valor;
  porMes.set(mes, g);
}
r.push("| Mês | Lançamentos | Total |");
r.push("|---|---:|---:|");
for (const [mes, g] of [...porMes.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  r.push(`| ${mes} | ${g.n} | ${money(g.total)} |`);
}
r.push("");

if (semLastro.length) {
  r.push("## Lançamentos do sistema que nenhuma fonte confirma");
  r.push("");
  r.push(
    "Não quer dizer que estão errados: pode ser despesa paga por outro banco, em dinheiro,",
    "ou parcela futura que ainda não entrou em fatura. Mas é aqui que lançamento duplicado",
    "ou valor digitado errado aparece.",
  );
  r.push("");
  r.push("| Lançamento | Fornecedor | Valor | Vencimento | Status |");
  r.push("|---|---|---:|---|---|");
  for (const e of semLastro
    .slice()
    .sort((a, b) => (a.vencimento ?? "").localeCompare(b.vencimento ?? ""))) {
    r.push(
      `| ${e.descricao} | ${e.fornecedor} | ${money(e.valor)} | ${e.vencimento ?? "—"} | ${e.status} |`,
    );
  }
  r.push("");
}

if (entradas.length) {
  r.push("## Entradas (dinheiro que entrou)");
  r.push("");
  r.push(
    "Nenhuma delas vira receita por este script. A receita do consultório nasce de consulta",
    "realizada com valor cobrado — lançar entrada de banco como receita contaria o",
    "faturamento duas vezes e estragaria o retorno dos anúncios.",
  );
  r.push("");
  r.push("| Data | O que o banco escreveu | Valor |");
  r.push("|---|---|---:|");
  for (const e of entradas.slice().sort((a, b) => b.valor - a.valor)) {
    r.push(`| ${e.data} | ${e.descricao} | ${money(e.valor)} |`);
  }
  r.push("");
}

r.push("## O que fazer com este resultado");
r.push("");
r.push("1. Conferir a tabela das faturas. Se alguma não bate, falta fatura — pare e junte.");
r.push("2. Aplicar `ajustes-no-que-existe.csv`: é correção no que o sistema já mostra errado.");
r.push("3. Preencher `ESCOLHA_AQUI_categoria` em `a-decidir.csv`.");
r.push("4. Conferir as categorias marcadas `SUPOSIÇÃO` em `despesas-novas.csv`.");
r.push("5. Só então gravar — pela migration de dados idempotente, a partir dos CSVs revisados.");
r.push("");

writeFileSync(join(dirSaida, "RELATORIO.md"), r.join("\n"));

// ── O que aparece no terminal ───────────────────────────────────────────────

console.log(`Proposta gerada em ${dirSaida}/`);
console.log(`  despesas-novas.csv          ${novas.length} lançamentos — ${money(somaDe(novas))}`);
console.log(`  ajustes-no-que-existe.csv   ${ajustes.length} correções`);
console.log(`  a-decidir.csv               ${decidir.length} esperando você`);
console.log(`  fora-do-financeiro.csv      ${fora.length} — ${money(somaDe(fora))}`);
console.log(`  entradas-a-conferir.csv     ${entradas.length} — ${money(somaDe(entradas))}`);
console.log(
  `  RELATORIO.md                ${duplicados.length} já existiam, ${semLastro.length} sem lastro`,
);
for (const c of conferenciaDeFaturas) {
  if (!c.temDetalhe) continue;
  const ok = Math.abs(c.diferenca) < 0.011;
  console.log(
    `  fatura ${c.cartao} ${c.mes}: ${ok ? "bate" : `DIFERENÇA de ${brl(c.diferenca)}`} (${money(c.pagoNoExtrato)})`,
  );
}
for (const a of avisos) console.log(`\n⚠️  ${a}`);
console.log("\nNada foi gravado no banco.");
