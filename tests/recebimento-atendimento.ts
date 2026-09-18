// Checagens de quando o atendimento vira dinheiro no caixa.
//
// A data que sai daqui é a `paid_date`, e o financeiro inteiro agrega por
// ela — fluxo de caixa por dia, receita por categoria, evolução de doze
// meses, KPI de "recebido no período". Errar move receita de dia, de semana
// e, na virada do mês, de mês.
import {
  decidirRecebimento,
  statusEfetivo,
} from "../src/lib/finance/recebimento-do-atendimento.ts";

let ok = 0;
const falhas: string[] = [];
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else falhas.push(`${nome} — esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
}

// ── O bug de produção, virado teste ──────────────────────────────────────
// Julio Cesar Loch: atendimento em 17/09, confirmado em 18/09. O sistema
// gravava paid_date 18/09 e jogava R$ 450 no caixa do dia errado.
conferir(
  "atendimento de ontem confirmado hoje paga NA DATA DO ATENDIMENTO",
  decidirRecebimento({ dataDoAtendimento: "2026-09-17", hoje: "2026-09-18", pagamentoRecebido: true }),
  { dueDate: "2026-09-17", paidOn: "2026-09-17" },
);

conferir(
  "atendimento de hoje: vence e paga hoje",
  decidirRecebimento({ dataDoAtendimento: "2026-09-18", hoje: "2026-09-18", pagamentoRecebido: true }),
  { dueDate: "2026-09-18", paidOn: "2026-09-18" },
);

// O caso do plano de tratamento: procedimento feito, pagamento combinado
// para depois. É a válvula de escape do switch.
conferir(
  "não recebido fica a receber, com o vencimento intacto",
  decidirRecebimento({ dataDoAtendimento: "2026-09-17", hoje: "2026-09-18", pagamentoRecebido: false }),
  { dueDate: "2026-09-17", paidOn: null },
);

// Confirmar um agendamento de amanhã é possível pela tela. Sem aparar, a
// `paid_date` nasceria no futuro: some do KPI (que termina hoje) e reaparece
// como receita numa data que ainda não chegou.
conferir(
  "data futura é aparada em hoje, mas o vencimento continua o do atendimento",
  decidirRecebimento({ dataDoAtendimento: "2026-09-25", hoje: "2026-09-18", pagamentoRecebido: true }),
  { dueDate: "2026-09-25", paidOn: "2026-09-18" },
);

conferir(
  "sem data de atendimento, vence e paga hoje",
  decidirRecebimento({ dataDoAtendimento: null, hoje: "2026-09-18", pagamentoRecebido: true }),
  { dueDate: "2026-09-18", paidOn: "2026-09-18" },
);
conferir(
  "data vazia conta como ausente",
  decidirRecebimento({ dataDoAtendimento: "", hoje: "2026-09-18", pagamentoRecebido: true }),
  { dueDate: "2026-09-18", paidOn: "2026-09-18" },
);

// ── A virada do mês, que é onde o erro deixa de ser detalhe ──────────────
conferir(
  "atendimento de 30/09 confirmado em 01/10 fica em SETEMBRO",
  decidirRecebimento({ dataDoAtendimento: "2026-09-30", hoje: "2026-10-01", pagamentoRecebido: true }),
  { dueDate: "2026-09-30", paidOn: "2026-09-30" },
);
// E a virada do ano, pelo mesmo motivo — comparação de texto em "YYYY-MM-DD"
// ordena igual à data, inclusive atravessando o ano.
conferir(
  "atendimento de 31/12 confirmado em 02/01 fica em dezembro",
  decidirRecebimento({ dataDoAtendimento: "2026-12-31", hoje: "2027-01-02", pagamentoRecebido: true }),
  { dueDate: "2026-12-31", paidOn: "2026-12-31" },
);

// ── O "Atrasado" vermelho que some ───────────────────────────────────────
conferir("pendente e vencido aparece como atrasado", statusEfetivo("pending", "2026-09-17", "2026-09-18"), "overdue");
// Vencer HOJE ainda é pendente: a comparação é estrita, e o dia não acabou.
conferir("pendente vencendo hoje ainda é pendente", statusEfetivo("pending", "2026-09-18", "2026-09-18"), "pending");
conferir("pago e vencido continua pago — o vermelho some", statusEfetivo("paid", "2026-09-17", "2026-09-18"), "paid");
conferir("cancelado não vira atrasado", statusEfetivo("cancelled", "2026-01-01", "2026-09-18"), "cancelled");

if (falhas.length) {
  console.error(`FALHOU (${falhas.length}):`);
  for (const f of falhas) console.error("  - " + f);
  process.exit(1);
}
console.log(`ok — ${ok} checagens do recebimento do atendimento`);
