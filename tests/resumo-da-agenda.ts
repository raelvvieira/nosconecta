import {
  comoFoiAAgenda,
  diasUteisEntre,
  mesDe,
  novosNoMes,
  semanaDe,
} from "../src/lib/agenda/resumo-da-agenda.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

// 04/11/2026 é quarta-feira.
conferir("semana de quarta", semanaDe("2026-11-04"), { de: "2026-11-02", ate: "2026-11-08" });
conferir("semana de domingo", semanaDe("2026-11-08"), { de: "2026-11-02", ate: "2026-11-08" });
conferir("mês de novembro", mesDe("2026-11-04"), { de: "2026-11-01", ate: "2026-11-30" });
conferir("mês de fevereiro bissexto", mesDe("2028-02-10").ate, "2028-02-29");
conferir("dias úteis de novembro/2026", diasUteisEntre("2026-11-01", "2026-11-30"), 21);
conferir("dias úteis até quarta 04", diasUteisEntre("2026-11-01", "2026-11-04"), 3);

const a = (
  date: string,
  status: string,
  criadoEm: string | null,
  endTime = "10:00",
  atualizadoEm: string | null = null,
) => ({ date, status, criadoEm, endTime, atualizadoEm });
const lista = [
  a("2026-11-10", "pending", "2026-11-02T13:00:00Z"), // segunda
  a("2026-11-05", "confirmed", "2026-11-04T15:00:00Z"), // hoje
  a("2026-11-06", "confirmed", "2026-11-04T01:30:00Z"), // 22h30 de terça em Brasília
  a("2026-11-06", "cancelled", "2026-11-04T15:00:00Z"), // cancelado não conta
  a("2026-10-30", "completed", "2026-10-28T15:00:00Z"), // mês passado
  a("2026-11-07", "pending", null), // sem data de criação
  a("2026-11-20", "pending", "2026-11-01T15:00:00Z"), // sábado dia 1: no mês, fora da semana
];
const n = novosNoMes(lista, "2026-11-04");
conferir("novos no mês", n.total, 4);
conferir("novos de hoje", n.hoje, 1);
conferir("novos da semana", n.semana, 3);
conferir("meta do mês = 5 x 21", n.meta, 105);
conferir("esperado até quarta (3 dias úteis)", n.esperadoAteHoje, 15);
conferir("saldo", n.saldo, -11);
conferir("abaixo do ritmo", n.noRitmo, false);
conferir("dias úteis restantes contando hoje", n.diasUteisRestantes, 19);
conferir("precisa por dia = ceil(101/19)", n.precisaPorDia, 6);
conferir("domingo: restam 16 dias úteis", novosNoMes([], "2026-11-08").diasUteisRestantes, 16);
conferir(
  "meta batida: precisa 0",
  novosNoMes(
    Array.from({ length: 105 }, () => a("2026-11-20", "pending", "2026-11-03T15:00:00Z")),
    "2026-11-04",
  ).precisaPorDia,
  0,
);

const c = comoFoiAAgenda(
  [
    a("2026-11-02", "completed", null),
    a("2026-11-02", "completed", null),
    a("2026-11-03", "missed", null),
    a("2026-11-03", "confirmed", null), // passou sem baixa
    a("2026-11-04", "confirmed", null, "09:00"), // hoje, já terminou: sem baixa
    a("2026-11-04", "confirmed", null, "17:00"), // hoje, ainda vai acontecer
    a("2026-11-05", "confirmed", null), // amanhã: fora
    a("2026-11-03", "cancelled", null, "10:00", "2026-11-01T12:00:00Z"), // cancelou antes
    a("2026-11-03", "cancelled", null, "10:00", "2026-11-03T12:00:00Z"), // cancelou no dia
    a("2026-10-28", "missed", null), // outro mês
  ],
  "2026-11-04",
  "14:00",
);
conferir("compareceram", c.compareceram, 2);
conferir("faltaram", c.faltaram, 1);
conferir("sem baixa", c.semBaixa, 2);
conferir("cancelaram", c.cancelaram, 2);
conferir("cancelaram no dia", c.cancelaramNoDia, 1);
conferir("comparecimento ignora cancelados", Math.round(c.comparecimentoPct ?? -1), 67);
conferir("cancelamento sobre marcados (2 de 8)", Math.round(c.cancelamentoPct ?? -1), 25);
conferir("sem nada", comoFoiAAgenda([], "2026-11-04", "14:00").comparecimentoPct, null);

if (falhas.length) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
console.log(`ok — ${ok} checagens do resumo da agenda`);
