import {
  categoriaDaSala,
  horasEntre,
  podeCancelar,
  recusaDoPedido,
  sobrepoe,
  totalDaLocacao,
} from "../src/lib/locacao/regras.ts";

let ok = 0;
const falhas: string[] = [];
function c(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

c("categoria estética", categoriaDaSala("Maca de Estética"), "estetica");
c("categoria odonto", categoriaDaSala("Cadeira Odontológica "), "odontologia");
c("categoria odonto 2", categoriaDaSala("Cadeira de Odontologia"), "odontologia");
c("categoria outra", categoriaDaSala("Sala 3"), "outra");

c("horas 2h30", horasEntre("2026-12-01T09:00", "2026-12-01T11:30"), 2.5);
c(
  "encostar não sobrepõe",
  sobrepoe(
    { inicio: "2026-12-01T09:00", fim: "2026-12-01T10:00" },
    { inicio: "2026-12-01T10:00", fim: "2026-12-01T11:00" },
  ),
  false,
);
c(
  "sobrepõe",
  sobrepoe(
    { inicio: "2026-12-01T09:00", fim: "2026-12-01T10:30" },
    { inicio: "2026-12-01T10:00", fim: "2026-12-01T11:00" },
  ),
  true,
);

const agora = "2026-12-01T08:00";
c("pedido ok", recusaDoPedido("2026-12-02T09:00", "2026-12-02T12:00", agora), null);
c("fim antes", recusaDoPedido("2026-12-02T12:00", "2026-12-02T09:00", agora) !== null, true);
c("passado", recusaDoPedido("2026-12-01T07:00", "2026-12-01T09:00", agora) !== null, true);
c(
  "meia hora quebrada",
  recusaDoPedido("2026-12-02T09:10", "2026-12-02T10:00", agora) !== null,
  true,
);
c("vira o dia", recusaDoPedido("2026-12-02T20:00", "2026-12-03T01:00", agora) !== null, true);
c("lixo", recusaDoPedido("x", "y", agora), "Horário inválido.");

c("cancela 25h antes", podeCancelar("2026-12-02T09:00", "2026-12-01T08:00"), true);
c("cancela 23h antes", podeCancelar("2026-12-02T07:00", "2026-12-01T08:00"), false);

c("total 2,5h x 50", totalDaLocacao(2.5, 50), 125);
c("total 3h x 47,5", totalDaLocacao(3, 47.5), 142.5);
c("total zero horas", totalDaLocacao(0, 50), 0);

if (falhas.length) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
console.log(`locacao: ${ok} checagens ok`);
