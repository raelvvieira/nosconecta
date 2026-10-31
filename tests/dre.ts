// O DRE: os grupos, o regime e as somas.
//
// O que não pode acontecer: investimento entrar no resultado (a obra faria
// todo mês dar prejuízo), lançamento cancelado somar, ou o regime de caixa
// contar o que ainda não foi pago.
import {
  gastosDoPeriodo,
  grupoSugerido,
  mesDoLancamento,
  montarDre,
  percentualDaReceita,
  resolverFaturas,
  variacao,
  type LancamentoBruto,
  type LancamentoDoDre,
} from "../src/lib/finance/dre.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

conferir("móveis é investimento", grupoSugerido("Móveis", "expense"), "investimento");
conferir(
  "material de construção é investimento",
  grupoSugerido("Material de Construção", "expense"),
  "investimento",
);
conferir(
  "insumos é custo variável",
  grupoSugerido("Insumos Odontológicos", "expense"),
  "custo_variavel",
);
conferir("aluguel é fixa", grupoSugerido("Aluguel", "expense"), "despesa_fixa");
conferir("juros é financeiro", grupoSugerido("Juros", "expense"), "financeiro");
conferir("categoria de entrada é receita", grupoSugerido("Qualquer", "income"), "receita");

const l = (
  tipo: "receivable" | "payable",
  amount: number,
  dueDate: string,
  paidDate: string | null,
  grupo: LancamentoDoDre["grupo"],
  nome = "x",
  status = paidDate ? "paid" : "pending",
): LancamentoDoDre => ({
  tipo,
  status,
  amount,
  dueDate,
  paidDate,
  categoriaId: nome,
  categoriaNome: nome,
  grupo,
});

conferir(
  "caixa: pendente não conta",
  mesDoLancamento(l("payable", 1, "2026-10-05", null, "despesa_fixa"), "caixa"),
  null,
);
conferir(
  "caixa: conta pelo dia do pagamento",
  mesDoLancamento(l("payable", 1, "2026-10-31", "2026-11-02", "despesa_fixa"), "caixa"),
  "2026-11",
);
conferir(
  "competência: conta pelo vencimento",
  mesDoLancamento(l("payable", 1, "2026-10-31", "2026-11-02", "despesa_fixa"), "competencia"),
  "2026-10",
);
conferir(
  "cancelado nunca conta",
  mesDoLancamento(
    l("payable", 1, "2026-10-31", "2026-10-31", "despesa_fixa", "x", "cancelled"),
    "competencia",
  ),
  null,
);

const meses = ["2026-09", "2026-10"];
const dre = montarDre(
  [
    l("receivable", 10000, "2026-10-01", "2026-10-01", null, "Atendimentos"),
    l("receivable", 500, "2026-10-20", null, null, "Atendimentos"), // pendente
    l("payable", 2000, "2026-10-05", "2026-10-05", "custo_variavel", "Insumos"),
    l("payable", 3000, "2026-10-10", "2026-10-10", "despesa_fixa", "Aluguel"),
    l("payable", 100, "2026-10-10", "2026-10-10", "financeiro", "Juros"),
    l("payable", 7000, "2026-10-15", "2026-10-15", "investimento", "Móveis"),
    l("payable", 150, "2026-10-15", "2026-10-15", null, "Material de Consumo"), // sem grupo: palpite
    l("payable", 999, "2026-09-15", "2026-09-15", "despesa_fixa", "Aluguel"),
  ],
  meses,
  "caixa",
);
conferir("receita de outubro só o pago", dre.linhas.receita.porMes, [0, 10000]);
conferir("custo variável com o palpite do consumo", dre.linhas.custo_variavel.porMes, [0, 2150]);
conferir("fixa nos dois meses", dre.linhas.despesa_fixa.porMes, [999, 3000]);
conferir("margem de contribuição", dre.margemDeContribuicao, [0, 7850]);
conferir("resultado operacional", dre.resultadoOperacional, [-999, 4850]);
conferir("resultado líquido", dre.resultadoLiquido, [-999, 4750]);
conferir("investimento fica fora do resultado", dre.linhas.investimento.porMes, [0, 7000]);
conferir("conta os sem grupo (o pendente nem entrou)", dre.semGrupo, 2);
conferir(
  "categorias do grupo, maior primeiro",
  dre.linhas.custo_variavel.categorias.map((c) => c.nome),
  ["Insumos", "Material de Consumo"],
);

const comp = montarDre(
  [l("receivable", 500, "2026-10-20", null, null, "Atendimentos")],
  meses,
  "competencia",
);
conferir("competência conta o pendente", comp.linhas.receita.porMes, [0, 500]);

conferir("percentual", percentualDaReceita(2150, 10000), 21.5);
conferir("percentual sem receita", percentualDaReceita(10, 0), null);
conferir("subiu 25%", variacao(1250, 1000), 25);
conferir("caiu 10%", variacao(900, 1000), -10);
conferir("sem base, sem variação", variacao(500, 0), null);
conferir("base negativa usa o módulo", variacao(-500, -1000), 50);

// O cartão: a fatura some e as compras herdam o pagamento dela.
const bruto = (x: Partial<LancamentoBruto> & { amount: number }): LancamentoBruto => ({
  tipo: "payable",
  status: "pending",
  dueDate: "2026-10-16",
  paidDate: null,
  categoriaId: x.categoriaNome ?? null,
  categoriaNome: null,
  grupo: null,
  faturaId: null,
  quitaFaturaId: null,
  ...x,
});
const resolvido = resolverFaturas([
  bruto({ amount: 300, categoriaNome: "Insumos", grupo: "custo_variavel", faturaId: "f1" }),
  bruto({ amount: 50, categoriaNome: "Software", grupo: "despesa_fixa", faturaId: "f1" }),
  bruto({ amount: 350, quitaFaturaId: "f1", status: "paid", paidDate: "2026-10-20" }),
  bruto({
    amount: 80,
    categoriaNome: "Luz",
    grupo: "despesa_fixa",
    status: "paid",
    paidDate: "2026-10-05",
  }),
  bruto({ amount: 20, categoriaNome: "Insumos", grupo: "custo_variavel", faturaId: "f-fora" }),
]);
conferir("a fatura some", resolvido.length, 4);
conferir(
  "compra herda o pagamento da fatura",
  resolvido.filter((l) => l.faturaId === "f1").map((l) => [l.status, l.paidDate]),
  [
    ["paid", "2026-10-20"],
    ["paid", "2026-10-20"],
  ],
);
conferir(
  "compra de fatura fora da janela fica pendente",
  resolvido.find((l) => l.faturaId === "f-fora")?.status,
  "pending",
);
const gastos = gastosDoPeriodo(resolvido, "2026-10-01", "2026-10-31");
conferir("total do período sem contar a fatura duas vezes", gastos.total, 430);
conferir("por grupo", [gastos.porGrupo.custo_variavel, gastos.porGrupo.despesa_fixa], [300, 130]);
conferir(
  "categorias, maior primeiro",
  gastos.categorias.map((c) => [c.nome, c.valor]),
  [
    ["Insumos", 300],
    ["Luz", 80],
    ["Software", 50],
  ],
);
conferir(
  "fora do intervalo não conta",
  gastosDoPeriodo(resolvido, "2026-10-01", "2026-10-10").total,
  80,
);

if (falhas.length) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
console.log(`dre: ${ok} checagens ok`);
