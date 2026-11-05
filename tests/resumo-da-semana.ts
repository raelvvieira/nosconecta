import {
  comparecimentoDaSemana,
  novosNaSemana,
  semanaDe,
} from "../src/lib/agenda/resumo-da-semana.ts";

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
conferir("semana de segunda", semanaDe("2026-11-02"), { de: "2026-11-02", ate: "2026-11-08" });

const a = (date: string, status: string, criadoEm: string | null, endTime = "10:00") => ({
  date,
  status,
  criadoEm,
  endTime,
});
const lista = [
  a("2026-11-10", "pending", "2026-11-02T13:00:00Z"), // criado segunda
  a("2026-11-05", "confirmed", "2026-11-04T15:00:00Z"), // criado hoje
  a("2026-11-06", "confirmed", "2026-11-04T01:30:00Z"), // 22h30 de terça em Brasília
  a("2026-11-06", "cancelled", "2026-11-04T15:00:00Z"), // cancelado não conta
  a("2026-10-30", "completed", "2026-10-28T15:00:00Z"), // semana passada
  a("2026-11-07", "pending", null), // sem data de criação
];
const n = novosNaSemana(lista, "2026-11-04");
conferir("novos na semana", n.total, 3);
conferir("novos de hoje", n.hoje, 1);
conferir("esperado até quarta", n.esperadoAteHoje, 15);
conferir("abaixo do ritmo", n.noRitmo, false);
conferir("domingo espera 25", novosNaSemana([], "2026-11-08").esperadoAteHoje, 25);

const c = comparecimentoDaSemana(
  [
    a("2026-11-02", "completed", null),
    a("2026-11-02", "completed", null),
    a("2026-11-03", "missed", null),
    a("2026-11-03", "confirmed", null), // passou sem baixa
    a("2026-11-04", "confirmed", null, "09:00"), // hoje, já terminou
    a("2026-11-04", "confirmed", null, "17:00"), // hoje, ainda vai acontecer
    a("2026-11-05", "confirmed", null), // amanhã
    a("2026-11-03", "cancelled", null),
    a("2026-10-28", "missed", null), // semana passada
  ],
  "2026-11-04",
  "14:00",
);
conferir("compareceram", c.compareceram, 2);
conferir("faltaram", c.faltaram, 1);
conferir("sem baixa", c.semBaixa, 2);
conferir("taxa", Math.round(c.pct ?? -1), 67);
conferir("sem resultado nenhum", comparecimentoDaSemana([], "2026-11-04", "14:00").pct, null);

if (falhas.length) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
console.log(`ok — ${ok} checagens do resumo da semana`);
