#!/usr/bin/env node
/**
 * Lê a planilha de custos da clínica e PROPÕE o cadastro de materiais e de
 * fichas técnicas. Não escreve nada no banco.
 *
 * ── Por que uma proposta, e não uma importação direta ────────────────────────
 *
 * Porque a planilha tem erro de conta, e importar erro de conta é pior que não
 * importar: o número errado ganha a autoridade de "está no sistema". Auditadas
 * as 165 linhas de ficha em 28/09, 25 delas têm `quantidade × valor unitário`
 * diferente do total escrito, e 6 das 18 fichas têm "Custo Total" que não fecha
 * com as próprias linhas — a pior é a do implante, escrita R$ 3.804,21 quando as
 * linhas somam R$ 11.666,42.
 *
 * Parte desses casos NÃO é erro: é a coluna "Valor Unitário" carregando, às
 * vezes, o preço da EMBALAGEM ("Bráquete 20 × R$ 32,00 = R$ 32,00" — R$ 32 é a
 * caixa de 20). Máquina nenhuma distingue as duas coisas com segurança, então
 * este script separa, recalcula, e entrega a lista para uma pessoa decidir.
 *
 * ── Por que não usa biblioteca de xlsx ──────────────────────────────────────
 *
 * O projeto não tem nenhuma, e acrescentar dependência de build para um script
 * que roda uma vez é pagar caro para sempre. Um .xlsx é um ZIP de XML: o ZIP se
 * lê com `zlib.inflateRawSync`, que já vem no Node, e o XML que interessa aqui
 * é simples o bastante para regex — não é HTML de terceiro, é arquivo nosso com
 * forma conhecida.
 *
 * Uso:
 *   node scripts/importar-custos-planilha.mjs --planilha <arquivo.xlsx> \
 *        [--saida docs/importacao-custos] [--procedimentos <catalogo.csv>]
 *
 * `--procedimentos` é um CSV com uma coluna `name` (o catálogo real do banco).
 * Sem ele, o casamento de PROCEDIMENTO não é sugerido — só o de material.
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

const caminhoPlanilha = arg("planilha");
const dirSaida = arg("saida", "docs/importacao-custos");
const caminhoProcedimentos = arg("procedimentos");

if (!caminhoPlanilha) {
  console.error("Falta --planilha <arquivo.xlsx>");
  process.exit(1);
}
if (!existsSync(caminhoPlanilha)) {
  console.error(`Não achei a planilha: ${caminhoPlanilha}`);
  process.exit(1);
}

// ── O .xlsx, sem biblioteca ─────────────────────────────────────────────────

/**
 * Descompacta um ZIP em memória: { "caminho/dentro": Buffer }.
 *
 * Lê pelo DIRETÓRIO CENTRAL, no fim do arquivo, e não andando pelos cabeçalhos
 * locais do começo. A diferença não é gosto: quem grava o ZIP em fluxo (e o
 * Google Planilhas grava assim) deixa o tamanho ZERADO no cabeçalho local e só
 * escreve o tamanho de verdade depois dos dados, num "data descriptor". A
 * primeira versão deste leitor andava pelos cabeçalhos locais, achava tamanho
 * zero, tentava adivinhar onde o membro acabava — e parou no primeiro arquivo,
 * devolvendo uma planilha quase vazia que ainda assim gerou CSV com cara de
 * certo. O diretório central sempre tem o tamanho real.
 */
function abrirZip(buf) {
  // O EOCD fica no fim, depois de um comentário de até 64 KB.
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

    // No cabeçalho LOCAL só se aproveita o tamanho do nome e do extra, para
    // saber onde os dados começam; os tamanhos vêm do diretório central.
    const tnLocal = buf.readUInt16LE(offsetLocal + 26);
    const teLocal = buf.readUInt16LE(offsetLocal + 28);
    const inicio = offsetLocal + 30 + tnLocal + teLocal;
    const dados = buf.subarray(inicio, inicio + compactado);
    try {
      saida[nome] = metodo === 0 ? Buffer.from(dados) : inflateRawSync(dados);
    } catch {
      // Um membro ilegível não derruba os outros; a checagem de abas no fim
      // reclama se faltar o que interessa.
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

/** O texto de um `<si>` ou `<is>`: a concatenação de todos os `<t>` dentro
 *  dele. São vários quando a célula tem trechos com formatação diferente, e
 *  ler só o primeiro trunca o nome do produto no meio. */
function textoDeElemento(xml) {
  const partes = [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]);
  return decodificar(partes.join(""));
}

function lerPlanilha(caminho) {
  const zip = abrirZip(readFileSync(caminho));

  const compartilhadas = zip["xl/sharedStrings.xml"]
    ? [...zip["xl/sharedStrings.xml"].toString("utf8").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
        textoDeElemento(m[1]),
      )
    : [];

  // O nome da aba mora em workbook.xml e o ARQUIVO dela mora nos rels. Casar
  // pela ordem ("a primeira aba é sheet1.xml") é a suposição que quebra em
  // planilha que já teve aba apagada.
  const wb = (zip["xl/workbook.xml"] || Buffer.from("")).toString("utf8");
  const rels = (zip["xl/_rels/workbook.xml.rels"] || Buffer.from("")).toString("utf8");
  const porId = {};
  for (const m of rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    porId[m[1]] = m[2].replace(/^\/?xl\//, "").replace(/^\.\//, "");
  }

  const abas = [];
  for (const m of wb.matchAll(/<sheet[^>]*\/>/g)) {
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

function lerAba(xml, compartilhadas) {
  const linhas = [];
  for (const mr of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const n = Number(mr[1]);
    const celulas = {};
    // A célula VAZIA autofechada (`<c r="A3" s="15"/>`) vem primeiro na
    // alternância, e isso não é estilo: com a ordem invertida, `<c([^>]*)>` casa
    // o `/` como se fosse atributo, o `>` final fecha a abertura, e o corpo
    // lazy até `</c>` engole a célula SEGUINTE. Foi assim que o valor da coluna
    // B apareceu na coluna A em toda linha com A vazia — e a planilha inteira
    // virou 183 fichas de um item em vez de 18 fichas de 165.
    for (const mc of mr[2].matchAll(/<c([^>]*?)\/>|<c([^>]*?)>([\s\S]*?)<\/c>/g)) {
      const autofechada = mc[1] !== undefined;
      const attrs = autofechada ? mc[1] : (mc[2] ?? "");
      const corpo = autofechada ? "" : (mc[3] ?? "");
      const ref = (attrs.match(/r="([A-Z]+)\d+"/) || [])[1];
      if (!ref) continue;
      const tipo = (attrs.match(/t="([^"]*)"/) || [])[1];
      let valor = null;
      if (tipo === "s") {
        const v = (corpo.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        if (v !== undefined) valor = compartilhadas[Number(v)] ?? null;
      } else if (tipo === "inlineStr") {
        valor = textoDeElemento(corpo);
      } else {
        const v = (corpo.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        if (v !== undefined) valor = decodificar(v);
      }
      if (valor !== null && String(valor).trim() !== "") celulas[ref] = String(valor).trim();
    }
    if (Object.keys(celulas).length) linhas.push({ n, celulas });
  }
  return linhas;
}

// ── Números e nomes ─────────────────────────────────────────────────────────

/**
 * "R$ 1.234,56" → 1234.56. "0.33" → 0.33. "50g" → 50, com unidade "g".
 *
 * A regra do ponto: **sem vírgula na string, ponto é DECIMAL**. Não é
 * preferência — é o formato do arquivo. Célula numérica no XML do .xlsx é
 * sempre `<v>20.875</v>`, com ponto decimal e nunca com separador de milhar; só
 * texto digitado por gente traz "1.234,56", e aí a vírgula está ali para
 * denunciar o formato.
 *
 * A primeira versão tratava "ponto seguido de três dígitos" como milhar, e
 * transformou os R$ 20,875 de resina da Restauração em **R$ 20.875,00** — uma
 * linha de material mil vezes maior que a ficha inteira. Um erro assim não
 * passa desapercebido; um de 10× passaria.
 */
function numeroEUnidade(bruto) {
  if (bruto === null || bruto === undefined) return { valor: null, unidade: null };
  let t = String(bruto).trim();
  const unidade = (t.match(/(mg|ml|kg|g|l|un|cm|mm)\s*$/i) || [])[1] || null;
  t = t
    .replace(/R\$/gi, "")
    .replace(/(mg|ml|kg|g|l|un|cm|mm)\s*$/i, "")
    .trim();
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  t = t.replace(/[^\d.\-]/g, "");
  const valor = t === "" ? null : Number(t);
  return { valor: Number.isFinite(valor) ? valor : null, unidade };
}

const numero = (b) => numeroEUnidade(b).valor;

/** Sem acento, sem maiúscula, sem pontuação: é a chave de comparação de nome. */
function chave(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Palavras que aparecem em quase todo nome e não ajudam a distinguir nada. */
const VAZIAS = new Set(["de", "da", "do", "para", "com", "sem", "e", "em", "un", "c", "kit"]);

/**
 * Quanto dois nomes se parecem, de 0 a 1.
 *
 * Jaccard de palavras, com dois reforços: palavra vazia não conta, e conter o
 * nome curto inteiro dentro do longo vale muito ("Babador" dentro de "Babador
 * Impermeável Descartável"). É deliberadamente simples porque o resultado é
 * SUGESTÃO para uma pessoa confirmar — um casamento automático "esperto" é o
 * que põe o material errado na ficha e erra o custo para sempre.
 */
function semelhanca(a, b) {
  const ka = chave(a);
  const kb = chave(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;
  const pa = new Set(ka.split(" ").filter((p) => p && !VAZIAS.has(p)));
  const pb = new Set(kb.split(" ").filter((p) => p && !VAZIAS.has(p)));
  if (!pa.size || !pb.size) return 0;
  let comuns = 0;
  for (const p of pa) if (pb.has(p)) comuns++;
  const jaccard = comuns / (pa.size + pb.size - comuns);
  const contido = kb.includes(ka) || ka.includes(kb) ? 0.5 : 0;
  // Teto de 0,99 para quem não é o MESMO nome. Sem isso, "Água Destilada"
  // pontuava 1,00 contra "Água Destilada para Autoclave" (meia palavra em comum
  // mais o bônus de estar contido) e o relatório dizia "exato" — convidando a
  // pular justamente a decisão que só uma pessoa pode tomar.
  return Math.min(0.99, jaccard + contido);
}

function sugerir(nome, candidatos, quantos = 3) {
  return candidatos
    .map((c) => ({ nome: c, score: semelhanca(nome, c) }))
    .filter((x) => x.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, quantos);
}

// ── CSV em português ────────────────────────────────────────────────────────
//
// Ponto e vírgula e vírgula decimal: é o que o Excel em português abre com um
// duplo clique. Com vírgula e ponto, a clínica veria tudo numa coluna só e
// abandonaria o arquivo — que é o mesmo que não ter gerado nada.

/** Avisos que valem mais que o resumo: dizem que algo NÃO foi feito. */
const avisos = [];

const brl = (v) => (v === null || v === undefined ? "" : v.toFixed(2).replace(".", ","));
const num3 = (v) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

/**
 * Grava um CSV, MENOS quando o arquivo que já está lá tem escolha preenchida.
 *
 * A segunda rodada do script é a mais perigosa: a pessoa passou uma hora
 * preenchendo `ESCOLHA_AQUI`, alguém roda de novo para conferir um número, e o
 * trabalho vai embora sem aviso. Nesse caso a proposta nova vai para
 * `<nome>.novo.csv` e o script diz onde.
 */
function gravarCsv(caminho, linhas) {
  if (existsSync(caminho)) {
    const antigo = readFileSync(caminho, "utf8").split(/\r?\n/).slice(1);
    const temEscolha = antigo.some((l) => {
      const campos = l.split(";");
      return campos.length > 1 && campos[campos.length - 1].trim() !== "";
    });
    if (temEscolha) {
      const alternativo = caminho.replace(/\.csv$/, ".novo.csv");
      writeFileSync(alternativo, csv(linhas));
      avisos.push(
        `${basename(caminho)} tem escolhas preenchidas e NÃO foi sobrescrito — a proposta nova está em ${basename(alternativo)}.`,
      );
      return;
    }
  }
  writeFileSync(caminho, csv(linhas));
}

function csv(linhas) {
  return (
    linhas
      .map((l) =>
        l
          .map((c) => {
            const s = c === null || c === undefined ? "" : String(c);
            return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(";"),
      )
      .join("\r\n") + "\r\n"
  );
}

// ── Leitura das abas ────────────────────────────────────────────────────────

const abas = lerPlanilha(caminhoPlanilha);
const aba = (pedaco) => abas.find((a) => chave(a.nome).includes(chave(pedaco)));

const abaUsados = aba("mais usados");
const abaCompleta = aba("lista completa");
const abaFichas = aba("custos por procedimento");

if (!abaUsados && !abaCompleta) {
  console.error(
    `Não achei as abas de produto. Abas encontradas: ${abas.map((a) => a.nome).join(", ") || "(nenhuma)"}`,
  );
  process.exit(1);
}
if (!abaFichas) {
  console.error("Não achei a aba de custos por procedimento.");
  process.exit(1);
}

/** Um produto do catálogo da planilha. `origem` diz de qual aba veio, porque a
 *  "Lista Mais Usados" é a curada (38 de 39 revisados) e é ela que deve entrar
 *  primeiro; a "Lista Completa" tem duplicados e números não revisados. */
function lerProdutos(abaDoProduto, origem) {
  const out = [];
  for (const { n, celulas } of abaDoProduto?.linhas ?? []) {
    if (n === 1) continue; // cabeçalho
    const nome = celulas.A;
    if (!nome) continue;
    const qtd = numero(celulas.C);
    const pago = numero(celulas.D);
    const unitarioPlanilha = numero(celulas.E);
    out.push({
      linha: n,
      origem,
      nome,
      marca: celulas.B ?? "",
      unidadesPorEmbalagem: qtd,
      custoDaEmbalagem: pago,
      unitarioPlanilha,
      // A coluna é 1 ou 0, não "preenchida ou vazia": tratar 0 como revisado
      // diria que os 91 materiais foram conferidos, quando 35 não foram.
      revisado: ["1", "1.0", "sim", "true"].includes(
        String(celulas.F ?? "")
          .trim()
          .toLowerCase(),
      ),
    });
  }
  return out;
}

const produtos = [
  ...lerProdutos(abaUsados, "Mais Usados"),
  ...lerProdutos(abaCompleta, "Completa"),
];

// Deduplica por nome mantendo a primeira aparição — a lista curada vem antes,
// então ela ganha. O descartado fica no relatório: duplicado silencioso é
// estoque duplicado depois.
const porNome = new Map();
const duplicados = [];
for (const p of produtos) {
  const k = chave(p.nome);
  if (porNome.has(k)) duplicados.push({ ...p, primeira: porNome.get(k) });
  else porNome.set(k, p);
}
const materiais = [...porNome.values()];

/** Rótulos que não são material: são o rodapé de cálculo do bloco. */
const ROTULOS = new Set([
  "custo total",
  "hora clinica",
  "impostos",
  "valor do procedimento",
  "lucro liquido",
]);

const fichas = [];
let atual = null;
for (const { n, celulas } of abaFichas.linhas) {
  if (n === 1) continue;
  if (celulas.A) {
    atual = { procedimento: celulas.A, linha: n, itens: [], rodape: {} };
    fichas.push(atual);
  }
  if (!atual) continue;
  const rotulo = celulas.B;
  if (!rotulo) continue;
  const k = chave(rotulo);
  if (ROTULOS.has(k)) {
    atual.rodape[k] = { c: celulas.C ?? null, d: numero(celulas.D), e: numero(celulas.E) };
    continue;
  }
  const q = numeroEUnidade(celulas.C);
  atual.itens.push({
    linha: n,
    material: rotulo,
    quantidade: q.valor,
    unidadeNoTexto: q.unidade,
    unitario: numero(celulas.D),
    totalPlanilha: numero(celulas.E),
  });
}

// ── Catálogo de procedimentos do banco (opcional) ───────────────────────────

let procedimentosDoBanco = [];
if (caminhoProcedimentos && existsSync(caminhoProcedimentos)) {
  const txt = readFileSync(caminhoProcedimentos, "utf8");
  const linhas = txt.split(/\r?\n/).filter(Boolean);
  const sep =
    (linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ";" : ",";
  const cab = linhas[0].split(sep).map((c) => chave(c));
  const iNome = Math.max(0, cab.indexOf("name") >= 0 ? cab.indexOf("name") : cab.indexOf("nome"));
  for (const l of linhas.slice(1)) {
    const nome = (l.split(sep)[iNome] || "").replace(/^"|"$/g, "").trim();
    if (nome) procedimentosDoBanco.push(nome);
  }
}

// ── Conferência ─────────────────────────────────────────────────────────────

/** Custo por unidade como a conta manda, e o que a planilha escreveu ao lado.
 *  Quando os dois diferem, o número da planilha quase sempre embute RENDIMENTO
 *  ("este frasco dá 20 usos") — e isso é informação, não erro. O script calcula
 *  o rendimento implícito e pergunta, em vez de escolher sozinho. */
for (const m of materiais) {
  m.custoPorUnidadeCalculado =
    m.custoDaEmbalagem !== null && m.unidadesPorEmbalagem
      ? m.custoDaEmbalagem / m.unidadesPorEmbalagem
      : null;
  m.divergenteDoUnitario =
    m.custoPorUnidadeCalculado !== null &&
    m.unitarioPlanilha !== null &&
    Math.abs(m.custoPorUnidadeCalculado - m.unitarioPlanilha) >
      Math.max(0.01, 0.02 * m.unitarioPlanilha);
  m.rendimentoImplicito =
    m.divergenteDoUnitario && m.unitarioPlanilha ? m.custoDaEmbalagem / m.unitarioPlanilha : null;
}

const nomesDeProduto = materiais.map((m) => m.nome);
const chavesDeProduto = new Set(nomesDeProduto.map((n) => chave(n)));
/** Existe um produto com EXATAMENTE este nome (ignorando acento e caixa)? */
const temNomeIgual = (nome) => chavesDeProduto.has(chave(nome));
const linhasComErro = [];
const fichasQueNaoFecham = [];
const nomesDeMaterialDaFicha = new Map(); // nome na ficha -> quantas vezes

for (const f of fichas) {
  let soma = 0;
  for (const it of f.itens) {
    nomesDeMaterialDaFicha.set(it.material, (nomesDeMaterialDaFicha.get(it.material) ?? 0) + 1);
    it.totalRecalculado =
      it.quantidade !== null && it.unitario !== null ? it.quantidade * it.unitario : null;
    if (it.totalPlanilha !== null) soma += it.totalPlanilha;
    if (
      it.totalRecalculado !== null &&
      it.totalPlanilha !== null &&
      Math.abs(it.totalRecalculado - it.totalPlanilha) > 0.02
    ) {
      it.erroDeConta = true;
      linhasComErro.push({ procedimento: f.procedimento, ...it });
    }
  }
  f.somaDasLinhas = soma;
  const escrito = f.rodape["custo total"]?.e ?? null;
  f.custoTotalEscrito = escrito;
  if (escrito !== null && Math.abs(escrito - soma) > 0.05) fichasQueNaoFecham.push(f);
}

// ── Saída ───────────────────────────────────────────────────────────────────

mkdirSync(dirSaida, { recursive: true });

writeFileSync(
  join(dirSaida, "materiais.csv"),
  csv([
    [
      "nome",
      "marca",
      "unidades_por_embalagem",
      "custo_da_embalagem",
      "custo_por_unidade_calculado",
      "custo_por_unidade_na_planilha",
      "rendimento_implicito",
      "conferir",
      "revisado",
      "aba",
      "linha",
    ],
    ...materiais.map((m) => [
      m.nome,
      m.marca,
      num3(m.unidadesPorEmbalagem),
      brl(m.custoDaEmbalagem),
      m.custoPorUnidadeCalculado === null
        ? ""
        : m.custoPorUnidadeCalculado.toFixed(4).replace(".", ","),
      brl(m.unitarioPlanilha),
      m.rendimentoImplicito === null ? "" : m.rendimentoImplicito.toFixed(2).replace(".", ","),
      m.divergenteDoUnitario ? "SIM" : "",
      m.revisado ? "sim" : "",
      m.origem,
      m.linha,
    ]),
  ]),
);

writeFileSync(
  join(dirSaida, "fichas.csv"),
  csv([
    [
      "procedimento",
      "material_na_ficha",
      "quantidade",
      "unidade_no_texto",
      "custo_unitario_na_planilha",
      "total_na_planilha",
      "total_recalculado",
      "erro_de_conta",
      "material_sugerido_do_catalogo",
      "semelhanca",
      "linha",
    ],
    ...fichas.flatMap((f) =>
      f.itens.map((it) => {
        const s = sugerir(it.material, nomesDeProduto, 1)[0];
        return [
          f.procedimento,
          it.material,
          num3(it.quantidade),
          it.unidadeNoTexto ?? "",
          brl(it.unitario),
          brl(it.totalPlanilha),
          brl(it.totalRecalculado),
          it.erroDeConta ? "SIM" : "",
          s ? s.nome : "",
          s ? s.score.toFixed(2).replace(".", ",") : "",
          it.linha,
        ];
      }),
    ),
  ]),
);

// Uma linha por NOME distinto, que é a unidade de trabalho de quem vai casar:
// "Luva de Látex" aparece em 13 fichas e a decisão é uma só.
const paraCasar = [...nomesDeMaterialDaFicha.entries()]
  .map(([nome, vezes]) => ({ nome, vezes, sugestoes: sugerir(nome, nomesDeProduto, 3) }))
  .sort((a, b) => b.vezes - a.vezes);

gravarCsv(join(dirSaida, "materiais-a-casar.csv"), [
  [
    "material_na_ficha",
    "em_quantas_fichas",
    "exato",
    "sugestao_1",
    "sem_1",
    "sugestao_2",
    "sem_2",
    "sugestao_3",
    "sem_3",
    "ESCOLHA_AQUI",
  ],
  ...paraCasar.map((p) => [
    p.nome,
    p.vezes,
    temNomeIgual(p.nome) ? "sim" : "",
    p.sugestoes[0]?.nome ?? "",
    p.sugestoes[0] ? p.sugestoes[0].score.toFixed(2).replace(".", ",") : "",
    p.sugestoes[1]?.nome ?? "",
    p.sugestoes[1] ? p.sugestoes[1].score.toFixed(2).replace(".", ",") : "",
    p.sugestoes[2]?.nome ?? "",
    p.sugestoes[2] ? p.sugestoes[2].score.toFixed(2).replace(".", ",") : "",
    "",
  ]),
]);

// Sem o catálogo real não há sugestão nenhuma a dar, e um arquivo com a coluna
// de sugestão vazia é pior que nenhum arquivo: ele parece dizer "não há nada
// parecido". Por isso só se escreve quando `--procedimentos` veio.
if (procedimentosDoBanco.length)
  gravarCsv(join(dirSaida, "procedimentos-a-casar.csv"), [
    [
      "procedimento_na_planilha",
      "itens",
      "custo_material_recalculado",
      "sugestao_1",
      "sem_1",
      "sugestao_2",
      "sem_2",
      "sugestao_3",
      "sem_3",
      "ESCOLHA_AQUI",
    ],
    ...fichas.map((f) => {
      const s = sugerir(f.procedimento, procedimentosDoBanco, 3);
      return [
        f.procedimento,
        f.itens.length,
        brl(f.itens.reduce((a, it) => a + (it.totalRecalculado ?? it.totalPlanilha ?? 0), 0)),
        s[0]?.nome ?? "",
        s[0] ? s[0].score.toFixed(2).replace(".", ",") : "",
        s[1]?.nome ?? "",
        s[1] ? s[1].score.toFixed(2).replace(".", ",") : "",
        s[2]?.nome ?? "",
        s[2] ? s[2].score.toFixed(2).replace(".", ",") : "",
        "",
      ];
    }),
  ]);

// ── O relatório que uma pessoa lê ───────────────────────────────────────────

const r = [];
const money = (v) => (v === null || v === undefined ? "—" : `R$ ${brl(v)}`);

r.push(`# Importação da planilha de custos`);
r.push("");
r.push(`Arquivo: \`${basename(caminhoPlanilha)}\``);
r.push(`Gerado em: ${new Date().toISOString().slice(0, 10)}`);
r.push("");
r.push(
  "**Nada foi gravado no banco.** Este relatório e os quatro CSVs ao lado são uma PROPOSTA:",
  "a conta de cada linha foi refeita, e o que não fecha está listado abaixo para você decidir.",
);
r.push("");
r.push("## Resumo");
r.push("");
r.push(`| | |`);
r.push(`|---|---|`);
r.push(`| Materiais distintos | ${materiais.length} |`);
r.push(
  `| ...vindos da lista curada | ${materiais.filter((m) => m.origem === "Mais Usados").length} |`,
);
r.push(`| ...marcados como revisados | ${materiais.filter((m) => m.revisado).length} |`);
r.push(`| Nomes duplicados descartados | ${duplicados.length} |`);
r.push(`| Fichas técnicas | ${fichas.length} |`);
r.push(`| Itens de ficha | ${fichas.reduce((a, f) => a + f.itens.length, 0)} |`);
r.push(`| Linhas com conta errada | **${linhasComErro.length}** |`);
r.push(`| Fichas cujo total não fecha | **${fichasQueNaoFecham.length}** |`);
r.push(
  `| Materiais da ficha sem nome igual no catálogo | **${paraCasar.filter((p) => !temNomeIgual(p.nome)).length}** de ${paraCasar.length} |`,
);
r.push("");

if (linhasComErro.length) {
  r.push("## Linhas em que `quantidade × valor unitário` não dá o total escrito");
  r.push("");
  r.push(
    "Parte disto não é erro de digitação: quando o valor unitário é o preço da EMBALAGEM",
    "(bráquete a R$ 32,00 a caixa de 20), o total está certo e o rótulo da coluna é que engana.",
    "Por isso a decisão é sua, linha por linha.",
  );
  r.push("");
  r.push("| Procedimento | Material | Qtd | Unitário | Escrito | Recalculado | Diferença |");
  r.push("|---|---|---:|---:|---:|---:|---:|");
  for (const l of linhasComErro) {
    const dif = (l.totalRecalculado ?? 0) - (l.totalPlanilha ?? 0);
    r.push(
      `| ${l.procedimento} | ${l.material} | ${num3(l.quantidade)} | ${money(l.unitario)} | ${money(l.totalPlanilha)} | ${money(l.totalRecalculado)} | ${dif >= 0 ? "+" : ""}${brl(dif)} |`,
    );
  }
  r.push("");
}

r.push("## Custo de cada ficha: o escrito e o recalculado");
r.push("");
r.push(
  '"Soma das linhas" usa os totais COMO ESTÃO escritos; "recalculado" refaz cada linha',
  "por `quantidade × valor unitário`. Quando as duas colunas diferem muito, a resposta está",
  "na tabela de erros acima — e quase sempre é o valor unitário que é de embalagem.",
);
r.push("");
r.push("| Ficha | Itens | Soma das linhas | Recalculado | Custo Total escrito |");
r.push("|---|---:|---:|---:|---:|");
for (const f of fichas) {
  f.somaRecalculada = f.itens.reduce(
    (a, it) => a + (it.totalRecalculado ?? it.totalPlanilha ?? 0),
    0,
  );
  r.push(
    `| ${f.procedimento} | ${f.itens.length} | ${money(f.somaDasLinhas)} | ${money(f.somaRecalculada)} | ${money(f.custoTotalEscrito)} |`,
  );
}
r.push("");

const comRodape = fichas.filter((f) => Object.keys(f.rodape).length > 1);
if (comRodape.length) {
  r.push("## Fichas que já têm hora clínica, imposto e preço");
  r.push("");
  r.push(
    "São as peças que o sistema vai aplicar em TODOS os procedimentos. Onde elas não",
    'aparecem, o "Custo Total" da planilha é material puro — e por isso parece barato.',
  );
  r.push("");
  for (const f of comRodape) {
    r.push(`### ${f.procedimento}`);
    r.push("");
    for (const [k, v] of Object.entries(f.rodape)) {
      r.push(
        `- **${k}**: coluna C \`${v.c ?? "—"}\` · coluna D \`${v.d ?? "—"}\` · valor ${money(v.e)}`,
      );
    }
    const hora = f.rodape["hora clinica"];
    if (hora && hora.c && hora.d) {
      const horas = numero(hora.c);
      const esperado = horas !== null ? horas * hora.d : null;
      if (esperado !== null && Math.abs(esperado - (hora.e ?? 0)) > 0.02) {
        r.push(
          `- ⚠️ a hora clínica diz **${num3(horas)}h × ${money(hora.d)} = ${money(esperado)}**, mas soma ${money(hora.e)}.`,
        );
      }
    }
    r.push("");
  }
}

if (materiais.some((m) => m.divergenteDoUnitario)) {
  r.push('## Materiais em que o "Valor Unitário" não é o valor pago dividido pela quantidade');
  r.push("");
  r.push(
    "Quase sempre porque o seu número embute RENDIMENTO: quantos usos a embalagem dá.",
    "Confirme o rendimento e ele vira a quantidade por embalagem no cadastro.",
  );
  r.push("");
  r.push(
    "| Material | Qtd embalagem | Valor pago | Unitário da planilha | Pela divisão | Rendimento implícito |",
  );
  r.push("|---|---:|---:|---:|---:|---:|");
  for (const m of materiais.filter((x) => x.divergenteDoUnitario)) {
    r.push(
      `| ${m.nome} | ${num3(m.unidadesPorEmbalagem)} | ${money(m.custoDaEmbalagem)} | ${money(m.unitarioPlanilha)} | ${money(m.custoPorUnidadeCalculado)} | ${m.rendimentoImplicito === null ? "—" : brl(m.rendimentoImplicito) + " usos"} |`,
    );
  }
  r.push("");
}

if (duplicados.length) {
  r.push("## Nomes duplicados (mantida a primeira aparição)");
  r.push("");
  for (const d of duplicados) {
    r.push(
      `- \`${d.nome}\` — aba ${d.origem} linha ${d.linha}; mantido o da aba ${d.primeira.origem} linha ${d.primeira.linha}`,
    );
  }
  r.push("");
}

const semCasamento = paraCasar.filter((p) => !temNomeIgual(p.nome));
if (semCasamento.length) {
  r.push("## Materiais da ficha que precisam ser casados com o catálogo");
  r.push("");
  r.push(
    "A ficha usa nome genérico e o catálogo usa nome comercial. Preencha a coluna",
    "`ESCOLHA_AQUI` de `materiais-a-casar.csv`: material errado na ficha é custo errado",
    "em todo procedimento que o usa, para sempre.",
  );
  r.push("");
  r.push("| Material na ficha | Em quantas fichas | Melhor palpite | Semelhança |");
  r.push("|---|---:|---|---:|");
  for (const p of semCasamento) {
    r.push(
      `| ${p.nome} | ${p.vezes} | ${p.sugestoes[0]?.nome ?? "— nenhum parecido —"} | ${p.sugestoes[0] ? brl(p.sugestoes[0].score) : "—"} |`,
    );
  }
  r.push("");
}

if (!procedimentosDoBanco.length) {
  r.push("## Procedimentos");
  r.push("");
  r.push(
    "O catálogo real não foi informado (`--procedimentos`), então não há sugestão de",
    "casamento das 18 fichas com os procedimentos do sistema. Rode de novo passando o CSV.",
  );
  r.push("");
}

r.push("## O que fazer com este resultado");
r.push("");
r.push("1. Abrir `materiais.csv` e conferir a coluna `conferir` (rendimento).");
r.push("2. Preencher `ESCOLHA_AQUI` em `materiais-a-casar.csv` e em `procedimentos-a-casar.csv`.");
r.push("3. Decidir, nas linhas listadas acima, se o valor unitário é unidade ou embalagem.");
r.push(
  "4. Só então a migration de dados é escrita — a partir dos CSVs revisados, não da planilha.",
);
r.push("");

writeFileSync(join(dirSaida, "RELATORIO.md"), r.join("\n"));

console.log(`Proposta gerada em ${dirSaida}/`);
console.log(`  materiais.csv               ${materiais.length} materiais`);
console.log(
  `  fichas.csv                  ${fichas.reduce((a, f) => a + f.itens.length, 0)} itens em ${fichas.length} fichas`,
);
console.log(
  `  materiais-a-casar.csv       ${paraCasar.length} nomes (${semCasamento.length} sem correspondência exata)`,
);
console.log(`  procedimentos-a-casar.csv   ${fichas.length} fichas`);
console.log(
  `  RELATORIO.md                ${linhasComErro.length} linhas com conta errada, ${fichasQueNaoFecham.length} fichas que não fecham`,
);
for (const a of avisos) console.log(`\n⚠️  ${a}`);
console.log("\nNada foi gravado no banco.");
