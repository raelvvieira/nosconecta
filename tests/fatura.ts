// Checagens da regra de fatura de cartão de crédito.
import {
  estadoDaFatura,
  faturaDaCompra,
  faturasDasParcelas,
  janelaDaFatura,
  valorDasParcelas,
} from "../src/lib/finance/fatura.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) ok++;
  else falhas.push(`${nome} — esperado ${b}, veio ${a}`);
}
const datas = (fechamento: string, vencimento: string) => ({ fechamento, vencimento });

// ── O caso do enunciado ───────────────────────────────────────────────────
// Fecha 25, vence 5: compras de 26/jan a 25/fev formam a fatura que fecha
// 25/fev e vence 05/mar.
conferir(
  "compra depois do fechamento vai para a próxima fatura",
  faturaDaCompra("2026-01-26", 25, 5),
  datas("2026-02-25", "2026-03-05"),
);
conferir(
  "compra antes do fechamento fica na fatura do mês",
  faturaDaCompra("2026-01-20", 25, 5),
  datas("2026-01-25", "2026-02-05"),
);
// Convenção: comprar NO dia do fechamento entra nessa fatura.
conferir(
  "compra no próprio dia do fechamento entra nessa fatura",
  faturaDaCompra("2026-01-25", 25, 5),
  datas("2026-01-25", "2026-02-05"),
);

// ── A regra do mês do vencimento ─────────────────────────────────────────
conferir(
  "vence DEPOIS do fechamento: mesmo mês",
  faturaDaCompra("2026-02-01", 1, 10),
  datas("2026-02-01", "2026-02-10"),
);
conferir(
  "vence ANTES do fechamento: mês seguinte",
  faturaDaCompra("2026-02-20", 25, 5),
  datas("2026-02-25", "2026-03-05"),
);
conferir(
  "vence NO MESMO dia do fechamento: mês seguinte",
  faturaDaCompra("2026-02-10", 15, 15),
  datas("2026-02-15", "2026-03-15"),
);

// ── Dias que não existem ─────────────────────────────────────────────────
// Fevereiro é o teste que quebra implementação ingênua.
conferir(
  "fechamento 31 vira 28 em fevereiro",
  faturaDaCompra("2026-02-15", 31, 10),
  datas("2026-02-28", "2026-03-10"),
);
conferir(
  "fechamento 31 vira 29 em ano bissexto",
  faturaDaCompra("2028-02-15", 31, 10),
  datas("2028-02-29", "2028-03-10"),
);
conferir(
  "vencimento 31 apara para 30 em abril",
  faturaDaCompra("2026-04-03", 5, 31),
  datas("2026-04-05", "2026-04-30"),
);
conferir(
  "vencimento 31 apara para 28 em fevereiro",
  faturaDaCompra("2026-02-03", 5, 31),
  datas("2026-02-05", "2026-02-28"),
);

// Cartão que fecha cedo: comprar dia 10 num cartão que fecha dia 5 JÁ passou do
// fechamento deste mês. Essa é a leitura que erra fácil — a intuição diz "dia
// 10 é começo do mês, deve cair na fatura deste mês", e não é.
conferir(
  "fechamento cedo: dia 10 já passou do fechamento dia 5",
  faturaDaCompra("2026-03-10", 5, 31),
  datas("2026-04-05", "2026-04-30"),
);
// Comprar dia 30 num cartão que fecha 31, em mês curto: o fechamento aparado
// vira 28, então a compra JÁ passou e vai para a fatura de março.
conferir(
  "compra dia 30 com fechamento 31 em mês de 30 dias",
  faturaDaCompra("2026-04-30", 31, 10),
  datas("2026-04-30", "2026-05-10"),
);

// ── A guarda do vencimento que colapsa em cima do fechamento ─────────────
// Fecha 28, vence 30: em fevereiro os dois aparariam para 28. Uma fatura não
// pode vencer no dia em que fecha.
conferir(
  "vencimento não colapsa sobre o fechamento",
  faturaDaCompra("2026-02-10", 28, 30),
  datas("2026-02-28", "2026-03-30"),
);

// ── Virada de ano ────────────────────────────────────────────────────────
conferir(
  "dezembro fecha e vence em janeiro do ano seguinte",
  faturaDaCompra("2026-12-20", 25, 5),
  datas("2026-12-25", "2027-01-05"),
);
conferir(
  "compra em 26/dez cai na fatura de janeiro",
  faturaDaCompra("2026-12-26", 25, 5),
  datas("2027-01-25", "2027-02-05"),
);

// ── Parcelamento ─────────────────────────────────────────────────────────
const doze = faturasDasParcelas("2026-01-10", 25, 5, 12);
conferir("doze parcelas geram doze faturas", doze.length, 12);
conferir("1ª parcela", doze[0], datas("2026-01-25", "2026-02-05"));
conferir("2ª parcela", doze[1], datas("2026-02-25", "2026-03-05"));
conferir("12ª parcela", doze[11], datas("2026-12-25", "2027-01-05"));
// Meses consecutivos, sem pular nem repetir — inclusive atravessando fevereiro.
conferir(
  "os fechamentos são meses consecutivos",
  doze.map((f) => f.fechamento.slice(0, 7)),
  ["2026-01","2026-02","2026-03","2026-04","2026-05","2026-06",
   "2026-07","2026-08","2026-09","2026-10","2026-11","2026-12"],
);

// A armadilha do `addMonths`: fechamento 31 andando doze meses derivaria para
// 03/03, 03/04... A aritmética inteira mantém cada parcela no mês dela.
const trintaEUm = faturasDasParcelas("2026-01-10", 31, 10, 12);
conferir(
  "fechamento 31 não escorrega de mês ao longo de um ano",
  trintaEUm.map((f) => f.fechamento),
  ["2026-01-31","2026-02-28","2026-03-31","2026-04-30","2026-05-31","2026-06-30",
   "2026-07-31","2026-08-31","2026-09-30","2026-10-31","2026-11-30","2026-12-31"],
);

// Compra depois do fechamento: TODAS as parcelas deslocam junto.
const depois = faturasDasParcelas("2026-01-26", 25, 5, 3);
conferir(
  "parcelamento de compra pós-fechamento começa na fatura seguinte",
  depois.map((f) => f.vencimento),
  ["2026-03-05", "2026-04-05", "2026-05-05"],
);

// À vista no crédito é o caso N=1.
conferir("à vista no crédito é uma parcela só", faturasDasParcelas("2026-01-10", 25, 5, 1), [
  datas("2026-01-25", "2026-02-05"),
]);
conferir("zero parcelas vira uma", faturasDasParcelas("2026-01-10", 25, 5, 0).length, 1);

// ── Rateio: a soma tem que fechar no centavo ─────────────────────────────
conferir("1200 em 12x", valorDasParcelas(1200, 12), Array(12).fill(100));
conferir("100 em 3x — a última absorve a sobra", valorDasParcelas(100, 3), [33.33, 33.33, 33.34]);
conferir("10 em 3x", valorDasParcelas(10, 3), [3.33, 3.33, 3.34]);
conferir("valor único", valorDasParcelas(59.9, 1), [59.9]);
for (const [total, n] of [[100, 3], [1200, 12], [59.9, 7], [0.05, 4], [1999.99, 6]] as const) {
  const soma = valorDasParcelas(total, n).reduce((a, b) => a + b, 0);
  conferir(`soma de ${total} em ${n}x fecha exato`, Math.round(soma * 100), Math.round(total * 100));
}

// ── Estado derivado ──────────────────────────────────────────────────────
conferir("paga ganha de tudo", estadoDaFatura("2026-03-25", "2026-02-01", "2026-04-05"), "paga");
conferir("fechamento no passado = fechada", estadoDaFatura("2026-01-25", "2026-02-01", null), "fechada");
conferir("fechamento no futuro = aberta", estadoDaFatura("2026-03-25", "2026-02-01", null), "aberta");
// No próprio dia do fechamento a fatura ainda aceita compra — coerente com a
// convenção inclusiva lá de cima.
conferir("no dia do fechamento ainda está aberta", estadoDaFatura("2026-02-01", "2026-02-01", null), "aberta");

// ── A janela que a tela mostra ───────────────────────────────────────────
conferir(
  "janela vai do dia seguinte ao fechamento anterior",
  janelaDaFatura("2026-10-25", 25),
  { de: "2026-09-26", ate: "2026-10-25" },
);
conferir(
  "janela atravessa a virada de ano",
  janelaDaFatura("2026-01-25", 25),
  { de: "2025-12-26", ate: "2026-01-25" },
);
conferir(
  "janela com fechamento 31 parte de 01/03 quando fevereiro apara",
  janelaDaFatura("2026-03-31", 31),
  { de: "2026-03-01", ate: "2026-03-31" },
);

if (falhas.length) {
  console.error(`FALHOU (${falhas.length}):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens de fatura de cartão`);
