// Checagens do valor que vai para a Meta.
//
// ── O caso real que este arquivo guarda ────────────────────────────────
//
// 26/09: dois agendamentos de Bioestimulador de colágeno, R$ 1.500 cada.
// `actual_revenue` em 0,00, `expected_revenue` em 1.500,00. O código fazia
// `actual ?? expected` — e como zero não é nulo, a Meta recebeu R$ 0,00 nos
// dois. R$ 3.000 de faturamento reportados como nada.
//
// Os modos de errar:
//
//   **Tratar zero como valor.** É o defeito original, e é o mais caro: ele
//   não falha, ele mente. Uma compra de R$ 0 sobe a contagem de compras e não
//   sobe o faturamento, então o custo por compra fica barato e o ROAS afunda.
//
//   **Transformar "não sei" em zero.** Sem valor nenhum tem de sair `null`, e
//   `null` tem de atravessar até a decisão de não mandar a compra.
//
//   **Aceitar negativo.** Estorno não é compra, e faturamento negativo
//   estragaria o ROAS da campanha.
//
//   **Barrar evento que não tem valor.** `Lead` não carrega valor e não pode
//   ser engolido pela mesma regra.
import { valeComoCompra, valorDaConversao } from "../src/lib/integrations/valor-da-conversao.ts";
import {
  valeComoCompra as valeNoEdge,
  valorDaConversao as valorNoEdge,
} from "../supabase/functions/_shared/valor-da-conversao.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

// ── O caso do Bioestimulador ─────────────────────────────────────────────
conferir("realizado zero cai para o previsto", valorDaConversao(0, 1500), 1500);
conferir("e o defeito antigo daria zero", 0 ?? 1500, 0); // o `??` que estava no código

// ── O caminho normal ─────────────────────────────────────────────────────
conferir("realizado preenchido manda", valorDaConversao(990, 600), 990);
conferir("realizado nulo cai para o previsto", valorDaConversao(null, 749), 749);
conferir("os dois iguais", valorDaConversao(450, 450), 450);
// O banco devolve numeric como string.
conferir("string do banco vira número", valorDaConversao("1500.00", null), 1500);
conferir("string zerada do banco também cai", valorDaConversao("0.00", "1500.00"), 1500);

// ── Sem valor ────────────────────────────────────────────────────────────
conferir("os dois zerados dão nulo, não zero", valorDaConversao(0, 0), null);
conferir("os dois nulos dão nulo", valorDaConversao(null, null), null);
conferir("indefinido não quebra", valorDaConversao(undefined, undefined), null);
conferir("string vazia não vira zero", valorDaConversao("", ""), null);
conferir("texto que não é número dá nulo", valorDaConversao("abc", null), null);

// ── Negativo ─────────────────────────────────────────────────────────────
conferir("estorno no realizado cai para o previsto", valorDaConversao(-200, 500), 500);
conferir("negativo nos dois dá nulo", valorDaConversao(-200, -500), null);

// ── Vale como compra? ────────────────────────────────────────────────────
conferir("compra de 990 vale", valeComoCompra("Purchase", 990), true);
conferir("compra de zero NÃO vale", valeComoCompra("Purchase", 0), false);
conferir("compra sem valor NÃO vale", valeComoCompra("Purchase", null), false);
conferir("compra negativa não vale", valeComoCompra("Purchase", -10), false);
// A consulta de R$ 1,00 que apareceu quatro vezes no histórico passa — é
// valor de verdade, ainda que torto. Quem conserta isso é quem preenche a
// ficha, não o código: barrar aqui seria o sistema decidindo que R$ 1 não
// conta, e amanhã a clínica tem uma promoção de R$ 1 de verdade.
conferir("compra de 1 real passa", valeComoCompra("Purchase", 1), true);

conferir("Lead não tem valor e passa", valeComoCompra("Lead", null), true);
conferir("Contact passa", valeComoCompra("Contact", null), true);
conferir("CompleteRegistration passa", valeComoCompra("CompleteRegistration", 0), true);
conferir("caixa não importa", valeComoCompra("purchase", 0), false);
conferir("espaço em volta não importa", valeComoCompra("  Purchase  ", 0), false);
conferir("nome vazio passa", valeComoCompra("", null), true);

// ── As duas cópias têm de responder igual ────────────────────────────────
//
// A regra vive em dois runtimes (Cloudflare Workers no app, Deno nas Edge
// Functions) e nenhum import atravessa a fronteira. O jeito de as cópias não
// divergirem é este: os MESMOS casos, nas duas.
{
  const casos: [number | string | null, number | string | null][] = [
    [0, 1500],
    [990, 600],
    [null, 749],
    ["0.00", "1500.00"],
    [0, 0],
    [null, null],
    [-200, 500],
    ["", ""],
    ["abc", null],
  ];
  for (const [realizado, previsto] of casos) {
    conferir(
      `as duas cópias concordam em (${realizado}, ${previsto})`,
      valorNoEdge(realizado, previsto),
      valorDaConversao(realizado, previsto),
    );
  }
  for (const [nome, valor] of [
    ["Purchase", 990],
    ["Purchase", 0],
    ["Purchase", null],
    ["Lead", null],
    ["purchase", 0],
  ] as [string, number | null][]) {
    conferir(
      `as duas cópias concordam sobre ${nome} de ${valor}`,
      valeNoEdge(nome, valor),
      valeComoCompra(nome, valor),
    );
  }
}

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens do valor da conversão`);
