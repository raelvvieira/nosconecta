/**
 * Quando o atendimento concluído vira dinheiro no caixa.
 *
 * ── Por que módulo puro ──────────────────────────────────────────────────
 *
 * A data que sai daqui é a `paid_date` do lançamento, e o financeiro inteiro
 * agrega por ela: o fluxo de caixa por dia, a receita por categoria, a
 * evolução de doze meses, o KPI de "recebido no período". Errar não levanta
 * exceção — move receita de dia, de semana, e na virada do mês, de MÊS.
 *
 * Era exatamente esse o defeito: quem confirmava um atendimento de ontem
 * tinha que ir ao financeiro clicar "marcar como recebido", e aquele botão
 * grava a data de HOJE. Os R$ 450 de uma consulta de 17/09 entravam no caixa
 * do dia 18.
 */

export interface DecisaoDeRecebimento {
  /** Vencimento — o dia do atendimento. */
  dueDate: string;
  /** Dia em que o dinheiro entrou, ou `null` quando fica a receber. */
  paidOn: string | null;
}

/**
 * @param dataDoAtendimento "YYYY-MM-DD" do agendamento, ou nulo.
 * @param hoje "YYYY-MM-DD" no fuso da clínica — nunca UTC. O Worker roda em
 *   UTC e depois das 21h de Brasília o "hoje" dele já é amanhã.
 * @param pagamentoRecebido O que a pessoa marcou na confirmação.
 */
export function decidirRecebimento({
  dataDoAtendimento,
  hoje,
  pagamentoRecebido,
}: {
  dataDoAtendimento: string | null;
  hoje: string;
  pagamentoRecebido: boolean;
}): DecisaoDeRecebimento {
  const dueDate = dataDoAtendimento || hoje;
  if (!pagamentoRecebido) return { dueDate, paidOn: null };

  // Aparado no máximo em hoje. O formulário de confirmação aparece em
  // qualquer agendamento aberto, inclusive um de amanhã — e uma `paid_date`
  // no futuro some do KPI de "recebido no período" (que termina hoje) e
  // reaparece como receita numa data que ainda não chegou.
  //
  // Comparação de texto basta: "YYYY-MM-DD" ordena igual à data.
  return { dueDate, paidOn: dueDate > hoje ? hoje : dueDate };
}

/**
 * O status que a tela mostra, que não é o que está gravado.
 *
 * "Atrasado" não existe no banco: é derivado de pendente + vencido. É por
 * isso que um atendimento de ontem confirmado hoje aparecia em VERMELHO no
 * mesmo minuto em que alguém registrou que ele foi pago.
 */
export function statusEfetivo(
  status: string,
  dueDate: string,
  hoje: string,
): "paid" | "pending" | "overdue" | "cancelled" | string {
  return status === "pending" && dueDate < hoje ? "overdue" : status;
}
