// As contas do painel de Gestão (src/lib/gestao/indicadores.ts).
import {
  diasDoMes,
  margemEmPct,
  minutosAgendados,
  minutosDeCapacidade,
  novosERecorrentes,
  ocupacaoEmPct,
  primeiroAtendimento,
  taxaDePerdidos,
  ticketMedio,
  variacao,
  type AtendimentoDoPainel,
  type UnidadeParaCapacidade,
} from "../src/lib/gestao/indicadores.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}
const perto = (nome: string, obtido: number | null, esperado: number) =>
  conferir(nome, obtido !== null && Math.abs(obtido - esperado) < 1e-6, true);

// ── Variação ────────────────────────────────────────────────────────────
conferir("variação normal", variacao(120, 100).deltaPct, 20);
conferir("queda", variacao(80, 100).deltaPct, -20);
conferir("base zero não inventa %", variacao(50, 0).deltaPct, null);
conferir("sem anterior", variacao(50, null).deltaPct, null);
// De −10 para −5 melhorou: a base é em módulo.
conferir("prejuízo que diminui sobe", variacao(-5, -10).deltaPct, 50);
conferir("em pontos percentuais", variacao(25, 26.4).deltaAbs !== null, true);
perto("p.p. da margem", variacao(25, 26.4).deltaAbs, -1.4);

// ── Margem ──────────────────────────────────────────────────────────────
perto("margem 25%", margemEmPct(10_700, 42_800), 25);
conferir("margem sem receita", margemEmPct(-500, 0), null);
// O exemplo do enunciado: mais receita, menos lucro, margem metade.
perto("cenário A", margemEmPct(9_000, 30_000), 30);
perto("cenário B", margemEmPct(7_500, 50_000), 15);

// ── Capacidade ──────────────────────────────────────────────────────────
conferir("dias de novembro", diasDoMes("2026-11"), 30);
conferir("dias de fevereiro bissexto", diasDoMes("2028-02"), 29);

const seg_sab = (opens: string, closes: string) =>
  [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, modo: "aberto", opens, closes }));
const floripa: UnidadeParaCapacidade = {
  id: "f",
  cadeiras: 2,
  horarios: [
    ...seg_sab("09:00:00", "18:00:00"),
    { weekday: 0, modo: "fechado", opens: null, closes: null },
  ],
};
// Novembro/2026: começa numa domingo (1º) e tem 30 dias → 4 domingos (1,8,15,22,29 = 5).
// Dias abertos (seg–sáb) = 30 − 5 domingos = 25. 25 × 9h × 60 × 2 cadeiras.
conferir(
  "capacidade do mês inteiro",
  minutosDeCapacidade("2026-11", "2026-11-30", [floripa]),
  25 * 540 * 2,
);
// Até o dia 7 (sáb): dias 2 a 7 abertos = 6 dias.
conferir(
  "capacidade até o dia 7",
  minutosDeCapacidade("2026-11", "2026-11-07", [floripa]),
  6 * 540 * 2,
);
conferir("mês que ainda não começou", minutosDeCapacidade("2026-12", "2026-11-30", [floripa]), 0);
conferir(
  "sem cadeira cadastrada conta uma",
  minutosDeCapacidade("2026-11", "2026-11-02", [{ ...floripa, cadeiras: 0 }]),
  540,
);
conferir(
  "horário sem abertura é ignorado",
  minutosDeCapacidade("2026-11", "2026-11-30", [
    { id: "x", cadeiras: 2, horarios: [{ weekday: 1, modo: "aberto", opens: null, closes: null }] },
  ]),
  0,
);
conferir(
  "duas unidades somam",
  minutosDeCapacidade("2026-11", "2026-11-02", [floripa, { ...floripa, id: "p", cadeiras: 1 }]),
  540 * 2 + 540,
);

// Unidade de viagem: só conta nas datas marcadas.
const portoAlegre: UnidadeParaCapacidade = {
  id: "p",
  cadeiras: 2,
  horarios: seg_sab("09:00", "18:00"),
  diasMarcados: ["2026-11-03", "2026-11-04"],
};
conferir(
  "por data conta só as datas marcadas",
  minutosDeCapacidade("2026-11", "2026-11-30", [portoAlegre]),
  2 * 540 * 2,
);
conferir(
  "por data respeita o limite do dia",
  minutosDeCapacidade("2026-11", "2026-11-03", [portoAlegre]),
  540 * 2,
);
conferir(
  "por data sem nenhuma data não oferece horário",
  minutosDeCapacidade("2026-11", "2026-11-30", [{ ...portoAlegre, diasMarcados: [] }]),
  0,
);
conferir(
  "data marcada num dia fechado não conta",
  minutosDeCapacidade("2026-11", "2026-11-30", [{ ...portoAlegre, diasMarcados: ["2026-11-01"] }]),
  0,
);

// ── Ocupação e faltas ───────────────────────────────────────────────────
const ap = (
  id: string,
  status: string,
  ini = "10:00",
  fim = "11:00",
  extra: Partial<AtendimentoDoPainel> = {},
): AtendimentoDoPainel => ({
  id,
  unitId: "f",
  patientId: id,
  date: "2026-11-03",
  startTime: ini,
  endTime: fim,
  status,
  receita: 0,
  ...extra,
});
conferir(
  "cancelado e falta não ocupam",
  minutosAgendados([
    ap("1", "completed"),
    ap("2", "cancelled"),
    ap("3", "missed"),
    ap("4", "confirmed", "14:00", "15:30"),
  ]),
  60 + 90,
);
perto("ocupação 50%", ocupacaoEmPct(540, 1080), 50);
conferir("ocupação sem capacidade", ocupacaoEmPct(540, 0), null);
perto(
  "faltas 25%",
  taxaDePerdidos(
    [ap("1", "completed"), ap("2", "cancelled"), ap("3", "confirmed"), ap("4", "confirmed")],
    "2026-11-30",
  ),
  25,
);
conferir(
  "faltas ignora o futuro",
  taxaDePerdidos([ap("1", "pending", "10:00", "11:00", { date: "2026-12-10" })], "2026-11-30"),
  null,
);

// ── Pacientes ───────────────────────────────────────────────────────────
const conc = [
  { patientId: "a", unitId: "f", date: "2026-09-10" },
  { patientId: "a", unitId: "f", date: "2026-10-20" },
  { patientId: "b", unitId: "f", date: "2026-10-05" },
  { patientId: "c", unitId: "p", date: "2026-11-02" },
];
const primeiros = primeiroAtendimento(conc);
conferir("primeiro atendimento de a", primeiros.get("a")?.date, "2026-09-10");
const outubro = [
  ap("a", "completed", "10:00", "11:00", { patientId: "a", date: "2026-10-20", receita: 300 }),
  ap("b", "completed", "10:00", "11:00", { patientId: "b", date: "2026-10-05", receita: 500 }),
  ap("x", "confirmed", "10:00", "11:00", { patientId: "x", date: "2026-10-06", receita: 999 }),
];
const nr = novosERecorrentes(outubro, primeiros, "2026-10");
conferir("um novo e um recorrente em outubro", [nr.novos, nr.recorrentes], [1, 1]);
conferir("receita de cada grupo", [nr.receitaNovos, nr.receitaRecorrentes], [500, 300]);
conferir("só concluído conta como paciente do mês", nr.novos + nr.recorrentes, 2);
perto("ticket médio", ticketMedio(outubro), 400);
conferir("ticket sem atendimentos", ticketMedio([ap("1", "pending")]), null);

if (falhas.length) {
  console.error(`${falhas.length} falha(s):\n  - ${falhas.join("\n  - ")}`);
  process.exit(1);
}
console.log(`ok — ${ok} checagens do painel de gestão`);
