// "editada" só aparece quando a alteração veio bem depois de a anotação nascer:
// gravar e corrigir um erro de digitação no mesmo minuto não é "edição".
import { foiEditada } from "../src/lib/patients/anotacao.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

const criada = "2026-11-04T10:00:00.000Z";
conferir("nunca editada", foiEditada({ createdAt: criada, updatedAt: criada }), false);
conferir(
  "corrigida em 30 segundos",
  foiEditada({ createdAt: criada, updatedAt: "2026-11-04T10:00:30.000Z" }),
  false,
);
conferir(
  "editada no dia seguinte",
  foiEditada({ createdAt: criada, updatedAt: "2026-11-05T09:00:00.000Z" }),
  true,
);
conferir(
  "exatamente 1 minuto ainda não conta",
  foiEditada({ createdAt: criada, updatedAt: "2026-11-04T10:01:00.000Z" }),
  false,
);
conferir(
  "um segundo depois do minuto conta",
  foiEditada({ createdAt: criada, updatedAt: "2026-11-04T10:01:01.000Z" }),
  true,
);

if (falhas.length) {
  console.error(`${falhas.length} falha(s):\n  - ${falhas.join("\n  - ")}`);
  process.exit(1);
}
console.log(`ok — ${ok} checagens da anotação do dente`);
