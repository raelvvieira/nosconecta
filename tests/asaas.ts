// O pagamento pelo Asaas: a referência que liga o pagamento ao consultório,
// o "pago até" de cada renovação, e quando o atraso fecha o sistema.
//
// O que não pode acontecer: um pagamento cair no consultório errado; o mesmo
// pagamento valer dois meses; um cartão recusado fechar o consultório no dia
// seguinte; a NÓS (sem "pago até") ser fechada por atraso.
import {
  baseDaApi,
  cicloDoAsaas,
  lerReferencia,
  maisTarde,
  pagoAteDoVencimento,
  referenciaDaAssinatura,
  referenciaDoPacote,
  tokenConfere,
} from "../supabase/functions/_shared/asaas.ts";
import {
  consultorioParado,
  pagamentoAtrasado,
  semIaPorque,
} from "../supabase/functions/_shared/plano-do-consultorio.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else
    falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

const DONO = "a206246b-a797-48af-93f7-7dc6db3a266d";

// ── Referência ───────────────────────────────────────────────────────────
conferir("assinatura vai e volta", lerReferencia(referenciaDaAssinatura(DONO, "ia", "anual")), {
  tipo: "assinatura",
  ownerId: DONO,
  plano: "ia",
  ciclo: "anual",
});
conferir("pacote vai e volta", lerReferencia(referenciaDoPacote(DONO, 500)), {
  tipo: "pacote",
  ownerId: DONO,
  conversas: 500,
});
conferir("referência de outro sistema", lerReferencia("056984"), null);
conferir("dono que não é uuid", lerReferencia("pacote:abc:500"), null);
conferir("plano inventado", lerReferencia(`assinatura:${DONO}:ouro:mensal`), null);
conferir("pacote de zero", lerReferencia(`pacote:${DONO}:0`), null);
conferir("vazio", lerReferencia(null), null);

// ── Ciclo e "pago até" ───────────────────────────────────────────────────
conferir("ciclo mensal", cicloDoAsaas("mensal"), "MONTHLY");
conferir("ciclo anual", cicloDoAsaas("anual"), "YEARLY");
conferir(
  "mensal: mesmo dia do mês seguinte, fim do dia em Brasília",
  pagoAteDoVencimento("2026-10-30", "mensal"),
  "2026-12-01T02:59:59.000Z",
);
conferir(
  "31 de janeiro + 1 mês cai em 28 de fevereiro",
  pagoAteDoVencimento("2027-01-31", "mensal"),
  "2027-03-01T02:59:59.000Z",
);
conferir(
  "dezembro vira janeiro do ano seguinte",
  pagoAteDoVencimento("2026-12-15", "mensal"),
  "2027-01-16T02:59:59.000Z",
);
conferir("anual", pagoAteDoVencimento("2026-10-30", "anual"), "2027-10-31T02:59:59.000Z");
const a = pagoAteDoVencimento("2026-10-30", "mensal");
conferir(
  "o mesmo evento duas vezes dá o mesmo dia",
  pagoAteDoVencimento("2026-10-30", "mensal"),
  a,
);
conferir("evento velho não encurta", maisTarde(a, pagoAteDoVencimento("2026-09-30", "mensal")), a);
conferir("sem pago até, vale o novo", maisTarde(null, a), a);

// ── Atraso ───────────────────────────────────────────────────────────────
const pagoAte = "2026-11-30T02:59:59.000Z";
conferir(
  "no dia seguinte ao vencimento, ainda não",
  pagamentoAtrasado(pagoAte, new Date("2026-12-01T12:00:00Z")),
  false,
);
conferir(
  "7 dias depois, ainda não",
  pagamentoAtrasado(pagoAte, new Date("2026-12-06T12:00:00Z")),
  false,
);
conferir(
  "passou da folga, atrasado",
  pagamentoAtrasado(pagoAte, new Date("2026-12-08T12:00:00Z")),
  true,
);
conferir("sem pago até, nunca atrasa", pagamentoAtrasado(null, new Date("2099-01-01")), false);
const depois = new Date("2026-12-10T12:00:00Z");
conferir(
  "ativo e atrasado: para o sistema",
  consultorioParado({ plano: "ia", situacao: "ativa", teste_ate: null, pago_ate: pagoAte }, depois),
  true,
);
conferir(
  "ativo e atrasado: sem assistente",
  semIaPorque({ plano: "ia", situacao: "ativa", teste_ate: null, pago_ate: pagoAte }, depois),
  "pagamento atrasado",
);
conferir(
  "a NÓS (sem pago até) segue",
  consultorioParado({ plano: "ia", situacao: "ativa", teste_ate: null, pago_ate: null }, depois),
  false,
);

// ── Porta do webhook e ambiente ──────────────────────────────────────────
conferir("token certo", tokenConfere("abc123", "abc123"), true);
conferir("token errado", tokenConfere("abc124", "abc123"), false);
conferir("sem token", tokenConfere(null, "abc123"), false);
conferir("sem segredo cadastrado, ninguém passa", tokenConfere("", ""), false);
conferir("sandbox é o padrão", baseDaApi(undefined), "https://api-sandbox.asaas.com/v3");
conferir("produção só quando dito", baseDaApi("producao"), "https://api.asaas.com/v3");

if (falhas.length) {
  console.error(`asaas: ${falhas.length} falha(s)\n` + falhas.join("\n"));
  process.exit(1);
}
console.log(`asaas: ${ok} checagens ok`);
