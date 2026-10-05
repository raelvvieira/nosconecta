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
 *     [--postura clinica|pessoal|recebimento] \
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
import { createHash } from "node:crypto";
import { basename, join } from "node:path";

// ── Argumentos ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function arg(nome, padrao = null) {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : padrao;
}

const caminhoExtrato = arg("extrato");
/**
 * A postura da conta do `--extrato`. Ver `POSTURA_DA_CONTA`.
 *
 * O padrão é `pessoal` porque hoje TODAS as contas são pessoais — nenhuma foi
 * aberta para o consultório. Errar para o lado de excluir deixa despesa de
 * fora, o que aparece na conferência; errar para o lado de incluir enfia gasto
 * pessoal no custo por hora de cadeira, onde ninguém vai procurar.
 */
const posturaDoExtrato = arg("postura", "pessoal");
const caminhoInter = arg("fatura-inter");
const caminhoMp = arg("fatura-mp");
const caminhoExistentes = arg("existentes");
const caminhoCartoes = arg("cartoes");
const caminhoContexto = arg("contexto");
const caminhoSql = arg("sql");
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
  ["--cartoes", caminhoCartoes],
  ["--contexto", caminhoContexto],
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

/**
 * Um UUID estável a partir de um texto (UUID v5-ish, sem a cerimônia do
 * namespace). Serve para `purchase_group_id`: o grupo precisa ser o mesmo em
 * toda geração, senão a migration muda de conteúdo sem mudar de significado.
 */
function uuidDeterministico(texto) {
  const h = createHash("sha1").update(texto).digest("hex");
  // Versão 5 e variante RFC 4122, para o valor ser um UUID válido de verdade.
  const v = (parseInt(h[12], 16) & 0x0) | 0x5;
  const r = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${v}${h.slice(13, 16)}-${r}${h.slice(17, 20)}-${h.slice(20, 32)}`;
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

  // ── Pessoal, conferido com o dono em 05/10 ───────────────────────────────
  //
  // Estes eu havia classificado como do consultório e estava errado. Bar e
  // mercado entraram como "Alimentação" da clínica porque saíram da conta do
  // Inter e eu tratava aquela conta como se fosse da empresa; o seguro é do
  // cartão do Rael, e a linha de telefone e o software são dele também.
  //
  // Ficam nomeados — e não só cobertos pela postura `pessoal` — porque conta
  // pessoal também paga coisa da clínica, e aí a postura não basta: alguém vai
  // olhar linha por linha e precisa ver que estas já foram decididas.
  [/BEM A JEITO/i, "FORA", "pessoal (bar/restaurante)", null],
  [/MUNDIALMIX/i, "FORA", "pessoal (mercado)", null],
  [/^CLARO$|CLARO S\.?A/i, "FORA", "linha pessoal", null],
  [/ROOTE TECNOLOGIA/i, "FORA", "software pessoal", null],

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
];

/**
 * A POSTURA DE LEITURA DE CADA CONTA.
 *
 * Esta é a regra mais importante deste script, e ela não é a mesma para todas
 * as contas. Aplicar a postura errada é o jeito mais fácil de encher o
 * financeiro de gasto pessoal — ou de perder despesa real do consultório.
 *
 *   `pessoal`  — NADA é do consultório, SÓ o que foi identificado um por um.
 *
 *   `recebimento` — a conta onde o consultório RECEBE (Stone: cartão e pix).
 *                As entradas não viram receita aqui, porque receita tem um dono
 *                só, a agenda. As saídas são do consultório.
 *
 *   `clinica`  — tudo que sai é do consultório, MENOS os nomes conhecidos de
 *                fora. **Hoje nenhuma conta é assim**, e a opção fica aqui para
 *                o dia em que o consultório abrir conta no CNPJ.
 *
 * ── O fato que decide isto ─────────────────────────────────────────────────
 *
 * O consultório NÃO TEM CONTA PRÓPRIA. Existem duas contas pessoais do Rael
 * (Inter e Nubank), uma da Mariane (Nubank) e a Stone, que é dela e serve para
 * receber. Os dois sócios pagaram custo da clínica das próprias contas.
 *
 * Por isso a postura padrão é `pessoal`, e não `clinica`. A primeira versão
 * deste script leu o extrato do Inter como conta da clínica porque a conta se
 * chamava "Banco Inter" e o aluguel, o condomínio, a luz e a cadeira saíam de
 * lá. Saem mesmo — e junto saíram um bar e um mercado, que entraram no
 * financeiro como "Alimentação" do consultório. Foram R$ 355,10 de gasto
 * pessoal classificado como da clínica. Pouco, e só pouco por sorte: a conta
 * de uma pessoa tem gasto de pessoa, e o padrão tem de ser excluir.
 *
 * A diferença não é de grau, é de sinal. Numa conta `clinica` o silêncio
 * significa "é da clínica"; numa `pessoal`, significa "não é".
 */
export const POSTURA_DA_CONTA = {
  "Inter Rael (pessoal)": "pessoal",
  "Nubank Rael (pessoal)": "pessoal",
  "Nubank Mariane (pessoal)": "pessoal",
  "Mercado Pago Rael (pessoal)": "pessoal",
  "Stone — recebimentos do consultório": "recebimento",
};

/**
 * O nome com que cada fornecedor fica gravado.
 *
 * Existe porque o extrato escreve em CAIXA ALTA e sem acento
 * ("LAGE MATERIAIS DE CONSTRUCAO"), e a clínica digitou com acento
 * ("Lage Materiais de Construção"). Sem canonizar, o mesmo fornecedor aparece
 * duas vezes no relatório por fornecedor, com o gasto dividido entre as duas
 * grafias — foi o que aconteceu com a Lage, 7 linhas de um lado e 2 do outro.
 *
 * As três últimas linhas não são grafia, são identidade: a imobiliária que a
 * clínica chamava de "Pirâmides" assina AZEVEDO FILHOS no banco, o condomínio
 * lançado como "BR Condos" é a OPPORTUNITA, e o gesseiro "Jonathan Ariel" é o
 * JONATHAN MOLINO. São a mesma pessoa jurídica com dois nomes no sistema.
 */
const NOME_DO_FORNECEDOR = [
  [/^LAGE MATERIAIS/i, "Lage Materiais de Construção"],
  [/^CASSOL/i, "Cassol Centerlar"],
  [/^ATACADAO DAS TINTAS/i, "Atacadão das Tintas"],
  [/^LEROY MERLIN/i, "Leroy Merlin"],
  [/^ZONA NOVA/i, "Zona Nova Center"],
  [/^GUARDIAN/i, "Guardian Segurança"],
  [/^BEM A JEITO/i, "Bem a Jeito"],
  [/^CASAS DO CANO/i, "Casas do Cano"],
  [/^MUNDIALMIX/i, "Mundialmix"],
  [/^JOAO DE BARRO/i, "João de Barro"],
  [/^PEDRA BRANCA/i, "Pedra Branca"],
  [/^CASAS? DA AGUA|^Casa Da Água/i, "Casas da Água"],
  [/^SUJINHO/i, "Sujinho"],
  [/^PIR[AÂ]MIDES|^AZEVEDO FILHOS/i, "Azevedo Filhos Neg Imob"],
  [/^BR CONDOS|^OPPORTUNITA/i, "Opportunita Empresarial"],
  [/^JONATHAN/i, "Jonathan Molino"],
];

/** O nome canônico, ou o que veio se nenhum padrão casar. */
function nomeDoFornecedor(nome) {
  const texto = String(nome ?? "").trim();
  for (const [padrao, canonico] of NOME_DO_FORNECEDOR) {
    if (padrao.test(texto)) return canonico;
  }
  return texto;
}

/**
 * `postura` é a da conta de onde veio o movimento (ver `POSTURA_DA_CONTA`).
 *
 * O que ela muda é só o PADRÃO, quando nenhuma regra casou: numa conta da
 * clínica, o não reconhecido vai para "decidir" e espera uma resposta; numa
 * conta pessoal, ele fica de fora sem perguntar, porque perguntar sobre cada
 * compra pessoal da sócia é ruído e a resposta é sempre a mesma.
 */
function classificarMovimento(descricao, postura = "pessoal") {
  for (const [padrao, destino, motivo, fornecedor, rotulo] of REGRAS_DO_EXTRATO) {
    if (padrao.test(descricao)) return { destino, motivo, fornecedor, rotulo: rotulo ?? null };
  }
  if (postura === "pessoal") {
    return {
      destino: "FORA",
      motivo: "conta pessoal — só entra o que foi identificado",
      fornecedor: null,
      rotulo: null,
    };
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
  // O seguro é do CARTÃO do Rael, não do consultório. Continua aparecendo na
  // soma da fatura lá no banco — a fatura é dele —, mas não entra como custo da
  // clínica. `categoria: null` manda a linha para "a decidir" em vez de entrar
  // calada; e como ela já está nomeada em `FORA_DO_CARTAO`, nem chega lá.
  [/SEGURO CARTAO/i, null, "Banco Inter", "Seguro do cartão (pessoal)", false],
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

/**
 * Estabelecimentos de cartão que NÃO são do consultório, conferidos com o dono.
 *
 * Separado de `ESTABELECIMENTOS` de propósito: lá o que não casa vira "a
 * decidir" e volta a perguntar todo mês. O que já foi decidido como pessoal
 * precisa de um lugar onde fique decidido.
 */
const FORA_DO_CARTAO = [[/SEGURO CARTAO/i, "seguro do cartão do Rael, não do consultório"]];

function foraDoCartao(estab) {
  for (const [padrao, motivo] of FORA_DO_CARTAO) {
    if (padrao.test(estab)) return motivo;
  }
  return null;
}

function classificarEstabelecimento(estab) {
  for (const [padrao, categoria, fornecedor, descricao, confirmado] of ESTABELECIMENTOS) {
    if (padrao.test(estab)) {
      return { categoria, fornecedor: nomeDoFornecedor(fornecedor), descricao, confirmado };
    }
  }
  return {
    categoria: null,
    fornecedor: nomeDoFornecedor(estab),
    descricao: estab,
    confirmado: false,
  };
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
  const linhasDeCredito = [];
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
      if (valor !== null) {
        creditos += valor;
        const mesCredito = Number(m[2]);
        linhasDeCredito.push({
          data: iso(mesCredito > mesVenc ? anoVenc - 1 : anoVenc, mesCredito, Number(m[1])),
          descricao,
          valor,
        });
      }
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
  return {
    transacoes,
    vencimento,
    creditos,
    linhasDeCredito,
    total: tot ? dinheiro(tot[1]) : null,
  };
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
  const { destino, motivo, fornecedor, rotulo } = classificarMovimento(
    m.descricao,
    posturaDoExtrato,
  );
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
    descricao: rotulo ?? nomeDoFornecedor(nome),
    fornecedor: nomeDoFornecedor(nome),
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
  : { transacoes: [], vencimento: null, creditos: 0, linhasDeCredito: [], total: null };
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
 * O cadastro dos cartões, para o ciclo de fatura sair da configuração real e
 * não de chute. Sem `--cartoes`, o script continua gerando o relatório e para
 * antes do SQL — porque sem o dia de fechamento não se sabe em qual fatura uma
 * parcela cai.
 */
const cartoes = new Map();
if (caminhoCartoes) {
  for (const r of lerCsv(caminhoCartoes)) {
    cartoes.set(r.apelido, {
      id: r.id,
      nome: r.nome,
      diaDeFechamento: Number(r.fechamento),
      diaDeVencimento: Number(r.vencimento),
      accountId: r.account_id,
      unitId: r.unit_id,
    });
  }
}

const contexto = {};
if (caminhoContexto) {
  for (const r of lerCsv(caminhoContexto)) contexto[r.chave] = r.valor;
}

/** Dia aparado ao último do mês: dia 31 em fevereiro não existe. */
function diaNoMes(mesIso, dia) {
  const [ano, mes] = mesIso.split("-").map(Number);
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return iso(ano, mes, Math.min(dia, ultimo));
}

/**
 * Fechamento e vencimento da fatura de um mês. O mês é o do RÓTULO da fatura
 * ("Setembro/2026"), que é também o mês do vencimento.
 *
 * Quando o dia de vencimento é menor ou igual ao de fechamento, o vencimento
 * cai no mês seguinte ao fechamento — fecha dia 25 e vence dia 5 é o caso
 * comum, e tratá-los como o mesmo mês poria o pagamento ANTES do fechamento.
 */
function cicloDaFatura(mesIso, cartao) {
  const vencimento = diaNoMes(mesIso, cartao.diaDeVencimento);
  const mesDoFechamento =
    cartao.diaDeVencimento <= cartao.diaDeFechamento
      ? somarMeses(`${mesIso}-01`, -1).slice(0, 7)
      : mesIso;
  return { fechamento: diaNoMes(mesDoFechamento, cartao.diaDeFechamento), vencimento };
}

/**
 * Em que dia a fatura de um mês foi de fato quitada.
 *
 * Casar pelo MÊS do pagamento funcionou nestes seis meses e é frágil: fatura
 * que vence dia 30 e é paga no dia 2 do mês seguinte cairia na fatura errada.
 * Então o casamento é pela PROXIMIDADE ao vencimento, com teto de 20 dias.
 */
function pagamentoDaFatura(cartao, vencimento) {
  let melhor = null;
  for (const f of faturasPagas) {
    if (f.cartao !== cartao) continue;
    const dias = Math.abs((Date.parse(f.data) - Date.parse(vencimento)) / 86400000);
    if (dias > 20) continue;
    if (!melhor || dias < melhor.dias) melhor = { data: f.data, dias };
  }
  return melhor?.data ?? null;
}

for (const t of transacoesDeCartao) {
  t.mesDaFatura = t.cartao === "Inter" ? mesDaFatura(t.fatura) : t.fatura;
}

/**
 * Uma COMPRA, e não uma linha de fatura: as parcelas da mesma compra aparecem
 * em faturas diferentes e precisam ser vistas juntas.
 */
const grupos = new Map();
for (const t of transacoesDeCartao) {
  const chave = `${t.cartao}|${normalizar(t.estabelecimento)}|${t.data}|${t.totalParcelas}`;
  const g = grupos.get(chave) ?? new Map(); // parcela → linhas com esse número
  const lista = g.get(t.parcela) ?? [];
  lista.push(t);
  g.set(t.parcela, lista);
  grupos.set(chave, g);
}

/**
 * O mesmo número de parcela aparecendo DUAS vezes no grupo não é leitura
 * repetida: são duas compras distintas na mesma loja, no mesmo dia, no mesmo
 * número de vezes. Aconteceu duas vezes aqui — "IG*CredAluga" de R$ 196,00 e
 * de R$ 180,00 em 13/04, e duas compras no Mercado Livre em 20/08, uma de
 * R$ 11,23 e outra de R$ 104,75. Guardar uma por número de parcela fazia a
 * segunda desaparecer, e a conferência da fatura acusava a falta.
 *
 * Então a i-ésima ocorrência de cada número de parcela pertence à i-ésima
 * compra do grupo.
 */
const compras = [];
for (const [chave, g] of grupos) {
  const [cartao] = chave.split("|");
  const quantasCompras = Math.max(...[...g.values()].map((l) => l.length));
  for (let i = 0; i < quantasCompras; i++) {
    const linhas = new Map();
    let vencimentoConhecido = null;
    for (const [parcela, lista] of g) {
      const linha = lista[i];
      if (!linha) continue;
      linhas.set(parcela, linha);
      if (linha.vencimento && !vencimentoConhecido) vencimentoConhecido = linha.vencimento;
    }
    if (!linhas.size) continue;
    const alguma = [...linhas.values()][0];
    compras.push({
      cartao,
      estabelecimento: alguma.estabelecimento,
      data: alguma.data,
      totalParcelas: alguma.totalParcelas,
      ordem: i,
      // Id DETERMINÍSTICO, derivado da chave da compra: rodar o script duas
      // vezes gera o mesmo id, e a migration continua sendo o mesmo arquivo.
      // Com `randomUUID` cada geração produziria um diff inteiro.
      grupo: uuidDeterministico(`${chave}|${i}`),
      vencimentoConhecido,
      linhas,
    });
  }
}

for (const c of compras) {
  const umaLinha = [...c.linhas.values()][0];

  const motivoDeFora = foraDoCartao(c.estabelecimento);
  if (motivoDeFora) {
    fora.push({
      data: c.data,
      descricao: `${c.cartao} · ${c.estabelecimento}`,
      valor: -umaLinha.valor * c.totalParcelas,
      nome: c.estabelecimento,
      motivo: motivoDeFora,
    });
    continue;
  }

  const info = classificarEstabelecimento(c.estabelecimento);
  if (!info.categoria) {
    decidir.push({
      data: c.data,
      descricao: `${c.cartao} · ${c.estabelecimento}`,
      valor: -umaLinha.valor * c.totalParcelas,
      nome: c.estabelecimento,
      motivo: "estabelecimento de cartão que não sei categorizar",
    });
    continue;
  }

  const conhecidas = [...c.linhas.keys()].sort((a, b) => a - b);

  for (let p = 1; p <= c.totalParcelas; p++) {
    const propria = c.linhas.get(p);

    // Quando a parcela ESTÁ na fatura, é ela que manda — valor e mês. Estimar
    // a partir da parcela 1 parecia inofensivo e não era: a Mercado Livre
    // cobrou as três parcelas de uma compra na MESMA fatura de setembro, e a
    // estimativa as espalhou por setembro, outubro e novembro; a IR Tintas
    // tem parcela 1 de R$ 362,97 e parcela 2 de R$ 362,89. Nos dois casos a
    // conferência da fatura deixava de fechar, por R$ 44,33 e por R$ 0,08.
    // Só o que NÃO veio em fatura nenhuma é que se estima.
    const referencia =
      propria ??
      c.linhas.get(
        conhecidas.reduce((melhor, k) => (Math.abs(k - p) < Math.abs(melhor - p) ? k : melhor)),
      );
    const passos = propria
      ? 0
      : p - [...c.linhas.keys()].find((k) => c.linhas.get(k) === referencia);

    const mesDestaParcela = referencia.mesDaFatura
      ? somarMeses(`${referencia.mesDaFatura}-01`, passos).slice(0, 7)
      : null;

    // O ciclo sai da configuração do cartão quando ela foi informada. É o que
    // faz a parcela cair na MESMA fatura que o sistema calcularia sozinho —
    // sem isso, a importação criaria faturas paralelas às do app.
    const config = cartoes.get(c.cartao);
    const ciclo = config && mesDestaParcela ? cicloDaFatura(mesDestaParcela, config) : null;

    const pagoNaFatura = ciclo
      ? pagamentoDaFatura(c.cartao, ciclo.vencimento)
      : mesDestaParcela
        ? (faturasPagas.find((f) => f.cartao === c.cartao && f.data.slice(0, 7) === mesDestaParcela)
            ?.data ?? null)
        : null;

    const vencimento =
      ciclo?.vencimento ??
      pagoNaFatura ??
      (c.vencimentoConhecido
        ? somarMeses(c.vencimentoConhecido, passos)
        : mesDestaParcela
          ? `${mesDestaParcela}-15`
          : c.data);

    propostas.push({
      fonte: `cartão ${c.cartao}`,
      data: c.data,
      descricao:
        c.totalParcelas > 1 ? `${info.descricao} (${p}/${c.totalParcelas})` : info.descricao,
      fornecedor: info.fornecedor,
      categoria: info.categoria,
      valor: referencia.valor,
      vencimento,
      pagoEm: pagoNaFatura,
      status: pagoNaFatura ? "paid" : "pending",
      parcela: p,
      totalParcelas: c.totalParcelas,
      confirmado: info.confirmado,
      estimada: !propria,
      cartao: c.cartao,
      mesDaFatura: mesDestaParcela,
      fechamentoDaFatura: ciclo?.fechamento ?? null,
      vencimentoDaFatura: ciclo?.vencimento ?? null,
      grupoDaCompra: c.grupo,
      chave: `${c.cartao}|${normalizar(c.estabelecimento)}|${c.data}|${c.totalParcelas}|${c.ordem}|${p}`,
      origem:
        `${c.estabelecimento} · compra ${c.data} · ` +
        (propria
          ? `fatura ${propria.fatura || mesDestaParcela || "—"}`
          : `parcela ainda não faturada, estimada a partir da ${[...c.linhas.keys()].find((k) => c.linhas.get(k) === referencia)}ª`),
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

// ── Conferência de CAIXA: o dia em que o dinheiro sai ───────────────────────

/**
 * A conferência das faturas prova que as fontes estão completas. Esta prova
 * outra coisa, e é a que responde "mas a saída de caixa não é o dia do
 * pagamento da fatura?": sim, e é esse o dia que cada parcela carrega.
 *
 * Cada parcela tem DUAS datas. O vencimento é quando ela cai (a data da
 * fatura), e o pagamento é o dia em que a fatura foi de fato quitada. Numa
 * leitura por data de pagamento, as treze parcelas da fatura de setembro saem
 * todas em 21/09 e somam exatamente os R$ 5.827,80 que o banco debitou. É por
 * isso que lançar TAMBÉM o pagamento da fatura dobraria o dia.
 *
 * Entram na soma as parcelas novas e as que já estão no sistema e os ajustes
 * mandam marcar como pagas — senão a cadeira do Olsen, que já está lançada,
 * ficaria de fora e toda fatura pareceria menor do que foi.
 */
const caixaPorDia = new Map();
for (const p of novas) {
  if (!p.pagoEm || !p.fonte.startsWith("cartão")) continue;
  caixaPorDia.set(p.pagoEm, (caixaPorDia.get(p.pagoEm) ?? 0) + p.valor);
}
for (const d of duplicados) {
  const { proposta, existente } = d;
  if (!proposta.pagoEm || !proposta.fonte.startsWith("cartão")) continue;
  caixaPorDia.set(proposta.pagoEm, (caixaPorDia.get(proposta.pagoEm) ?? 0) + existente.valor);
}

const conferenciaDeCaixa = faturasPagas
  .map((f) => {
    const lancado = caixaPorDia.get(f.data) ?? 0;
    // O crédito dado dentro da fatura abate o que o banco debitou, mas não é
    // despesa a menos: por isso ele entra aqui e não nas parcelas.
    const credito = creditosDaFatura.get(`${f.cartao}|${f.data.slice(0, 7)}`) ?? 0;
    return {
      data: f.data,
      cartao: f.cartao,
      pagoNoExtrato: f.valor,
      lancado,
      credito,
      diferenca: lancado - credito - f.valor,
      temDetalhe: lancado > 0,
    };
  })
  .sort((a, b) => a.data.localeCompare(b.data));

/** Parcela com data de pagamento que não é dia de fatura nenhuma: é defeito
 *  deste script, não do financeiro da clínica. */
const diasOrfaos = [...caixaPorDia.keys()].filter((d) => !faturasPagas.some((f) => f.data === d));

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

if (conferenciaDeCaixa.some((c) => c.temDetalhe)) {
  r.push("## Conferência de caixa: o dia em que o dinheiro sai");
  r.push("");
  r.push(
    "Cada parcela de cartão carrega DUAS datas: o vencimento, que é o dia da fatura, e o",
    "pagamento, que é o dia em que a fatura foi quitada de verdade. Numa leitura de fluxo",
    "de caixa — por data de pagamento — as parcelas de uma mesma fatura saem todas no",
    "mesmo dia e têm de somar exatamente o que o banco debitou. É por isso que lançar",
    "também o pagamento da fatura dobraria aquele dia.",
  );
  r.push("");
  r.push(
    "| Dia | Cartão | Debitado pelo banco | Soma das parcelas desse dia | Crédito na fatura | |",
  );
  r.push("|---|---|---:|---:|---:|---|");
  for (const c of conferenciaDeCaixa) {
    const estado = !c.temDetalhe
      ? "fatura sem detalhe"
      : Math.abs(c.diferenca) < 0.011
        ? "bate"
        : `**diferença de ${brl(c.diferenca)}**`;
    r.push(
      `| ${c.data} | ${c.cartao} | ${money(c.pagoNoExtrato)} | ${c.temDetalhe ? money(c.lancado) : "—"} | ${c.credito ? money(-c.credito) : "—"} | ${estado} |`,
    );
  }
  r.push("");
  if (diasOrfaos.length) {
    r.push(
      `⚠️ ${diasOrfaos.length} dia(s) com parcela marcada como paga sem fatura correspondente ` +
        `(${diasOrfaos.join(", ")}). Isso é defeito da leitura, não do financeiro.`,
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

// ── A migration de dados ────────────────────────────────────────────────────

/**
 * Gera o SQL que coloca tudo isto no sistema, no modelo que o sistema já tem.
 *
 * ── Por que compra de cartão NÃO é lançada como paga ──────────────────────
 *
 * `financial_transactions` tem três naturezas de linha, e a diferença está em
 * duas colunas (ver o comentário de `src/lib/finance/invoices.functions.ts`):
 *
 *   1. saída de caixa comum — as duas colunas nulas
 *   2. compra no cartão     — `card_invoice_id` preenchido → NÃO é caixa
 *   3. a fatura             — `settles_card_invoice_id` preenchido → É caixa
 *
 * E `soCaixa` (`src/lib/finance/schema-cartao.ts`) tira as compras de cartão de
 * todo indicador de caixa. Então a parcela fica `pending` para sempre e quem
 * recebe a data de pagamento é a FATURA — uma linha, uma vez por mês, somando
 * todas as compras. Marcar a parcela como paga faria o mês contar duas vezes:
 * a parcela e a fatura que a contém.
 *
 * É a mesma coisa que a conferência de caixa deste relatório mostra, dita na
 * forma do banco.
 *
 * ── Por que a ordem dos blocos não é estética ─────────────────────────────
 *
 * O gatilho `card_purchase_freeze` recusa compra nova numa fatura cuja linha de
 * pagamento já está `paid`. Marcar as faturas antes de inserir as parcelas
 * aborta a migration inteira. As faturas são quitadas no ÚLTIMO bloco.
 *
 * ── Idempotência ──────────────────────────────────────────────────────────
 *
 * O Lovable recombina migrations, então uma segunda passada não pode duplicar
 * nada. Cada linha nova carrega `source_type` e `source_id` com a chave da
 * origem (o movimento do extrato, ou a parcela da fatura), e todo INSERT é
 * guardado por `WHERE NOT EXISTS` nessa chave. Os UPDATE são guardados pela
 * condição que eles mesmos destroem.
 */

/** Quantas linhas de dados por statement. Ver o comentário no bloco 3. */
const POR_STATEMENT = 45;

const FONTE_EXTRATO = "importacao-extrato";
const FONTE_FATURA = "importacao-fatura";

function escaparSql(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** O id da categoria pelo NOME, resolvido no banco e não aqui: o uuid de
 *  categoria é diferente em cada instalação, e nome é o que uma pessoa confere. */
function categoriaPorNome(nome, owner) {
  if (!nome) return "null";
  return `(select id from public.financial_categories where owner_id = ${escaparSql(owner)} and name = ${escaparSql(nome)} limit 1)`;
}

function meioDePagamento(origem) {
  if (/^Pix enviado/i.test(origem ?? "")) return "pix";
  if (/Pagamento de Titulo|Pagamento efetuado/i.test(origem ?? "")) return "boleto";
  return null;
}

function gerarSql() {
  const owner = contexto.owner_id;
  const unidade = contexto.unit_id;
  const contaDoExtrato = contexto.conta_do_extrato ?? null;

  const faltando = [];
  if (!owner) faltando.push("owner_id");
  if (!unidade) faltando.push("unit_id");
  if (!cartoes.size) faltando.push("--cartoes");
  if (faltando.length) {
    avisos.push(`SQL não gerado: falta ${faltando.join(", ")}.`);
    return null;
  }

  const L = [];
  const contagem = {
    faturas: 0,
    parcelasNovas: 0,
    parcelasAnexadas: 0,
    despesasDoExtrato: 0,
    faturasSemDetalhe: 0,
    correcoes: 0,
    faturasQuitadas: 0,
  };

  L.push("-- Lançamentos do financeiro: extrato e faturas de cartão de maio a outubro de 2026.");
  L.push("--");
  L.push("-- Gerado por `scripts/importar-financeiro.mjs --sql`. Idempotente: cada linha nova");
  L.push("-- carrega `source_type`/`source_id` com a chave da origem, e todo INSERT é guardado");
  L.push("-- por `WHERE NOT EXISTS` nessa chave.");
  L.push("--");
  L.push("-- A ORDEM DOS BLOCOS É OBRIGATÓRIA: o gatilho `card_purchase_freeze` recusa compra");
  L.push("-- nova em fatura cuja linha de pagamento já esteja `paid`. As faturas são quitadas");
  L.push("-- no último bloco, depois de todas as parcelas entrarem.");
  L.push("");

  // ── 1. As faturas ────────────────────────────────────────────────────────
  const parcelasDeCartao = [...novas, ...duplicados.map((d) => d.proposta)].filter(
    (p) => p.fechamentoDaFatura && cartoes.has(p.cartao),
  );

  const faturas = new Map(); // "Inter|2026-05-13" → {cartao, fechamento, vencimento}
  for (const p of parcelasDeCartao) {
    const k = `${p.cartao}|${p.fechamentoDaFatura}`;
    if (!faturas.has(k)) {
      faturas.set(k, {
        cartao: p.cartao,
        fechamento: p.fechamentoDaFatura,
        vencimento: p.vencimentoDaFatura,
      });
    }
  }

  if (faturas.size) {
    L.push("-- ── 1. As faturas de cada ciclo ────────────────────────────────────────────");
    L.push("--");
    L.push("-- O índice único (card_id, closing_date) é o que faz esta inserção poder rodar");
    L.push("-- de novo sem duplicar — é o mesmo que resolve a corrida de duas compras");
    L.push("-- simultâneas no app.");
    L.push("");
    L.push(
      "insert into public.card_invoices (owner_id, unit_id, card_id, closing_date, due_date) values",
    );
    const linhas = [...faturas.values()]
      .sort((a, b) => a.fechamento.localeCompare(b.fechamento))
      .map((f) => {
        const c = cartoes.get(f.cartao);
        return `  (${escaparSql(owner)}, ${escaparSql(c.unitId)}, ${escaparSql(c.id)}, ${escaparSql(f.fechamento)}, ${escaparSql(f.vencimento)})`;
      });
    L.push(linhas.join(",\n"));
    L.push("on conflict (card_id, closing_date) do nothing;");
    L.push("");
    contagem.faturas = faturas.size;

    // ── 2. A linha de pagamento de cada fatura ────────────────────────────
    L.push("-- ── 2. A linha de pagamento de cada fatura ────────────────────────────────");
    L.push("--");
    L.push("-- Nasce com valor zero: `card_invoice_recalc`, disparado pela primeira compra,");
    L.push("-- a preenche. Sem esta linha o gatilho não teria alvo e a fatura não apareceria");
    L.push("-- em Pagamentos.");
    L.push("--");
    L.push("-- Um statement para todas, e não um por fatura: o rótulo e a conta saem do");
    L.push("-- cadastro do cartão, então vinte e oito linhas seriam vinte e oito cópias da");
    L.push("-- mesma regra — e uma delas divergiria no dia em que o nome do cartão mudasse.");
    L.push("");
    L.push(
      "insert into public.financial_transactions (owner_id, unit_id, type, status, description," +
        " amount, due_date, account_id, payment_method, settles_card_invoice_id, credit_card_id)",
    );
    L.push("select i.owner_id, i.unit_id, 'payable', 'pending',");
    L.push(
      "       'Fatura ' || c.name || ' · ' ||" +
        " (array['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'])[extract(month from i.due_date)::int] ||" +
        " '/' || extract(year from i.due_date)::text,",
    );
    L.push("       0, i.due_date, c.account_id, 'fatura', i.id, i.card_id");
    L.push("  from public.card_invoices i");
    L.push("  join public.credit_cards c on c.id = i.card_id");
    L.push(` where i.owner_id = ${escaparSql(owner)}`);
    L.push(
      "   and not exists (select 1 from public.financial_transactions f where f.settles_card_invoice_id = i.id);",
    );
    L.push("");
  }

  // ── 3. As parcelas novas ─────────────────────────────────────────────────
  const parcelasNovas = novas.filter((p) => p.fechamentoDaFatura && cartoes.has(p.cartao));
  if (parcelasNovas.length) {
    L.push("-- ── 3. As compras no cartão, uma linha por parcela ────────────────────────");
    L.push("--");
    L.push("-- `status` fica `pending` de propósito, mesmo nas parcelas de fatura já paga:");
    L.push("-- compra no cartão não é saída de caixa (`soCaixa` a exclui de todo indicador");
    L.push("-- de caixa). Quem sai do caixa é a fatura, no bloco 9.");
    L.push("--");
    L.push("-- O valor é o da parcela COMO ESTÁ NA FATURA, e não o total dividido por N: a");
    L.push("-- IR Tintas cobra R$ 362,97 na primeira e R$ 362,89 na segunda, e dividir");
    L.push("-- deixaria a fatura sem fechar ao centavo.");
    L.push("--");
    L.push("-- A regra aparece UMA vez e os dados vêm como tabela. Cento e sessenta e nove");
    L.push("-- statements iguais seriam cento e sessenta e nove chances de um divergir, e");
    L.push("-- ninguém revisa isso lendo. Assim o que se revisa é a lista de compras.");
    L.push("--");
    L.push("-- Vencimento, unidade e conta NÃO estão na tabela: saem da fatura e do cadastro");
    L.push("-- do cartão, pela junção. É o que garante que a parcela caia na mesma fatura que");
    L.push("-- o app criaria.");
    L.push("");
    // Em fatias: um `values` de cento e sessenta e nove linhas é um statement que
    // nenhuma ferramenta aceita colar de uma vez, e um erro nele derruba as
    // cento e sessenta e nove. Cada fatia é independente e guardada pela mesma
    // chave, então aplicar uma de cada vez dá o mesmo resultado.
    const ordenadas = parcelasNovas
      .slice()
      .sort(
        (a, b) =>
          a.vencimento.localeCompare(b.vencimento) || a.descricao.localeCompare(b.descricao),
      );

    for (let inicio = 0; inicio < ordenadas.length; inicio += POR_STATEMENT) {
      const fatia = ordenadas.slice(inicio, inicio + POR_STATEMENT);
      L.push(`-- parcelas ${inicio + 1} a ${inicio + fatia.length} de ${ordenadas.length}`);
      L.push(
        "insert into public.financial_transactions (owner_id, unit_id, type, status, description," +
          " amount, due_date, purchase_date, card_invoice_id, credit_card_id, purchase_group_id," +
          " installment_number, installment_total, category_id, supplier_name, account_id," +
          " payment_method, source_type, source_id)",
      );
      L.push(`select ${escaparSql(owner)}, c.unit_id, 'payable', 'pending', v.descricao, v.valor,`);
      L.push("       i.due_date, v.comprada_em, i.id, c.id, v.grupo,");
      L.push("       case when v.parcelas > 1 then v.parcela end,");
      L.push("       case when v.parcelas > 1 then v.parcelas end,");
      L.push(
        `       (select id from public.financial_categories where owner_id = ${escaparSql(owner)} and name = v.categoria limit 1),`,
      );
      L.push(
        "       v.fornecedor, c.account_id, 'credito', " + escaparSql(FONTE_FATURA) + ", v.chave",
      );
      L.push("  from (values");
      L.push(
        fatia
          .map(
            (p) =>
              `    (${escaparSql(p.descricao)}, ${p.valor.toFixed(2)}, ${escaparSql(p.data)}::date,` +
              ` ${p.parcela}, ${p.totalParcelas}, ${escaparSql(p.categoria)}, ${escaparSql(p.fornecedor)},` +
              ` ${escaparSql(p.chave)}, ${escaparSql(cartoes.get(p.cartao).id)}::uuid,` +
              ` ${escaparSql(p.grupoDaCompra)}::uuid, ${escaparSql(p.fechamentoDaFatura)}::date)`,
          )
          .join(",\n"),
      );
      L.push(
        "       ) as v(descricao, valor, comprada_em, parcela, parcelas, categoria, fornecedor," +
          " chave, cartao, grupo, fechamento)",
      );
      L.push("  join public.credit_cards c on c.id = v.cartao");
      L.push(
        "  join public.card_invoices i on i.card_id = v.cartao and i.closing_date = v.fechamento",
      );
      L.push(
        ` where not exists (select 1 from public.financial_transactions f where f.source_type = ${escaparSql(FONTE_FATURA)} and f.source_id = v.chave);`,
      );
      L.push("");
    }
    contagem.parcelasNovas = parcelasNovas.length;
  }

  // ── 3b. Os créditos dentro da fatura ─────────────────────────────────────
  //
  // Um crédito concedido abate o que o banco debita, mas não é despesa a menos
  // em categoria nenhuma. Como linha NEGATIVA da fatura, `card_invoice_recalc`
  // o desconta sozinho e o valor da fatura passa a ser o que saiu do caixa.
  // Sem ele, a fatura do Mercado Pago ficava R$ 66,49 acima do débito — e a
  // tela mostraria uma fatura que ninguém pagou daquele jeito.
  const creditosParaLancar = [];
  if (mp.vencimento && mp.linhasDeCredito?.length && cartoes.has("Mercado Pago")) {
    const cfg = cartoes.get("Mercado Pago");
    const ciclo = cicloDaFatura(mp.vencimento.slice(0, 7), cfg);
    for (const linha of mp.linhasDeCredito) {
      creditosParaLancar.push({ ...linha, cartao: "Mercado Pago", cfg, ciclo });
    }
  }

  if (creditosParaLancar.length) {
    L.push("-- ── 3b. Os créditos concedidos dentro da fatura ───────────────────────────");
    L.push("--");
    L.push("-- Entra como linha NEGATIVA da fatura, e não como receita: `card_invoice_recalc`");
    L.push("-- soma as compras da fatura, então um valor negativo ali é exatamente o");
    L.push("-- abatimento que o banco deu. Lançar como receita faria a clínica parecer ter");
    L.push("-- faturado isso.");
    L.push("--");
    L.push("-- Sem categoria de propósito: crédito não é gasto de nada.");
    L.push("");
    for (const cr of creditosParaLancar) {
      const chave = `credito|${cr.cartao}|${cr.data}|${cr.valor.toFixed(2)}`;
      L.push(
        "insert into public.financial_transactions (owner_id, unit_id, type, status, description," +
          " amount, due_date, purchase_date, card_invoice_id, credit_card_id, account_id," +
          " payment_method, source_type, source_id, notes)",
      );
      L.push(
        `select ${escaparSql(owner)}, c.unit_id, 'payable', 'pending', ${escaparSql(`Crédito na fatura — ${cr.descricao}`)},`,
      );
      L.push(
        `       ${(-Math.abs(cr.valor)).toFixed(2)}, i.due_date, ${escaparSql(cr.data)}, i.id, c.id, c.account_id,`,
      );
      L.push(`       'credito', ${escaparSql(FONTE_FATURA)}, ${escaparSql(chave)},`);
      L.push(
        "       'Abatimento dado pelo banco dentro da fatura. Negativo de propósito: é o que faz o valor da fatura ser o que saiu do caixa.'",
      );
      L.push("  from public.credit_cards c");
      L.push(
        `  join public.card_invoices i on i.card_id = c.id and i.closing_date = ${escaparSql(cr.ciclo.fechamento)}`,
      );
      L.push(` where c.id = ${escaparSql(cr.cfg.id)}`);
      L.push(
        `   and not exists (select 1 from public.financial_transactions f where f.source_type = ${escaparSql(FONTE_FATURA)} and f.source_id = ${escaparSql(chave)});`,
      );
      L.push("");
    }
  }

  // ── 4. As parcelas que já existiam como conta solta ──────────────────────
  const anexar = duplicados.filter(
    (d) => d.proposta.fechamentoDaFatura && cartoes.has(d.proposta.cartao),
  );
  if (anexar.length) {
    L.push("-- ── 4. As parcelas que já estavam lançadas como conta solta ───────────────");
    L.push("--");
    L.push("-- A cadeira do Olsen foi digitada como dez contas a pagar avulsas, com");
    L.push("-- vencimento no dia 29 de cada mês. Ela é uma compra no cartão Inter em 10x, e");
    L.push("-- as parcelas vencem com a FATURA. Em vez de apagar e recriar — o que perderia");
    L.push("-- o histórico das linhas e os ids — elas são anexadas à fatura no lugar.");
    L.push("--");
    L.push("-- A guarda `card_invoice_id is null` serve a duas coisas: torna o UPDATE");
    L.push("-- idempotente e evita acordar o gatilho de congelamento numa segunda passada.");
    L.push("");
    for (const { proposta: p, existente: e } of anexar.sort((a, b) =>
      a.proposta.vencimento.localeCompare(b.proposta.vencimento),
    )) {
      const c = cartoes.get(p.cartao);
      L.push("update public.financial_transactions t");
      L.push(
        `   set credit_card_id = ${escaparSql(c.id)}, card_invoice_id = i.id, purchase_date = ${escaparSql(p.data)},`,
      );
      L.push(
        `       purchase_group_id = ${escaparSql(p.grupoDaCompra)}, installment_number = ${p.parcela}, installment_total = ${p.totalParcelas},`,
      );
      L.push(
        `       due_date = i.due_date, account_id = ${escaparSql(c.accountId)}, payment_method = 'credito',`,
      );
      L.push(
        `       source_type = ${escaparSql(FONTE_FATURA)}, source_id = ${escaparSql(p.chave)}, updated_at = now()`,
      );
      L.push(
        `  from public.card_invoices i where i.card_id = ${escaparSql(c.id)} and i.closing_date = ${escaparSql(p.fechamentoDaFatura)}`,
      );
      L.push(`   and t.id = ${escaparSql(e.id)} and t.card_invoice_id is null;`);
      contagem.parcelasAnexadas++;
    }
    L.push("");
  }

  // ── 5. As despesas do extrato ────────────────────────────────────────────
  const doExtrato = novas.filter((p) => p.fonte === "extrato");
  if (doExtrato.length) {
    L.push("-- ── 5. As despesas pagas direto da conta (extrato) ────────────────────────");
    L.push("--");
    L.push("-- Saída de caixa comum: as duas colunas de cartão ficam nulas, e vencimento e");
    L.push("-- pagamento são o mesmo dia — foi pix ou boleto pago na hora.");
    L.push("--");
    L.push("-- `notes` guarda o que o banco escreveu, letra por letra. É o que permite");
    L.push("-- conferir um lançamento contra o extrato meses depois, quando ninguém lembra");
    L.push("-- por que a categoria é aquela.");
    L.push("");
    L.push(
      "insert into public.financial_transactions (owner_id, unit_id, type, status, description," +
        " amount, due_date, paid_date, category_id, supplier_name, account_id, payment_method," +
        " source_type, source_id, notes)",
    );
    L.push(
      `select ${escaparSql(owner)}, ${escaparSql(unidade)}, 'payable', 'paid', v.descricao, v.valor,`,
    );
    L.push("       v.pago_em, v.pago_em,");
    L.push(
      `       (select id from public.financial_categories where owner_id = ${escaparSql(owner)} and name = v.categoria limit 1),`,
    );
    L.push(
      `       v.fornecedor, ${escaparSql(contaDoExtrato)}, v.meio, ${escaparSql(FONTE_EXTRATO)}, v.chave, v.extrato`,
    );
    L.push("  from (values");
    const vistos = new Map();
    const linhas = doExtrato
      .slice()
      .sort((a, b) => a.data.localeCompare(b.data) || a.descricao.localeCompare(b.descricao))
      .map((p) => {
        const base = `extrato|${p.data}|${p.valor.toFixed(2)}|${normalizar(p.origem).slice(0, 60)}`;
        const n = (vistos.get(base) ?? 0) + 1;
        vistos.set(base, n);
        // Dois pix iguais no mesmo dia para o mesmo fornecedor existem
        // (aconteceu com a Lage), então a chave leva a ocorrência.
        const chave = `${base}#${n}`;
        return (
          `    (${escaparSql(p.descricao)}, ${p.valor.toFixed(2)}, ${escaparSql(p.pagoEm)}::date,` +
          ` ${escaparSql(p.categoria)}, ${escaparSql(p.fornecedor)}, ${escaparSql(meioDePagamento(p.origem))},` +
          ` ${escaparSql(chave)}, ${escaparSql(p.origem)})`
        );
      });
    L.push(linhas.join(",\n"));
    L.push("       ) as v(descricao, valor, pago_em, categoria, fornecedor, meio, chave, extrato)");
    L.push(
      ` where not exists (select 1 from public.financial_transactions f where f.source_type = ${escaparSql(FONTE_EXTRATO)} and f.source_id = v.chave);`,
    );
    L.push("");
    contagem.despesasDoExtrato = doExtrato.length;
  }

  // ── 6. As faturas pagas sem detalhe ──────────────────────────────────────
  //
  // O DIA do pagamento vem de `faturasPagas`, que é a linha do extrato. A
  // primeira versão tentou tirá-lo de `conferenciaDeFaturas`, que só guarda o
  // MÊS: o `due_date`/`paid_date` saía `null`, e `due_date` é NOT NULL. O
  // statement foi recusado e reescrito por quem aplicou, o que deixou as duas
  // linhas pagas SEM data de pagamento — invisíveis em qualquer leitura de
  // caixa. É o tipo de defeito que não aparece em teste de tipo nem de build:
  // só aparece conferindo o banco contra o extrato, dia por dia.
  const semDetalhe = conferenciaDeFaturas
    .filter((c) => !c.temDetalhe)
    .map((c) => {
      const cfg = cartoes.get(c.cartao);
      const pagamento = faturasPagas.find(
        (f) => f.cartao === c.cartao && f.data.slice(0, 7) === c.mes,
      );
      return {
        ...c,
        pagoEm: pagamento?.data ?? null,
        vencimento: cfg ? diaNoMes(c.mes, cfg.diaDeVencimento) : null,
      };
    })
    .filter((c) => {
      if (c.pagoEm && c.vencimento) return true;
      avisos.push(
        `Fatura sem detalhe de ${c.cartao} em ${c.mes} não foi gerada: ` +
          "não achei a data do pagamento ou o dia de vencimento do cartão.",
      );
      return false;
    });
  if (semDetalhe.length) {
    L.push("-- ── 6. As faturas pagas de que não temos o detalhe ────────────────────────");
    L.push("--");
    L.push("-- Março e abril do Inter foram pagos e o arquivo da fatura não existe. Sem");
    L.push("-- parcela nenhuma, o único registro possível é o próprio pagamento — e deixá-lo");
    L.push("-- de fora faria o caixa daqueles meses parecer menor do que foi.");
    L.push("--");
    L.push("-- Vai sem categoria DE PROPÓSITO: ninguém sabe o que foi comprado, e inventar");
    L.push("-- uma categoria aqui mentiria no rateio por hora de cadeira. Aparece em");
    L.push("-- Pagamentos como 'sem categoria', que é a verdade.");
    L.push("");
    for (const c of semDetalhe) {
      const cfg = cartoes.get(c.cartao);
      const chave = `fatura-sem-detalhe|${c.cartao}|${c.mes}`;
      L.push(
        "insert into public.financial_transactions (owner_id, unit_id, type, status, description," +
          " amount, due_date, paid_date, account_id, payment_method, source_type, source_id, notes)",
      );
      L.push(
        `select ${escaparSql(owner)}, ${escaparSql(unidade)}, 'payable', 'paid',` +
          ` ${escaparSql(`Fatura ${cfg?.nome ?? c.cartao} — detalhe não informado`)},` +
          ` ${c.pagoNoExtrato.toFixed(2)}, ${escaparSql(c.vencimento)}, ${escaparSql(c.pagoEm)},` +
          ` ${escaparSql(contaDoExtrato)}, 'fatura', ${escaparSql(FONTE_EXTRATO)}, ${escaparSql(chave)},` +
          ` 'O arquivo desta fatura não foi importado, então não há as compras dentro dela. Quando a fatura for juntada, apagar esta linha e lançar as compras.'`,
      );
      L.push(
        ` where not exists (select 1 from public.financial_transactions f where f.source_type = ${escaparSql(FONTE_EXTRATO)} and f.source_id = ${escaparSql(chave)});`,
      );
      contagem.faturasSemDetalhe++;
    }
    L.push("");
  }

  // ── 7. As correções no que já estava lançado ─────────────────────────────
  const idsAnexados = new Set(anexar.map((d) => d.existente.id));
  const correcoes = ajustes.filter((a) => {
    // "marcar como paga" de parcela de cartão não se aplica mais: a parcela
    // ficou presa à fatura no bloco 4, e é a fatura que recebe o pagamento.
    if (a.o_que === "marcar como paga" && idsAnexados.has(a.id)) return false;
    // O vencimento dessas o bloco 4 já acertou, pelo da fatura.
    if (a.o_que === "conferir o vencimento" && idsAnexados.has(a.id)) return false;
    return true;
  });

  if (correcoes.length) {
    L.push("-- ── 7. As correções no que já estava lançado ──────────────────────────────");
    L.push("--");
    L.push("-- Vale mais que lançar o que falta: é despesa que o sistema já tem e mostra");
    L.push("-- errado. Cada UPDATE é guardado pela condição que ele mesmo destrói, então");
    L.push("-- rodar de novo não faz nada.");
    L.push("");
    for (const a of correcoes) {
      if (a.o_que === "marcar como paga") {
        const quando = /pago em (\d{4}-\d{2}-\d{2})/.exec(a.para)?.[1];
        if (!quando) continue;
        L.push(`-- ${a.descricao} · ${a.fornecedor} — ${a.prova}`);
        L.push(
          `update public.financial_transactions set status = 'paid', paid_date = ${escaparSql(quando)}, updated_at = now()`,
        );
        L.push(` where id = ${escaparSql(a.id)} and status <> 'paid';`);
      } else if (a.o_que === "corrigir a data de pagamento") {
        L.push(`-- ${a.descricao} · ${a.fornecedor} — pago em ${a.para}, e não em ${a.de}`);
        L.push(
          `update public.financial_transactions set paid_date = ${escaparSql(a.para)}, updated_at = now()`,
        );
        L.push(` where id = ${escaparSql(a.id)} and paid_date = ${escaparSql(a.de)};`);
      } else if (a.o_que === "conferir o vencimento") {
        L.push(`-- ${a.descricao} · ${a.fornecedor} — vencimento ${a.de} não bate com o pagamento`);
        L.push(
          `update public.financial_transactions set due_date = ${escaparSql(a.para)}, updated_at = now()`,
        );
        L.push(` where id = ${escaparSql(a.id)} and due_date = ${escaparSql(a.de)};`);
      } else if (a.o_que === "alinhar o nome do fornecedor") {
        L.push(`-- ${a.descricao} — no banco sai como "${a.para}"`);
        L.push(
          `update public.financial_transactions set supplier_name = ${escaparSql(a.para)}, updated_at = now()`,
        );
        L.push(` where id = ${escaparSql(a.id)} and supplier_name = ${escaparSql(a.de)};`);
      } else {
        continue;
      }
      contagem.correcoes++;
      L.push("");
    }
  }

  // ── 8. As diferenças de valor ────────────────────────────────────────────
  if (diferencasDeValor.length) {
    L.push("-- ── 8. A diferença entre o que foi pago e o que estava lançado ────────────");
    L.push("--");
    L.push("-- A Esquadrias 3/6 é de R$ 1.715,00 e saiu R$ 1.749,48. A parcela foi marcada");
    L.push("-- paga no bloco 7 pelo valor dela; a diferença entra aqui, como Juros, para o");
    L.push("-- caixa fechar sem mexer no valor da parcela.");
    L.push("");
    for (const d of diferencasDeValor) {
      const chave = `diferenca|${d.data}|${d.descricao}`;
      L.push(
        "insert into public.financial_transactions (owner_id, unit_id, type, status, description," +
          " amount, due_date, paid_date, category_id, supplier_name, account_id, payment_method," +
          " source_type, source_id, notes)",
      );
      L.push(
        `select ${escaparSql(owner)}, ${escaparSql(unidade)}, 'payable', 'paid',` +
          ` ${escaparSql(`Juros/correção — ${d.descricao.split(" · ")[0]}`)},` +
          ` ${Math.abs(d.valor).toFixed(2)}, ${escaparSql(d.data)}, ${escaparSql(d.data)},` +
          ` ${categoriaPorNome("Juros", owner)}, ${escaparSql(d.nome)}, ${escaparSql(contaDoExtrato)},` +
          ` 'boleto', ${escaparSql(FONTE_EXTRATO)}, ${escaparSql(chave)}, ${escaparSql(d.motivo)}`,
      );
      L.push(
        ` where not exists (select 1 from public.financial_transactions f where f.source_type = ${escaparSql(FONTE_EXTRATO)} and f.source_id = ${escaparSql(chave)});`,
      );
      L.push("");
    }
  }

  // ── 9. As faturas quitadas — POR ÚLTIMO ──────────────────────────────────
  const quitar = [];
  for (const f of faturas.values()) {
    const pagoEm = pagamentoDaFatura(f.cartao, f.vencimento);
    if (pagoEm) quitar.push({ ...f, pagoEm });
  }
  if (quitar.length) {
    L.push("-- ── 9. As faturas que já foram pagas — O ÚLTIMO BLOCO ─────────────────────");
    L.push("--");
    L.push("-- Aqui é onde o dinheiro sai do caixa, e é a única linha de cada mês que sai.");
    L.push("-- A soma das parcelas da fatura, que `card_invoice_recalc` já calculou, bate ao");
    L.push("-- centavo com o que o banco debitou no dia abaixo.");
    L.push("--");
    L.push("-- Depois deste bloco a fatura está congelada: nenhuma compra nova entra nela.");
    L.push("-- É por isso que ele vem no fim.");
    L.push("");
    for (const q of quitar.sort((a, b) => a.pagoEm.localeCompare(b.pagoEm))) {
      const c = cartoes.get(q.cartao);
      L.push(`-- ${c.nome}, fatura que fechou em ${q.fechamento} — paga em ${q.pagoEm}`);
      L.push("update public.financial_transactions t");
      L.push(`   set status = 'paid', paid_date = ${escaparSql(q.pagoEm)}, updated_at = now()`);
      L.push(
        `  from public.card_invoices i where t.settles_card_invoice_id = i.id and i.card_id = ${escaparSql(c.id)}`,
      );
      L.push(`   and i.closing_date = ${escaparSql(q.fechamento)} and t.status <> 'paid';`);
      L.push("");
      contagem.faturasQuitadas++;
    }
  }

  // ── 10. Um nome por fornecedor ───────────────────────────────────────────
  //
  // Roda no fim e sobre TODAS as contas a pagar, não só as importadas: o
  // objetivo é que o relatório por fornecedor tenha uma linha por fornecedor.
  // Enquanto duas grafias convivem, o gasto fica dividido entre elas e nenhum
  // dos dois números é o verdadeiro.
  L.push("-- ── 10. Um nome por fornecedor ────────────────────────────────────────────");
  L.push("--");
  L.push("-- O extrato escreve em CAIXA ALTA e sem acento; a clínica digitou com acento.");
  L.push("-- Sem isto o mesmo fornecedor aparece duas vezes no relatório, com o gasto");
  L.push("-- dividido entre as grafias — aconteceu com a Lage, 7 linhas de um lado e 2 do");
  L.push("-- outro. As três últimas trocas não são grafia e sim identidade: Pirâmides assina");
  L.push("-- AZEVEDO FILHOS no banco, BR Condos é a OPPORTUNITA, e Jonathan Ariel é o");
  L.push("-- JONATHAN MOLINO.");
  L.push("--");
  L.push("-- Idempotente porque o UPDATE exige que o nome ainda seja o antigo.");
  L.push("");
  L.push("update public.financial_transactions t");
  L.push("   set supplier_name = v.canonico, updated_at = now()");
  L.push("  from (values");
  L.push(
    NOME_DO_FORNECEDOR.map(
      ([padrao, canonico]) => `    (${escaparSql(padrao.source)}, ${escaparSql(canonico)})`,
    ).join(",\n"),
  );
  L.push("       ) as v(padrao, canonico)");
  L.push(` where t.owner_id = ${escaparSql(owner)}`);
  L.push("   and t.supplier_name ~* v.padrao");
  L.push("   and t.supplier_name <> v.canonico;");
  L.push("");

  return { sql: L.join("\n") + "\n", contagem };
}

const saidaSql = caminhoSql ? gerarSql() : null;
if (saidaSql) writeFileSync(caminhoSql, saidaSql.sql);

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
for (const c of conferenciaDeCaixa) {
  if (!c.temDetalhe) continue;
  const ok = Math.abs(c.diferenca) < 0.011;
  console.log(
    `  caixa  ${c.data}: ${ok ? "bate" : `DIFERENÇA de ${brl(c.diferenca)}`} (${money(c.pagoNoExtrato)})`,
  );
}
if (saidaSql) {
  const c = saidaSql.contagem;
  console.log(`\nSQL gerado em ${caminhoSql}`);
  console.log(`  ${c.faturas} faturas de cartão`);
  console.log(`  ${c.parcelasNovas} parcelas novas`);
  console.log(`  ${c.parcelasAnexadas} parcelas que já existiam, anexadas à fatura`);
  console.log(`  ${c.despesasDoExtrato} despesas do extrato`);
  console.log(`  ${c.faturasSemDetalhe} faturas pagas sem detalhe`);
  console.log(`  ${c.correcoes} correções`);
  console.log(`  ${c.faturasQuitadas} faturas marcadas como pagas (no último bloco)`);
}
for (const a of avisos) console.log(`\n⚠️  ${a}`);
console.log(
  "\nNada foi gravado no banco." + (saidaSql ? " O SQL existe mas não foi aplicado." : ""),
);
