// Pagamento em duas formas: a divisão e as recusas.
import {
  dividirPagamento,
  recusaDoSegundoPagamento,
} from "../src/lib/agenda/pagamento-dividido.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

conferir("sem segunda", dividirPagamento(1000, null), { primeira: 1000, segunda: 0 });
conferir("divide", dividirPagamento(1000, { valor: 400 }), { primeira: 600, segunda: 400 });
conferir("centavos", dividirPagamento(100.1, { valor: 33.33 }), {
  primeira: 66.77,
  segunda: 33.33,
});
conferir("segunda igual ao total é ignorada", dividirPagamento(500, { valor: 500 }), {
  primeira: 500,
  segunda: 0,
});
conferir("segunda maior é ignorada", dividirPagamento(500, { valor: 900 }), {
  primeira: 500,
  segunda: 0,
});
conferir("segunda zero é ignorada", dividirPagamento(500, { valor: 0 }), {
  primeira: 500,
  segunda: 0,
});
conferir("a receber zero", dividirPagamento(0, { valor: 10 }), { primeira: 0, segunda: 0 });
const d = dividirPagamento(1240, { valor: 617.45 });
conferir("a soma bate", Math.round((d.primeira + d.segunda) * 100), 124000);

conferir("recusa: nulo passa", recusaDoSegundoPagamento(100, null), null);
conferir("recusa: válido passa", recusaDoSegundoPagamento(100, { valor: 40 }), null);
conferir("recusa: zero", typeof recusaDoSegundoPagamento(100, { valor: 0 }), "string");
conferir("recusa: NaN", typeof recusaDoSegundoPagamento(100, { valor: NaN }), "string");
conferir("recusa: igual", typeof recusaDoSegundoPagamento(100, { valor: 100 }), "string");
conferir("recusa: maior", typeof recusaDoSegundoPagamento(100, { valor: 150 }), "string");

if (falhas.length) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
console.log(`pagamento-dividido: ${ok} checagens ok`);
