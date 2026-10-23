// A conta que decide crédito.
//
// Um nível a mais libera R$ 1.000 que a clínica não devia; um a menos deixa de
// liberar o que ela prometeu. Nos dois casos não há erro em tela nenhuma — há
// uma paciente que indicou dez pessoas e continua vendo "Premium".
//
// Os modos de errar que isto fecha:
//
//   **Pagar o mesmo nível duas vezes.** Chegou ao Gold, uma indicação foi
//   cancelada, depois confirmou outra. O Gold não pode pagar de novo.
//
//   **Não pagar o nível pulado.** Cinco confirmações de uma vez alcançam Start
//   e Premium no mesmo instante, e os dois créditos são devidos.
//
//   **A barra mentir.** De Gold (10) para Diamond (20), onze indicações são
//   10% do caminho. Mostrar 55% faz a pessoa achar que está quase lá.
import {
  niveisAPagar,
  reguaOrdenada,
  saldoDoExtrato,
  situacaoNoClub,
  trilhaDoCredito,
  valorDaProximaIndicacao,
  type NivelDoClub,
} from "../src/lib/club/niveis-do-club.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

// A régua que a clínica definiu, de propósito FORA de ordem: ela vem do banco,
// e a ordem de lá é a que alguém digitou.
const REGUA: NivelDoClub[] = [
  { id: "gold", nome: "Gold", indicacoes: 10, credito: 1000 },
  { id: "start", nome: "Start", indicacoes: 1, credito: 50 },
  { id: "diamond", nome: "Diamond", indicacoes: 20, credito: 2000 },
  { id: "premium", nome: "Premium", indicacoes: 5, credito: 500 },
];

conferir(
  "a régua sai ordenada pela exigência",
  reguaOrdenada(REGUA).map((n) => n.nome),
  ["Start", "Premium", "Gold", "Diamond"],
);
conferir(
  "nível sem nome não entra na régua",
  reguaOrdenada([...REGUA, { id: "x", nome: "  ", indicacoes: 3, credito: 1 }]).length,
  4,
);
conferir(
  "nem nível que não exige nada",
  reguaOrdenada([...REGUA, { id: "y", nome: "Grátis", indicacoes: 0, credito: 1 }]).length,
  4,
);

// ── Onde a pessoa está ──────────────────────────────────────────────────

{
  const s = situacaoNoClub(0, REGUA);
  conferir("sem indicação, sem nível", s.nivel, null);
  conferir("e o próximo é o Start", s.proximo?.nome, "Start");
  conferir("falta uma", s.faltam, 1);
  conferir("barra vazia", s.progresso, 0);
}
{
  const s = situacaoNoClub(1, REGUA);
  conferir("a primeira indicação é Start", s.nivel?.nome, "Start");
  conferir("faltam quatro para o Premium", s.faltam, 4);
}
{
  const s = situacaoNoClub(12, REGUA);
  conferir("doze é Gold", s.nivel?.nome, "Gold");
  conferir("e o próximo é Diamond", s.proximo?.nome, "Diamond");
  conferir("faltam oito", s.faltam, 8);
  // 12 está a 2 de 10 dentro da faixa 10→20.
  conferir("a barra anda dentro da faixa", s.progresso, 0.2);
}
{
  const s = situacaoNoClub(20, REGUA);
  conferir("vinte é Diamond", s.nivel?.nome, "Diamond");
  conferir("não há próximo", s.proximo, null);
  conferir("barra cheia no topo", s.progresso, 1);
  conferir("e não falta nada", s.faltam, 0);
}
{
  const s = situacaoNoClub(57, REGUA);
  conferir("acima do topo continua Diamond", s.nivel?.nome, "Diamond");
  conferir("sem barra passando de cheia", s.progresso, 1);
}
// Contagem estranha não quebra a conta nem inventa nível.
conferir("negativo não dá nível", situacaoNoClub(-3, REGUA).nivel, null);
conferir("quebrado é arredondado para baixo", situacaoNoClub(4.9, REGUA).nivel?.nome, "Start");
conferir("sem régua nenhuma, sem nível", situacaoNoClub(99, []).nivel, null);
conferir("e sem próximo", situacaoNoClub(99, []).proximo, null);

// ── O que vira crédito ──────────────────────────────────────────────────

conferir(
  "cinco de uma vez pagam Start e Premium",
  niveisAPagar(5, REGUA, []).map((n) => n.nome),
  ["Start", "Premium"],
);
conferir(
  "com o Start já pago, só o Premium",
  niveisAPagar(5, REGUA, ["start"]).map((n) => n.nome),
  ["Premium"],
);
// O caso que a trava existe para impedir: voltou ao Gold depois de um
// cancelamento, e o Gold já pagou.
conferir(
  "nível já pago não paga de novo",
  niveisAPagar(10, REGUA, ["start", "premium", "gold"]),
  [],
);
conferir("abaixo do primeiro nível, nada a pagar", niveisAPagar(0, REGUA, []), []);
// Nível de crédito zero não vira lançamento: lançamento de zero é ruído no
// extrato de alguém.
conferir(
  "nível sem crédito não lança nada",
  niveisAPagar(3, [{ id: "z", nome: "Bronze", indicacoes: 3, credito: 0 }], []),
  [],
);

// ── O saldo ─────────────────────────────────────────────────────────────

conferir(
  "o saldo é a soma do extrato",
  saldoDoExtrato([{ valor: 500 }, { valor: 1000 }, { valor: -250 }]),
  1250,
);
conferir("extrato vazio é zero", saldoDoExtrato([]), 0);
// O banco devolve numeric como string; somar sem converter daria "0500-250".
conferir(
  "numeric em texto também soma",
  saldoDoExtrato([{ valor: "500" as unknown as number }, { valor: "-250" as unknown as number }]),
  250,
);

// ── A próxima indicação e a trilha ──────────────────────────────────────
//
// Com a régua real da clínica em 23/10: R$ 100 por indicação, e bônus de
// R$ 100 (1), 500 (5), 1.000 (10) e 2.000 (20).
const REAL: NivelDoClub[] = [
  { id: "s", nome: "Start", indicacoes: 1, credito: 100 },
  { id: "p", nome: "Premium", indicacoes: 5, credito: 500 },
  { id: "g", nome: "Gold", indicacoes: 10, credito: 1000 },
  { id: "d", nome: "Diamond", indicacoes: 20, credito: 2000 },
];
conferir(
  "a primeira indicação vale o fixo + o bônus do Start",
  valorDaProximaIndicacao(0, REAL, 100),
  200,
);
conferir("a segunda vale só o fixo", valorDaProximaIndicacao(1, REAL, 100), 100);
conferir("a quinta traz o Premium junto", valorDaProximaIndicacao(4, REAL, 100), 600);
conferir("depois do topo, só o fixo", valorDaProximaIndicacao(25, REAL, 100), 100);
conferir("régua vazia, só o fixo", valorDaProximaIndicacao(0, [], 100), 100);

{
  const t = trilhaDoCredito(0, REAL, 100);
  conferir("o topo da trilha é R$ 5.600", t.total, 5600);
  conferir(
    "as paradas acumulam",
    t.paradas.map((p) => p.acumulado),
    [200, 1100, 2600, 5600],
  );
  conferir("quem não indicou está no zero", t.ganho, 0);
  conferir("com 5 confirmadas, R$ 1.100", trilhaDoCredito(5, REAL, 100).ganho, 1100);
  conferir("passar do topo não estoura a linha", trilhaDoCredito(40, REAL, 100).ganho, 5600);
  conferir(
    "a trilha vem ordenada mesmo com régua fora de ordem",
    trilhaDoCredito(0, REGUA, 100).paradas.map((p) => p.nivel.nome),
    ["Start", "Premium", "Gold", "Diamond"],
  );
}

if (falhas.length) {
  console.error(`${falhas.length} falha(s):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens dos níveis do Club`);
