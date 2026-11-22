// O sinal: soma, saldo e a recusa de sinal maior que o total.
import { recusaDoSinal, saldoAReceber, somaDosSinais } from "../src/lib/agenda/sinal.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(
      `${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(esperado === obtido ? "" : obtido)}`,
    );
}

conferir("soma vazia", somaDosSinais([]), 0);
conferir("soma simples", somaDosSinais([{ valor: 150 }]), 150);
conferir("soma sem erro de centavo", somaDosSinais([{ valor: 0.1 }, { valor: 0.2 }]), 0.3);
conferir("saldo = total - sinal", saldoAReceber(1390, [{ valor: 150 }]), 1240);
conferir("saldo sem sinal", saldoAReceber(1390, []), 1390);
conferir("saldo com dois sinais", saldoAReceber(1000, [{ valor: 100.5 }, { valor: 49.5 }]), 850);
conferir("saldo nunca negativo", saldoAReceber(100, [{ valor: 150 }]), 0);
conferir("saldo zero quando pagou tudo", saldoAReceber(150, [{ valor: 150 }]), 0);

conferir("sinal válido", recusaDoSinal({ valor: 150, total: 1390, jaRegistrado: [] }), null);
conferir(
  "zero recusado",
  typeof recusaDoSinal({ valor: 0, total: 1390, jaRegistrado: [] }),
  "string",
);
conferir(
  "negativo recusado",
  typeof recusaDoSinal({ valor: -5, total: 1390, jaRegistrado: [] }),
  "string",
);
conferir(
  "NaN recusado",
  typeof recusaDoSinal({ valor: NaN, total: 1390, jaRegistrado: [] }),
  "string",
);
conferir(
  "maior que o total recusado",
  typeof recusaDoSinal({ valor: 1500, total: 1390, jaRegistrado: [] }),
  "string",
);
conferir(
  "igual ao total passa",
  recusaDoSinal({ valor: 1390, total: 1390, jaRegistrado: [] }),
  null,
);
conferir(
  "soma com o já registrado estoura",
  typeof recusaDoSinal({ valor: 100, total: 200, jaRegistrado: [{ valor: 150 }] }),
  "string",
);
conferir(
  "total desconhecido deixa passar",
  recusaDoSinal({ valor: 150, total: 0, jaRegistrado: [] }),
  null,
);

if (falhas.length) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
console.log(`sinal: ${ok} checagens ok`);
