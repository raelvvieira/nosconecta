import { metaDoMes } from "../src/lib/gestao/meta.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

// Novembro/2026 tem 21 dias úteis; até quarta 04 já passaram 3.
const m = metaDoMes({
  meta: 63_000,
  faturado: 7_648,
  ticketMedio: 760,
  mes: "2026-11",
  hoje: "2026-11-04",
});
conferir("pct", Math.round(m.pct), 12);
conferir("faltam", m.faltam, 55_352);
conferir("esperado até hoje = 63000 x 3/21", m.esperadoAteHoje, 9_000);
conferir("abaixo do ritmo", m.noRitmo, false);
conferir("projeção = 7648/3 x 21", Math.round(m.projecao ?? 0), 53_536);
conferir("atendimentos que faltam", m.atendimentosQueFaltam, 73);
conferir("em andamento", m.emAndamento, true);

const mesPassado = metaDoMes({
  meta: 60_000,
  faturado: 17_468,
  ticketMedio: 761,
  mes: "2026-10",
  hoje: "2026-11-04",
});
conferir("mês passado: sem projeção", mesPassado.projecao, null);
conferir("mês passado: não está em andamento", mesPassado.emAndamento, false);
conferir("mês passado: não bateu", mesPassado.noRitmo, false);
conferir(
  "meta batida",
  metaDoMes({ meta: 1000, faturado: 1200, ticketMedio: 100, mes: "2026-11", hoje: "2026-11-04" })
    .atingida,
  true,
);
conferir(
  "sem ticket",
  metaDoMes({ meta: 1000, faturado: 0, ticketMedio: null, mes: "2026-11", hoje: "2026-11-04" })
    .atendimentosQueFaltam,
  null,
);
conferir(
  "antes do mês: sem projeção",
  metaDoMes({ meta: 1000, faturado: 0, ticketMedio: 100, mes: "2026-12", hoje: "2026-11-04" })
    .projecao,
  null,
);

if (falhas.length) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
console.log(`ok — ${ok} checagens da meta de faturamento`);
