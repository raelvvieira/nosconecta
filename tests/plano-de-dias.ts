// Em quantos dias a campanha cabe.
//
// Errar aqui não dá erro em lugar nenhum: a clínica aprova uma divisão na tela
// e o sistema grava outra, ou duas campanhas caem no mesmo dia e metade das
// mensagens falha no momento do envio — que é o pior momento para descobrir.
import {
  MAX_DIAS,
  planoDeDias,
  proximoDia,
  resumoDoPlano,
} from "../src/lib/atendimentos/plano-de-dias";

let feitas = 0;
function conferir(oQue: string, real: unknown, esperado: unknown) {
  feitas++;
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a !== b) {
    console.error(`FALHOU ${oQue}: esperava ${b}, veio ${a}`);
    process.exit(1);
  }
}

// ── O dia seguinte ──────────────────────────────────────────────────────────

conferir("dia comum", proximoDia("2026-10-20"), "2026-10-21");
conferir("vira o mês", proximoDia("2026-10-31"), "2026-11-01");
conferir("setembro tem 30", proximoDia("2026-09-30"), "2026-10-01");
conferir("vira o ano", proximoDia("2026-12-31"), "2027-01-01");
conferir("fevereiro comum", proximoDia("2026-02-28"), "2026-03-01");
conferir("fevereiro bissexto", proximoDia("2028-02-28"), "2028-02-29");
conferir("29 de fevereiro", proximoDia("2028-02-29"), "2028-03-01");
conferir("1900 não é bissexto", proximoDia("1900-02-28"), "1900-03-01");
conferir("2000 é bissexto", proximoDia("2000-02-28"), "2000-02-29");
// Dia que não existe não vira outro dia: devolver "2026-02-30 + 1" seria
// inventar calendário.
conferir("30 de fevereiro não existe", proximoDia("2026-02-30"), "");
conferir("mês 13", proximoDia("2026-13-01"), "");
conferir("dia 0", proximoDia("2026-10-00"), "");
conferir("formato brasileiro", proximoDia("20/10/2026"), "");
conferir("vazio", proximoDia(""), "");

// ── O caso comum: cabe em um dia ────────────────────────────────────────────

conferir(
  "196 com limite 200",
  planoDeDias({ total: 196, limitePorDia: 200, diaInicial: "2026-10-20" }),
  {
    dias: [{ dia: "2026-10-20", quantos: 196 }],
    cobreTudo: true,
    sobraram: 0,
  },
);
// Exatamente no limite ainda é um dia só — o erro clássico é o `<` virar `<=`
// e nascer um segundo dia com zero.
conferir(
  "200 com limite 200",
  planoDeDias({ total: 200, limitePorDia: 200, diaInicial: "2026-10-20" }),
  {
    dias: [{ dia: "2026-10-20", quantos: 200 }],
    cobreTudo: true,
    sobraram: 0,
  },
);

// ── A divisão ───────────────────────────────────────────────────────────────

conferir(
  "500 em três dias",
  planoDeDias({ total: 500, limitePorDia: 200, diaInicial: "2026-10-20" }),
  {
    dias: [
      { dia: "2026-10-20", quantos: 200 },
      { dia: "2026-10-21", quantos: 200 },
      { dia: "2026-10-22", quantos: 100 },
    ],
    cobreTudo: true,
    sobraram: 0,
  },
);
conferir(
  "401 fecha com um só no terceiro dia",
  planoDeDias({ total: 401, limitePorDia: 200, diaInicial: "2026-10-20" }).dias[2],
  {
    dia: "2026-10-22",
    quantos: 1,
  },
);
// A divisão atravessa o mês e o ano sem buraco.
conferir(
  "atravessa o mês",
  planoDeDias({ total: 300, limitePorDia: 200, diaInicial: "2026-10-31" }).dias,
  [
    { dia: "2026-10-31", quantos: 200 },
    { dia: "2026-11-01", quantos: 100 },
  ],
);
conferir(
  "atravessa o ano",
  planoDeDias({ total: 300, limitePorDia: 200, diaInicial: "2026-12-31" }).dias[1].dia,
  "2027-01-01",
);

// ── O que já está reservado ─────────────────────────────────────────────────
//
// É a regra que impede a campanha B de atropelar a campanha A.

conferir(
  "o primeiro dia já tem 196",
  planoDeDias({
    total: 100,
    limitePorDia: 200,
    reservadoPorDia: { "2026-10-20": 196 },
    diaInicial: "2026-10-20",
  }).dias,
  [
    { dia: "2026-10-20", quantos: 4 },
    { dia: "2026-10-21", quantos: 96 },
  ],
);
// Dia cheio é PULADO, não aparece com zero: zero não é dia de envio, e
// mostrá-lo faria a clínica contar dias que não existem.
conferir(
  "dia cheio some do plano",
  planoDeDias({
    total: 50,
    limitePorDia: 200,
    reservadoPorDia: { "2026-10-20": 200 },
    diaInicial: "2026-10-20",
  }).dias,
  [{ dia: "2026-10-21", quantos: 50 }],
);
conferir(
  "dois dias cheios seguidos",
  planoDeDias({
    total: 50,
    limitePorDia: 200,
    reservadoPorDia: { "2026-10-20": 200, "2026-10-21": 250 },
    diaInicial: "2026-10-20",
  }).dias,
  [{ dia: "2026-10-22", quantos: 50 }],
);
// Reserva maior que o limite (a clínica baixou o limite depois de agendar) não
// vira sobra negativa.
conferir(
  "reserva acima do limite não inverte a conta",
  planoDeDias({
    total: 10,
    limitePorDia: 100,
    reservadoPorDia: { "2026-10-20": 500 },
    diaInicial: "2026-10-20",
  }).dias,
  [{ dia: "2026-10-21", quantos: 10 }],
);
conferir(
  "reserva de outro dia não atrapalha",
  planoDeDias({
    total: 100,
    limitePorDia: 200,
    reservadoPorDia: { "2026-11-05": 200 },
    diaInicial: "2026-10-20",
  }).dias,
  [{ dia: "2026-10-20", quantos: 100 }],
);

// ── O teto de dias ──────────────────────────────────────────────────────────

// 60 dias × 200 = 12.000. Com 13.000 o teto é alcançado de verdade — e uma base
// que levaria dois meses para sair não é uma campanha, é outra coisa.
{
  const p = planoDeDias({ total: 13_000, limitePorDia: 200, diaInicial: "2026-10-20" });
  conferir("para no teto", p.dias.length, MAX_DIAS);
  conferir("e diz que não coube", p.cobreTudo, false);
  conferir("com o que sobrou", p.sobraram, 13_000 - MAX_DIAS * 200);
}
// Logo abaixo do teto ainda cobre tudo.
conferir(
  "12.000 cabe nos 60 dias",
  planoDeDias({ total: MAX_DIAS * 200, limitePorDia: 200, diaInicial: "2026-10-20" }).cobreTudo,
  true,
);
conferir(
  "teto próprio",
  planoDeDias({ total: 1000, limitePorDia: 200, diaInicial: "2026-10-20", maxDias: 2 }).dias.length,
  2,
);
// Dia cheio consome o teto do mesmo jeito: o calendário andou.
conferir(
  "dia pulado conta para o teto",
  planoDeDias({
    total: 100,
    limitePorDia: 200,
    reservadoPorDia: { "2026-10-20": 200 },
    diaInicial: "2026-10-20",
    maxDias: 1,
  }),
  { dias: [], cobreTudo: false, sobraram: 100 },
);

// ── Entradas que não deveriam acontecer ─────────────────────────────────────

conferir("limite zero", planoDeDias({ total: 100, limitePorDia: 0, diaInicial: "2026-10-20" }), {
  dias: [],
  cobreTudo: false,
  sobraram: 100,
});
conferir(
  "limite negativo",
  planoDeDias({ total: 100, limitePorDia: -5, diaInicial: "2026-10-20" }).cobreTudo,
  false,
);
conferir("total zero", planoDeDias({ total: 0, limitePorDia: 200, diaInicial: "2026-10-20" }), {
  dias: [],
  cobreTudo: true,
  sobraram: 0,
});
conferir(
  "total negativo",
  planoDeDias({ total: -3, limitePorDia: 200, diaInicial: "2026-10-20" }).dias.length,
  0,
);
conferir("dia inválido", planoDeDias({ total: 100, limitePorDia: 200, diaInicial: "amanhã" }), {
  dias: [],
  cobreTudo: false,
  sobraram: 100,
});
conferir(
  "total quebrado trunca",
  planoDeDias({ total: 2.9, limitePorDia: 200, diaInicial: "2026-10-20" }).dias[0].quantos,
  2,
);

// ── O resumo em uma linha ───────────────────────────────────────────────────

conferir(
  "três dias",
  resumoDoPlano(planoDeDias({ total: 500, limitePorDia: 200, diaInicial: "2026-10-20" })),
  "dia 20: 200 · dia 21: 200 · dia 22: 100",
);
conferir(
  "um dia só",
  resumoDoPlano(planoDeDias({ total: 50, limitePorDia: 200, diaInicial: "2026-10-05" })),
  "dia 05: 50",
);
conferir("plano vazio", resumoDoPlano({ dias: [], cobreTudo: true, sobraram: 0 }), "");

console.log(`ok — ${feitas} checagens do plano de dias`);
