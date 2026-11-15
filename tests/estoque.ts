// O estoque: caixas e unidades, consumo, dias restantes, preço e a cor do termômetro.
//
// O que não pode acontecer: uma caixa virar a quantidade errada de peças (o
// saldo de tudo depende disso), um item novo ganhar média de consumo de três
// dias, ajuste de contagem virar "gasto", ou um item quase no fim aparecer
// verde.
import {
  comprasNoPeriodo,
  consumoMedio,
  corDoNivel,
  custoPorUnidade,
  diasRestantes,
  emCaixas,
  emUnidades,
  leituraDoEstoque,
  resumoDoEstoque,
  rotuloDoSaldo,
  ultimaCompra,
  type MovimentoDoEstoque,
} from "../src/lib/estoque/estoque.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

// ── Caixas e unidades ──────────────────────────────────────────────────────
conferir("3 caixas de 48 + 12 soltas", emUnidades(3, 12, 48), 156);
conferir("só caixas", emUnidades(2, 0, 100), 200);
conferir("só soltas", emUnidades(0, 7, 100), 7);
conferir("embalagem inválida dá zero", emUnidades(3, 0, 0), 0);
conferir("negativo não entra", emUnidades(-2, -5, 10), 0);
conferir("156 em caixas de 48", emCaixas(156, 48), { caixas: 3, avulsas: 12 });
conferir("exatamente uma caixa", emCaixas(48, 48), { caixas: 1, avulsas: 0 });
conferir("menos de uma caixa", emCaixas(10, 48), { caixas: 0, avulsas: 10 });
conferir("saldo zero", emCaixas(0, 48), { caixas: 0, avulsas: 0 });
conferir("decimais não vazam (0,1+0,2)", emCaixas(0.3, 1).avulsas, 0.3);

conferir("rótulo com caixa e solta", rotuloDoSaldo(156, 48), "3 caixas + 12 unidades");
conferir("rótulo de uma caixa", rotuloDoSaldo(48, 48), "1 caixa");
conferir("rótulo de peças soltas", rotuloDoSaldo(1, 48), "1 unidade");
conferir("rótulo zero", rotuloDoSaldo(0, 48), "0");
conferir("rótulo de embalagem de uma peça", rotuloDoSaldo(5, 1, "frasco", "frasco"), "5 frascos");
conferir("rótulo personalizado", rotuloDoSaldo(30, 10, "pacote", "par"), "3 pacotes");

// ── Consumo ─────────────────────────────────────────────────────────────────
const mov = (
  tipo: MovimentoDoEstoque["tipo"],
  quantidade: number,
  dia: string,
  custoTotal: number | null = null,
  custoUnitario: number | null = null,
): MovimentoDoEstoque => ({ tipo, quantidade, dia, custoTotal, custoUnitario });

// 60 dias: entra 600 no dia 1, sai 120 ao longo do tempo.
const hoje = "2026-11-15";
const longo = [
  mov("entrada", 600, "2026-09-10", 300, 0.5),
  mov("saida", -60, "2026-10-01"),
  mov("saida", -60, "2026-11-01"),
];
conferir("consumo médio de 120 em 60 dias", consumoMedio(longo, hoje).porDia, 2);
conferir("dias observados", consumoMedio(longo, hoje).diasObservados, 60);

// Item novo: 10 dias de vida, gastou 20.
const novo = [mov("entrada", 100, "2026-11-05"), mov("saida", -20, "2026-11-10")];
conferir("item novo usa a vida dele", consumoMedio(novo, hoje).porDia, 2);
conferir("item novo: dias observados", consumoMedio(novo, hoje).diasObservados, 10);

// Pouca história: não arrisca.
const recente = [mov("entrada", 100, "2026-11-12"), mov("saida", -50, "2026-11-13")];
conferir("3 dias de história não vira média", consumoMedio(recente, hoje).porDia, null);
conferir("sem movimento", consumoMedio([], hoje), { porDia: null, diasObservados: 0 });

// Ajuste e entrada não são consumo.
const comAjuste = [
  mov("entrada", 100, "2026-10-01"),
  mov("ajuste", -30, "2026-11-01"),
  mov("saida", -10, "2026-11-02"),
];
conferir(
  "ajuste não conta como gasto",
  consumoMedio(comAjuste, hoje, 60).porDia,
  Math.round((10 / 45) * 10000) / 10000,
);
// Perda conta.
conferir(
  "perda conta como gasto",
  consumoMedio([mov("entrada", 50, "2026-10-01"), mov("perda", -9, "2026-11-01")], hoje).porDia,
  Math.round((9 / 45) * 10000) / 10000,
);
// Saída antes da janela não pesa.
const antigo = [
  mov("entrada", 900, "2026-06-01"),
  mov("saida", -300, "2026-06-10"),
  mov("saida", -30, "2026-11-01"),
];
conferir("saída fora da janela não conta", consumoMedio(antigo, hoje).porDia, 0.5);

// ── Dias restantes ──────────────────────────────────────────────────────────
conferir("saldo 100, 2 por dia → 50 dias", diasRestantes(100, 2), 50);
conferir("arredonda para baixo", diasRestantes(101, 2), 50);
conferir("sem consumo conhecido", diasRestantes(100, null), null);
conferir("consumo zero", diasRestantes(100, 0), null);
conferir("saldo zerado é zero dias", diasRestantes(0, 3), 0);
conferir("saldo negativo é zero dias", diasRestantes(-4, 3), 0);

// ── Preço ───────────────────────────────────────────────────────────────────
conferir("custo por unidade", custoPorUnidade(120, 48), 2.5);
conferir("custo com zero unidades", custoPorUnidade(120, 0), null);
const compras = [
  mov("entrada", 48, "2026-09-01", 100, 2.0833),
  mov("entrada", 48, "2026-11-01", 120, 2.5),
  mov("saida", -5, "2026-11-02"),
];
const u = ultimaCompra(compras, 48);
conferir("última compra: dia", u?.dia, "2026-11-01");
conferir("última compra: por unidade", u?.custoUnitario, 2.5);
conferir("última compra: por caixa", u?.custoPorEmbalagem, 120);
conferir("variação sobre a anterior", u?.variacaoPct, 20);
conferir("sem compra com preço", ultimaCompra([mov("entrada", 10, "2026-11-01")], 10), null);
conferir(
  "uma compra só: sem variação",
  ultimaCompra([mov("entrada", 10, "2026-11-01", 50, 5)], 10)?.variacaoPct,
  null,
);

// ── O termômetro ────────────────────────────────────────────────────────────
conferir("barra vazia é vermelha", corDoNivel(0), "hsl(0 72% 46%)");
conferir("barra cheia é verde", corDoNivel(1), "hsl(130 72% 46%)");
conferir("barra a meio é amarelo-verde", corDoNivel(0.5), "hsl(65 72% 46%)");
conferir("nível fora da faixa não quebra", corDoNivel(9), corDoNivel(1));

conferir("zerado", leituraDoEstoque({ saldo: 0, minimo: 5, dias: null }).situacao, "zerado");
conferir(
  "30 dias ou mais é tranquilo",
  leituraDoEstoque({ saldo: 90, minimo: 0, dias: 45 }).situacao,
  "ok",
);
conferir(
  "20 dias é atenção",
  leituraDoEstoque({ saldo: 40, minimo: 0, dias: 20 }).situacao,
  "medio",
);
conferir("10 dias é baixo", leituraDoEstoque({ saldo: 20, minimo: 0, dias: 10 }).situacao, "baixo");
conferir(
  "7 dias é acabando",
  leituraDoEstoque({ saldo: 14, minimo: 0, dias: 7 }).situacao,
  "critico",
);
conferir(
  "a barra enche com 30 dias",
  leituraDoEstoque({ saldo: 60, minimo: 0, dias: 30 }).nivel,
  1,
);
conferir("15 dias é meia barra", leituraDoEstoque({ saldo: 30, minimo: 0, dias: 15 }).nivel, 0.5);
// Abaixo do mínimo nunca fica verde, mesmo com muitos dias de folga.
const abaixo = leituraDoEstoque({ saldo: 4, minimo: 5, dias: 90 });
conferir("abaixo do mínimo é acabando", abaixo.situacao, "critico");
conferir("abaixo do mínimo não passa de 20% da barra", abaixo.nivel <= 0.2, true);
// Sem consumo, manda o mínimo.
conferir(
  "sem consumo, abaixo do mínimo",
  leituraDoEstoque({ saldo: 3, minimo: 5, dias: null }).situacao,
  "critico",
);
conferir(
  "sem consumo, perto do mínimo",
  leituraDoEstoque({ saldo: 8, minimo: 5, dias: null }).situacao,
  "baixo",
);
conferir(
  "sem consumo, folgado",
  leituraDoEstoque({ saldo: 20, minimo: 5, dias: null }).situacao,
  "ok",
);
// Sem nada, não finge.
conferir(
  "sem consumo nem mínimo",
  leituraDoEstoque({ saldo: 10, minimo: 0, dias: null }).situacao,
  "sem_dados",
);
conferir(
  "barra sem dados usa a maior compra",
  leituraDoEstoque({ saldo: 10, minimo: 0, dias: null, referencia: 40 }).nivel,
  0.25,
);

// ── Os cards ────────────────────────────────────────────────────────────────
const r = resumoDoEstoque([
  { saldo: 0, situacao: "zerado", custoUnitario: 3 },
  { saldo: 4, situacao: "critico", custoUnitario: 2.5 },
  { saldo: 100, situacao: "ok", custoUnitario: 1 },
  { saldo: 10, situacao: "sem_dados", custoUnitario: null },
]);
conferir("cards: itens", r.itens, 4);
conferir("cards: acabando inclui zerado e crítico", r.acabando, 2);
conferir("cards: zerados", r.zerados, 1);
conferir("cards: valor em estoque", r.valorEmEstoque, 110);
conferir("cards: itens sem preço", r.semPreco, 1);

conferir(
  "compras do mês",
  comprasNoPeriodo(
    [
      mov("entrada", 10, "2026-11-02", 100, 10),
      mov("entrada", 10, "2026-11-20", 50, 5),
      mov("entrada", 10, "2026-10-30", 999, 99),
      mov("saida", -3, "2026-11-03"),
    ],
    "2026-11-01",
    "2026-11-30",
  ),
  150,
);

if (falhas.length) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
console.log(`estoque: ${ok} checagens ok`);
