// O que a IA leu no grupo vira — ou não vira — dinheiro no financeiro.
//
// O erro aqui é o mais quieto dos três irmãos: horário errado a paciente
// reclama no mesmo dia, foto errada aparece no WhatsApp de alguém na hora, mas
// valor errado no financeiro só aparece no fim do mês, quando já não se sabe
// qual das cem linhas está torta. Por isso os testes aqui são sobre números.
import {
  catalogoDeCategorias,
  catalogoDeContas,
  completarGasto,
  recadoDoQueFalta,
  comoLerOGasto,
  dataCurta,
  dataDoGasto,
  ehCancelamento,
  ehConfirmacao,
  emReais,
  gastoLido,
  MAXIMO_DE_CATEGORIAS,
  pareceGasto,
  recadoDoLancamento,
  recadoParaConferir,
  TETO_SEM_CONFERIR,
  valorEmReais,
  type CategoriaDaClinica,
  type ContaDaClinica,
  type GastoConferido,
} from "../supabase/functions/_shared/gasto-da-conversa.ts";

let feitas = 0;
function conferir(oQue: string, real: unknown, esperado: unknown) {
  feitas++;
  if (real !== esperado) {
    console.error(`FALHOU ${oQue}: esperava ${String(esperado)}, veio ${String(real)}`);
    process.exit(1);
  }
}

const HOJE = "2026-10-13";

const categorias: CategoriaDaClinica[] = [
  { id: "cat-energia", nome: "Energia" },
  { id: "cat-aluguel", nome: "Aluguel" },
  { id: "cat-insumos", nome: "Insumos Odontológicos" },
];

const contasDaClinica: ContaDaClinica[] = [
  { id: "conta-inter", nome: "Inter Rael" },
  { id: "conta-stone", nome: "Stone" },
];
const contas = catalogoDeContas(contasDaClinica);

/** O mínimo para passar: o resto dos testes muda um campo por vez. */
function ler(bruto: unknown) {
  return gastoLido(bruto as never, cat, contas, HOJE);
}
/** Uma leitura completa, sem nada faltando. */
const COMPLETO = {
  ehGasto: true,
  valor: 240,
  categoria: "G1",
  conta: "C1",
  forma: "pix",
  descricao: "conta de luz",
};

// ── O catálogo ──────────────────────────────────────────────────────────────

const cat = catalogoDeCategorias(categorias);
conferir("três categorias", cat.length, 3);
conferir("a primeira é G1", cat[0].codigo, "G1");
conferir("a terceira é G3", cat[2].codigo, "G3");
conferir("o id viaja junto", cat[0].id, "cat-energia");

conferir("lista vazia", catalogoDeCategorias([]).length, 0);
conferir("nulo não quebra", catalogoDeCategorias(null).length, 0);
conferir("indefinido não quebra", catalogoDeCategorias(undefined).length, 0);

const sujo = catalogoDeCategorias([
  { id: "ok", nome: "Boa" },
  { id: "", nome: "Sem id" },
  { id: "x", nome: "" },
  { id: "y", nome: "   " },
]);
conferir("só a completa entra", sujo.length, 1);
conferir("e a numeração não pula", sujo[0].codigo, "G1");

conferir(
  "corta no teto",
  catalogoDeCategorias(Array.from({ length: 100 }, (_, i) => ({ id: `id${i}`, nome: `Cat ${i}` })))
    .length,
  MAXIMO_DE_CATEGORIAS,
);

// ── O filtro de graça ───────────────────────────────────────────────────────
//
// Existe para não pagar modelo por "bom dia". Erra para perguntar, nunca para
// ignorar: deixar passar um gasto de verdade é o robô ignorar uma pessoa.

conferir("sem algarismo não é gasto", pareceGasto("bom dia gente"), false);
conferir("vazio não é gasto", pareceGasto(""), false);
conferir("nulo não é gasto", pareceGasto(null), false);
conferir("com algarismo pergunta", pareceGasto("paguei 240 na luz"), true);
conferir("valor escrito pergunta", pareceGasto("foram R$ 1.200"), true);
conferir("imagem sempre pergunta", pareceGasto("", true), true);
conferir("imagem sem texto também", pareceGasto(null, true), true);

// ── O valor, do jeito que brasileiro escreve ────────────────────────────────

conferir("número puro", valorEmReais(240), 240);
conferir("texto simples", valorEmReais("240"), 240);
conferir("com reais", valorEmReais("R$ 240"), 240);
conferir("com reais colado", valorEmReais("r$240"), 240);
conferir("vírgula é decimal", valorEmReais("240,50"), 240.5);
conferir("ponto de milhar com vírgula", valorEmReais("1.234,56"), 1234.56);
conferir("milhar grande", valorEmReais("12.345,67"), 12345.67);
// O caso que mais machuca: "1.200" num grupo brasileiro é mil e duzentos, não
// um real e vinte. Ler como decimal erraria por mil vezes.
conferir("ponto sozinho com 3 casas é milhar", valorEmReais("1.200"), 1200);
conferir("ponto com 2 casas é decimal", valorEmReais("240.50"), 240.5);
conferir("ponto com 1 casa é decimal", valorEmReais("240.5"), 240.5);
conferir("dois pontos é milhar", valorEmReais("1.234.567"), 1234567);
conferir("arredonda centavo", valorEmReais(240.567), 240.57);

conferir("zero não vale", valorEmReais(0), null);
conferir("negativo não vale", valorEmReais(-240), null);
conferir("negativo em texto", valorEmReais("-240"), null);
conferir("vazio", valorEmReais(""), null);
conferir("nulo", valorEmReais(null), null);
conferir("indefinido", valorEmReais(undefined), null);
conferir("sem algarismo", valorEmReais("muito caro"), null);
// "mil e duzentos" é trabalho do modelo, não deste módulo: aqui letra solta é
// recusa, porque adivinhar número a partir de texto é exatamente o que não se
// pode fazer com dinheiro.
conferir("número por extenso não vale", valorEmReais("mil e duzentos"), null);
conferir("algarismo com letra", valorEmReais("240 reais"), null);
conferir("infinito", valorEmReais(Infinity), null);
conferir("nan", valorEmReais(NaN), null);

// ── A data ──────────────────────────────────────────────────────────────────

conferir("hoje", dataDoGasto("hoje", HOJE), HOJE);
conferir("vazio vira hoje", dataDoGasto("", HOJE), HOJE);
conferir("nulo vira hoje", dataDoGasto(null, HOJE), HOJE);
conferir("ontem", dataDoGasto("ontem", HOJE), "2026-10-12");
conferir("anteontem", dataDoGasto("anteontem", HOJE), "2026-10-11");
conferir("caixa alta vale", dataDoGasto("ONTEM", HOJE), "2026-10-12");
conferir("espaço em volta vale", dataDoGasto("  ontem  ", HOJE), "2026-10-12");
conferir("data escrita", dataDoGasto("2026-09-30", HOJE), "2026-09-30");

// Virada de mês e de ano feitas com aritmética, não com fuso.
conferir("vira o mês", dataDoGasto("ontem", "2026-11-01"), "2026-10-31");
conferir("vira o ano", dataDoGasto("ontem", "2026-01-01"), "2025-12-31");
conferir("fevereiro bissexto", dataDoGasto("ontem", "2028-03-01"), "2028-02-29");

conferir("futuro recusado", dataDoGasto("2026-10-14", HOJE), null);
conferir("muito antigo recusado", dataDoGasto("2020-01-01", HOJE), null);
conferir("dia que não existe", dataDoGasto("2026-02-31", HOJE), null);
conferir("mês que não existe", dataDoGasto("2026-13-01", HOJE), null);
conferir("formato errado", dataDoGasto("13/10/2026", HOJE), null);
conferir("palavra inventada", dataDoGasto("semana passada", HOJE), null);
conferir("amanhã", dataDoGasto("amanhã", HOJE), null);
conferir("hoje mal formado", dataDoGasto("hoje", "13/10/2026"), null);

// ── A leitura inteira ───────────────────────────────────────────────────────

{
  const r = gastoLido(
    {
      ehGasto: true,
      valor: "240,50",
      categoria: "G1",
      quando: "ontem",
      descricao: "conta de luz",
      fornecedor: "CELESC",
    },
    cat,
    contas,
    HOJE,
  );
  conferir("leitura boa passa", r.ok, true);
  if (r.ok) {
    conferir("valor", r.gasto.valor, 240.5);
    conferir("categoria vira id", r.gasto.categoriaId, "cat-energia");
    conferir("e o nome vem junto", r.gasto.categoriaNome, "Energia");
    conferir("data", r.gasto.data, "2026-10-12");
    conferir("descrição", r.gasto.descricao, "conta de luz");
    conferir("fornecedor", r.gasto.fornecedor, "CELESC");
    conferir("pago por padrão", r.gasto.pago, true);
    conferir("não precisa conferir", r.gasto.precisaConferir, false);
  }
}

// Código fora da lista NÃO recusa o lançamento — vira sem categoria. Uma
// despesa em "sem categoria" alguém arruma; na categoria errada mente para
// sempre.
{
  const r = gastoLido(
    { ehGasto: true, valor: 100, categoria: "G99", descricao: "algo" },
    cat,
    contas,
    HOJE,
  );
  conferir("código inventado não recusa", r.ok, true);
  if (r.ok) {
    conferir("mas fica sem categoria", r.gasto.categoriaId, null);
    conferir("e sem nome", r.gasto.categoriaNome, null);
  }
}
{
  const r = gastoLido(
    { ehGasto: true, valor: 100, categoria: "cat-energia", descricao: "algo" },
    cat,
    contas,
    HOJE,
  );
  conferir("id em vez de código não vale", r.ok && r.gasto.categoriaId, null);
}
{
  const r = gastoLido(
    { ehGasto: true, valor: 100, categoria: "Energia", descricao: "x" },
    cat,
    contas,
    HOJE,
  );
  conferir("nome em vez de código não vale", r.ok && r.gasto.categoriaId, null);
}
conferir(
  "minúscula vale",
  (() => {
    const r = gastoLido(
      { ehGasto: true, valor: 1, categoria: "g2", descricao: "x" },
      cat,
      contas,
      HOJE,
    );
    return r.ok ? r.gasto.categoriaId : null;
  })(),
  "cat-aluguel",
);

// ── O que NÃO vira lançamento ───────────────────────────────────────────────
//
// Cada um destes passando seria dinheiro inventado no financeiro de alguém.

function recusa(bruto: unknown) {
  const r = gastoLido(bruto as never, cat, contas, HOJE);
  return r.ok ? "PASSOU" : r.motivo;
}

conferir("não é gasto", recusa({ ehGasto: false, valor: 10, descricao: "x" }), "não é gasto");
conferir("ehGasto ausente", recusa({ valor: 10, descricao: "x" }), "não é gasto");
conferir(
  "ehGasto como texto",
  recusa({ ehGasto: "true", valor: 10, descricao: "x" }),
  "não é gasto",
);
conferir("ehGasto como 1", recusa({ ehGasto: 1, valor: 10, descricao: "x" }), "não é gasto");
conferir("objeto nulo", recusa(null), "não é gasto");
conferir("indefinido", recusa(undefined), "não é gasto");
conferir("sem valor", recusa({ ehGasto: true, descricao: "x" }), "sem valor");
conferir("valor vazio", recusa({ ehGasto: true, valor: "", descricao: "x" }), "sem valor");
conferir("valor nulo", recusa({ ehGasto: true, valor: null, descricao: "x" }), "sem valor");
conferir("valor zero", recusa({ ehGasto: true, valor: 0, descricao: "x" }), "valor inválido");
conferir("valor negativo", recusa({ ehGasto: true, valor: -5, descricao: "x" }), "valor inválido");
conferir(
  "valor em letras",
  recusa({ ehGasto: true, valor: "caro", descricao: "x" }),
  "valor inválido",
);
conferir("sem descrição", recusa({ ehGasto: true, valor: 10 }), "sem descrição");
conferir(
  "descrição em branco",
  recusa({ ehGasto: true, valor: 10, descricao: "   " }),
  "sem descrição",
);
conferir(
  "data no futuro",
  recusa({ ehGasto: true, valor: 10, descricao: "x", quando: "2027-01-01" }),
  "data inválida",
);
conferir(
  "data inventada",
  recusa({ ehGasto: true, valor: 10, descricao: "x", quando: "mês passado" }),
  "data inválida",
);

// ── O teto ──────────────────────────────────────────────────────────────────
//
// Não é limite de gasto: é detector de zero a mais. Acima dele o robô pergunta
// em vez de gravar.

{
  const r = gastoLido(
    { ehGasto: true, valor: TETO_SEM_CONFERIR + 1, descricao: "x" },
    cat,
    contas,
    HOJE,
  );
  conferir("acima do teto ainda é leitura boa", r.ok, true);
  conferir("mas pede conferência", r.ok && r.gasto.precisaConferir, true);
}
{
  const r = gastoLido(
    { ehGasto: true, valor: TETO_SEM_CONFERIR, descricao: "x" },
    cat,
    contas,
    HOJE,
  );
  conferir("no teto não pede", r.ok && r.gasto.precisaConferir, false);
}
{
  const r = gastoLido({ ehGasto: true, valor: 500, descricao: "x" }, cat, contas, HOJE, 100);
  conferir("teto próprio vale", r.ok && r.gasto.precisaConferir, true);
}

// ── Conta a vencer ──────────────────────────────────────────────────────────

{
  const r = gastoLido({ ehGasto: true, valor: 10, descricao: "x", pago: false }, cat, contas, HOJE);
  conferir("a vencer", r.ok && r.gasto.pago, false);
}
{
  const r = gastoLido({ ehGasto: true, valor: 10, descricao: "x", pago: true }, cat, contas, HOJE);
  conferir("pago explícito", r.ok && r.gasto.pago, true);
}

// ── Sim e não ───────────────────────────────────────────────────────────────

for (const sim of [
  "sim",
  "Sim",
  "SIM",
  "isso",
  "isso mesmo",
  "correto",
  "ta certo",
  "ok",
  "blz",
  "pode lançar",
  "Confirmo!",
  "uhum",
  "é isso aí",
]) {
  conferir(`"${sim}" confirma`, ehConfirmacao(sim), true);
}
for (const nao of [
  "não",
  "nao",
  "NÃO",
  "errado",
  "tá errado",
  "apaga",
  "cancela",
  "exclui",
  "esquece",
]) {
  conferir(`"${nao}" cancela`, ehCancelamento(nao), true);
}

// O que NÃO pode contar como confirmação. O primeiro é o perigoso: tem um
// "sim" dentro e está corrigindo o número, não confirmando.
conferir("sim com ressalva não confirma", ehConfirmacao("sim, mas o valor era 300"), false);
conferir("isso com ressalva", ehConfirmacao("isso aí mas foi ontem"), false);
conferir("frase longa", ehConfirmacao("sim pode lançar isso aí por favor obrigado"), false);
conferir("vazio não confirma", ehConfirmacao(""), false);
conferir("nulo não confirma", ehConfirmacao(null), false);
conferir("outra coisa", ehConfirmacao("bom dia"), false);
conferir("não não confirma", ehConfirmacao("não"), false);
conferir("sim não cancela", ehCancelamento("sim"), false);
conferir(
  "frase longa não cancela",
  ehCancelamento("apaga aquele lançamento de ontem por favor"),
  false,
);
conferir("vazio não cancela", ehCancelamento(""), false);

// ── O que o grupo lê ────────────────────────────────────────────────────────

conferir("reais simples", emReais(240), "R$ 240,00");
conferir("reais com centavo", emReais(240.5), "R$ 240,50");
conferir("reais com milhar", emReais(1234.56), "R$ 1.234,56");
conferir("data curta", dataCurta("2026-10-13"), "13/10");

{
  const r = gastoLido(
    { ehGasto: true, valor: 240, categoria: "G1", descricao: "conta de luz" },
    cat,
    contas,
    HOJE,
  );
  if (!r.ok) throw new Error("devia passar");
  const recado = recadoDoLancamento(r.gasto);
  conferir("traz o valor", recado.includes("R$ 240,00"), true);
  conferir("traz a descrição", recado.includes("conta de luz"), true);
  conferir("traz a categoria", recado.includes("Energia"), true);
  conferir("traz a data", recado.includes("13/10"), true);
  conferir("ensina a desfazer", recado.includes("apaga"), true);
}
{
  const r = gastoLido({ ehGasto: true, valor: 90, descricao: "algo" }, cat, contas, HOJE);
  if (!r.ok) throw new Error("devia passar");
  const recado = recadoDoLancamento(r.gasto);
  conferir("avisa que ficou sem categoria", recado.includes("sem categoria"), true);
  conferir("e diz onde arrumar", recado.includes("Pagamentos"), true);
}
{
  const r = gastoLido({ ehGasto: true, valor: 90, descricao: "x", pago: false }, cat, contas, HOJE);
  if (!r.ok) throw new Error("devia passar");
  conferir("a vencer aparece no recado", recadoDoLancamento(r.gasto).includes("a vencer"), true);
}
{
  const r = gastoLido(
    { ehGasto: true, valor: 500, categoria: "G1", descricao: "nota" },
    cat,
    contas,
    HOJE,
  );
  if (!r.ok) throw new Error("devia passar");
  const daFoto = recadoParaConferir(r.gasto, true);
  conferir("foto diz que leu", daFoto.includes("Li o comprovante"), true);
  conferir("foto pergunta", daFoto.includes("Está correto?"), true);
  conferir("foto não diz lançado", daFoto.includes("Lançado"), false);
  const doTeto = recadoParaConferir(r.gasto, false);
  conferir("teto diz que é alto", doTeto.includes("valor é alto"), true);
}

// ── A conta: de onde o dinheiro saiu ────────────────────────────────────────

conferir("duas contas", contas.length, 2);
conferir("a primeira é C1", contas[0].codigo, "C1");
conferir("prefixo diferente do das categorias", contas[0].codigo[0] === cat[0].codigo[0], false);

{
  const r = ler(COMPLETO);
  conferir("leitura completa passa", r.ok, true);
  if (r.ok) {
    conferir("conta vira id", r.gasto.contaId, "conta-inter");
    conferir("e o nome vem junto", r.gasto.contaNome, "Inter Rael");
    conferir("nada falta", r.gasto.faltando.length, 0);
  }
}

// Sem conta o robô NÃO grava: uma despesa que não saiu de lugar nenhum deixa
// o saldo mentindo, e mentira de saldo ninguém percebe.
{
  const r = ler({ ...COMPLETO, conta: "" });
  conferir("sem conta ainda é leitura boa", r.ok, true);
  conferir("mas falta conta", r.ok && r.gasto.faltando.includes("conta"), true);
  conferir("e a conta fica nula", r.ok && r.gasto.contaId, null);
}
{
  const r = ler({ ...COMPLETO, conta: "C9" });
  conferir("conta inventada não vira conta", r.ok && r.gasto.contaId, null);
  conferir("e conta como faltando", r.ok && r.gasto.faltando.includes("conta"), true);
}
{
  const r = ler({ ...COMPLETO, conta: "conta-inter" });
  conferir("id em vez de código não vale", r.ok && r.gasto.contaId, null);
}
{
  const r = ler({ ...COMPLETO, conta: "G1" });
  conferir("código de categoria não vale como conta", r.ok && r.gasto.contaId, null);
}
conferir(
  "minúscula vale",
  (() => {
    const r = ler({ ...COMPLETO, conta: "c2" });
    return r.ok ? r.gasto.contaId : null;
  })(),
  "conta-stone",
);

// ── A forma de pagamento ────────────────────────────────────────────────────

{
  const r = ler({ ...COMPLETO, forma: "pix" });
  conferir("pix grava pix", r.ok && r.gasto.paymentMethod, "pix");
  conferir("pix não tem parcela", r.ok && r.gasto.installmentTotal, null);
}
{
  const r = ler({ ...COMPLETO, forma: "dinheiro" });
  conferir("dinheiro grava cash", r.ok && r.gasto.paymentMethod, "cash");
}
{
  const r = ler({ ...COMPLETO, forma: "cartao" });
  conferir("cartão grava credit", r.ok && r.gasto.paymentMethod, "credit");
  // À vista é 1, não nulo: é a diferença entre "uma vez" e "não foi cartão", e
  // a taxa da maquininha existe nos dois casos e é diferente.
  conferir("à vista é uma parcela", r.ok && r.gasto.installmentTotal, 1);
}
{
  const r = ler({ ...COMPLETO, forma: "cartao_parcelado", parcelas: 10, valor: 5000 });
  conferir("parcelado grava credit", r.ok && r.gasto.paymentMethod, "credit");
  conferir("e guarda as vezes", r.ok && r.gasto.installmentTotal, 10);
  conferir("nada falta", r.ok && r.gasto.faltando.length, 0);
}

// Parcelado sem dizer em quantas vezes é forma incompleta: gravar "cartão"
// aqui perderia a informação de que houve parcelamento.
{
  const r = ler({ ...COMPLETO, forma: "cartao_parcelado" });
  conferir("parcelado sem vezes falta forma", r.ok && r.gasto.faltando.includes("forma"), true);
}
{
  const r = ler({ ...COMPLETO, forma: "cartao_parcelado", parcelas: 1 });
  conferir("1x não é parcelamento", r.ok && r.gasto.faltando.includes("forma"), true);
}
{
  const r = ler({ ...COMPLETO, forma: "cartao_parcelado", parcelas: 13 });
  conferir("13x passa do teto da maquininha", r.ok && r.gasto.faltando.includes("forma"), true);
}
{
  const r = ler({ ...COMPLETO, forma: "cartao_parcelado", parcelas: 2.5 });
  conferir("parcela quebrada não vale", r.ok && r.gasto.faltando.includes("forma"), true);
}
{
  const r = ler({ ...COMPLETO, forma: "" });
  conferir("sem forma falta forma", r.ok && r.gasto.faltando.includes("forma"), true);
}
{
  const r = ler({ ...COMPLETO, forma: "boleto" });
  conferir("forma inventada não vale", r.ok && r.gasto.forma, null);
  conferir("e conta como faltando", r.ok && r.gasto.faltando.includes("forma"), true);
}

// ── Total contra parcela ────────────────────────────────────────────────────
//
// "10x de 500" dá errado de dois jeitos: o modelo manda 500 como total, ou
// multiplica errado. Os dois somem no meio de um extrato — então quando os
// números não fecham, ninguém grava sozinho.

{
  const r = ler({
    ...COMPLETO,
    forma: "cartao_parcelado",
    parcelas: 10,
    valor: 5000,
    valorDaParcela: 500,
  });
  conferir("conta que fecha não pede conferência", r.ok && r.gasto.precisaConferir, false);
}
{
  const r = ler({
    ...COMPLETO,
    forma: "cartao_parcelado",
    parcelas: 10,
    valor: 500,
    valorDaParcela: 500,
  });
  conferir("total igual à parcela pede conferência", r.ok && r.gasto.precisaConferir, true);
}
{
  const r = ler({
    ...COMPLETO,
    forma: "cartao_parcelado",
    parcelas: 3,
    valor: 1000,
    valorDaParcela: 333.33,
  });
  conferir("centavo de arredondamento ainda fecha", r.ok && r.gasto.precisaConferir, false);
}
{
  const r = ler({ ...COMPLETO, forma: "cartao_parcelado", parcelas: 10, valor: 5000 });
  conferir("sem parcela lida não há o que conferir", r.ok && r.gasto.precisaConferir, false);
}

// ── Completar o que faltava ─────────────────────────────────────────────────

{
  const primeiro = ler({ ...COMPLETO, conta: "", forma: "" });
  if (!primeiro.ok) throw new Error("devia passar");
  conferir("faltam os dois", primeiro.gasto.faltando.length, 2);

  const resposta = ler({ ehGasto: true, valor: 1, descricao: "x", conta: "C1", forma: "pix" });
  if (!resposta.ok) throw new Error("devia passar");
  const junto = completarGasto(primeiro.gasto, resposta.gasto);

  conferir("agora tem conta", junto.contaId, "conta-inter");
  conferir("e forma", junto.paymentMethod, "pix");
  conferir("e nada falta", junto.faltando.length, 0);
  // O valor e a descrição são os da mensagem ORIGINAL. A resposta curta ("pix
  // do Inter") não tem valor nenhum, e um modelo relendo ela inventaria um.
  conferir("o valor não foi trocado", junto.valor, 240);
  conferir("nem a descrição", junto.descricao, "conta de luz");
}
{
  const primeiro = ler({ ...COMPLETO, conta: "" });
  if (!primeiro.ok) throw new Error("devia passar");
  const junto = completarGasto(primeiro.gasto, null);
  conferir("resposta ilegível não estraga o guardado", junto.valor, 240);
  conferir("e continua faltando", junto.faltando.includes("conta"), true);
}
{
  // A segunda leitura não pode SOBRESCREVER o que já se sabia: se a original
  // dizia pix e a resposta disser outra coisa, vale a original.
  const primeiro = ler({ ...COMPLETO, conta: "" });
  if (!primeiro.ok) throw new Error("devia passar");
  const outra = ler({ ehGasto: true, valor: 1, descricao: "x", conta: "C2", forma: "dinheiro" });
  if (!outra.ok) throw new Error("devia passar");
  const junto = completarGasto(primeiro.gasto, outra.gasto);
  conferir("a forma original prevalece", junto.forma, "pix");
  conferir("e a conta que faltava entra", junto.contaId, "conta-stone");
}

// ── O recado de que falta dado ──────────────────────────────────────────────

{
  const r = ler({ ...COMPLETO, conta: "", forma: "" });
  if (!r.ok) throw new Error("devia passar");
  const recado = recadoDoQueFalta(r.gasto, contas);
  conferir("repete o valor", recado.includes("R$ 240,00"), true);
  conferir("pergunta a conta", recado.includes("de qual conta saiu"), true);
  conferir("pergunta a forma", recado.includes("como foi pago"), true);
  conferir("lista as contas", recado.includes("Inter Rael"), true);
  conferir("e as formas", recado.includes("pix"), true);
  conferir("não diz que lançou", recado.includes("Lançado"), false);
}
{
  const r = ler({ ...COMPLETO, forma: "cartao_parcelado" });
  if (!r.ok) throw new Error("devia passar");
  const recado = recadoDoQueFalta(r.gasto, contas);
  conferir("parcelado pergunta quantas vezes", recado.includes("em quantas vezes"), true);
}

// ── O recado do lançamento, com conta e forma ───────────────────────────────

{
  const r = ler({ ...COMPLETO, forma: "cartao_parcelado", parcelas: 4, valor: 1000 });
  if (!r.ok) throw new Error("devia passar");
  const recado = recadoDoLancamento(r.gasto);
  conferir("traz a forma", recado.includes("Cartão em 4x"), true);
  conferir("traz a conta", recado.includes("Inter Rael"), true);
  conferir("e o valor da parcela calculado", recado.includes("4x de R$ 250,00"), true);
}

// ── A instrução ─────────────────────────────────────────────────────────────

{
  const texto = comoLerOGasto(cat, contas, HOJE);
  conferir("traz os códigos", texto.includes("G1 · Energia"), true);
  conferir("e a terceira", texto.includes("G3 · Insumos Odontológicos"), true);
  conferir("diz a data de hoje", texto.includes(HOJE), true);
  conferir("ensina os campos", texto.includes('"ehGasto"'), true);
  conferir("e o da categoria", texto.includes('"categoria"'), true);
  // A regra que protege: na dúvida é false. Quem erra para false fica calado;
  // quem erra para true inventa dinheiro.
  conferir("manda errar para false", texto.includes("Na dúvida, false"), true);
  conferir("proíbe categoria errada", texto.includes("melhor que a errada"), true);
  // O id da categoria é do banco e não pode vazar para o modelo: com ele, um
  // id inventado parecido passaria por id de verdade.
  conferir("o id não aparece", texto.includes("cat-energia"), false);
  conferir("nem o outro", texto.includes("cat-aluguel"), false);
  conferir("nem o id da conta", texto.includes("conta-inter"), false);
  // As contas e as formas precisam estar na instrução, senão o modelo nunca
  // devolve os campos que o lançamento exige.
  conferir("lista as contas", texto.includes("C1 · Inter Rael"), true);
  conferir("ensina o campo da conta", texto.includes('"conta"'), true);
  conferir("ensina as formas", texto.includes("cartao_parcelado"), true);
  conferir("proíbe chutar a conta", texto.includes("NUNCA chute"), true);
  conferir("manda o total, não a parcela", texto.includes("nunca o de uma parcela"), true);
}

console.log(`ok — ${feitas} checagens do gasto lido na conversa`);
