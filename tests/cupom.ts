// O cupom de desconto: quando vale, quanto desconta, e o piso do Asaas.
//
// O que não pode acontecer: cupom vencido, esgotado, desligado ou de outro
// produto dar desconto; desconto levar a cobrança abaixo de R$ 5,00 (o Asaas
// recusa); "só a primeira" valer para o pacote.
import { avaliarCupom, codigoDoCupom, type Cupom } from "../supabase/functions/_shared/cupom.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

const agora = new Date("2026-10-30T12:00:00Z");
const base: Cupom = {
  codigo: "BEMVINDO",
  tipo: "percentual",
  valor: 20,
  aplicaEm: "tudo",
  soPrimeira: true,
  validoAte: null,
  maxUsos: null,
  usos: 0,
  ativo: true,
};

conferir("código normalizado", codigoDoCupom("  bem vindo "), "BEMVINDO");
conferir("20% de R$ 549", avaliarCupom(base, "assinatura", 54900, agora), {
  ok: true,
  valorFinalCentavos: 43920,
  descontoCentavos: 10980,
  soPrimeira: true,
});
conferir("pacote nunca é 'só a primeira'", avaliarCupom(base, "pacote", 4900, agora), {
  ok: true,
  valorFinalCentavos: 3920,
  descontoCentavos: 980,
  soPrimeira: false,
});
conferir(
  "valor fixo trava no mínimo de R$ 5",
  avaliarCupom({ ...base, tipo: "valor", valor: 10000 }, "pacote", 4900, agora),
  { ok: true, valorFinalCentavos: 500, descontoCentavos: 4400, soPrimeira: false },
);
conferir("sem cupom", avaliarCupom(null, "pacote", 4900, agora), {
  ok: false,
  motivo: "Cupom não encontrado.",
});
conferir("desligado", avaliarCupom({ ...base, ativo: false }, "pacote", 4900, agora).ok, false);
conferir(
  "vencido",
  avaliarCupom({ ...base, validoAte: "2026-10-29T02:59:59Z" }, "pacote", 4900, agora),
  { ok: false, motivo: "Este cupom venceu." },
);
conferir("esgotado", avaliarCupom({ ...base, maxUsos: 3, usos: 3 }, "pacote", 4900, agora), {
  ok: false,
  motivo: "Este cupom já foi usado o máximo de vezes.",
});
conferir(
  "só assinatura, no pacote",
  avaliarCupom({ ...base, aplicaEm: "assinatura" }, "pacote", 4900, agora),
  { ok: false, motivo: "Este cupom vale só para a assinatura." },
);
conferir(
  "só pacote, na assinatura",
  avaliarCupom({ ...base, aplicaEm: "pacote" }, "assinatura", 54900, agora),
  { ok: false, motivo: "Este cupom vale só para o pacote de conversas." },
);
conferir(
  "no último dia ainda vale",
  avaliarCupom({ ...base, validoAte: "2026-10-31T02:59:59Z" }, "pacote", 4900, agora).ok,
  true,
);

if (falhas.length) {
  console.error(`cupom: ${falhas.length} falha(s)\n` + falhas.join("\n"));
  process.exit(1);
}
console.log(`cupom: ${ok} checagens ok`);
