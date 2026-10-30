// O gasto conferido vira linha no financeiro.
//
// Irmão de `por-na-agenda.ts`, e pelo mesmo motivo de existir: o webhook roda
// em Deno com service role e não pode chamar as server functions de `src/`,
// que exigem sessão de usuário. Então a escrita acontece aqui, e aqui é o
// único lugar onde ela acontece — duas cópias divergem em silêncio.
//
// ── O que este arquivo NÃO faz ──────────────────────────────────────────
//
// Não decide se é gasto, não escolhe categoria, não calcula data. Tudo isso é
// `gasto-da-conversa.ts`, que é puro e tem 153 testes. Aqui chega um
// `GastoConferido` e sai uma linha, ou um erro com motivo.
//
// A divisão não é estética: a parte que decide tem de poder ser exercitada mil
// vezes sem banco, e a parte que grava tem de ser pequena o bastante para caber
// na cabeça de quem for ler o dia em que um número estiver errado.

import type { GastoConferido } from "./gasto-da-conversa.ts";

export interface Lancado {
  ok: boolean;
  transactionId: string | null;
  motivo: string;
}

/**
 * Grava a despesa.
 *
 * As colunas obrigatórias de `financial_transactions` são `type`, `status`,
 * `description`, `amount`, `due_date` e `unit_id`. Esta última é a que morde:
 * é NOT NULL e não tem valor padrão, e foi exatamente assim que um agendamento
 * da Luna ficou sem paciente em outubro — a coluna obrigatória omitida, o
 * insert recusado, e o silêncio. Por isso `unitId` entra como parâmetro
 * obrigatório e vem do cadastro do grupo, nunca de um palpite.
 */
export async function lancarNoFinanceiro(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ownerId: string,
  unitId: string,
  gasto: GastoConferido,
  origem: { quem: string | null; mensagem: string },
): Promise<Lancado> {
  if (!unitId) {
    return { ok: false, transactionId: null, motivo: "grupo sem unidade configurada" };
  }
  // Nada é gravado enquanto faltar conta ou forma de pagamento. Esta é a
  // última porta: quem chama já devia ter perguntado no grupo, e se chegou
  // aqui com buraco é defeito — melhor recusar do que gravar uma despesa que
  // não saiu de lugar nenhum.
  if (gasto.faltando.length) {
    return {
      ok: false,
      transactionId: null,
      motivo: `falta ${gasto.faltando.join(" e ")}`,
    };
  }
  // A data é NOT NULL em `due_date`, e `faltando` já a cobre — esta linha é a
  // segunda porta, que existe para o compilador e para o dia em que alguém
  // mexer na primeira.
  if (!gasto.data) {
    return { ok: false, transactionId: null, motivo: "falta data" };
  }

  // De onde veio, escrito na própria linha. Quem abrir a tela de Pagamentos
  // daqui a três meses vê "lançado pelo WhatsApp por Rael" e sabe onde
  // procurar o original — sem isso a linha parece ter brotado sozinha.
  const nota = [
    `Lançado pelo grupo do financeiro${origem.quem ? ` por ${origem.quem}` : ""}.`,
    `Mensagem: "${origem.mensagem.slice(0, 200)}"`,
  ].join("\n");

  // Uma linha só, com o total e o número de parcelas — e não N linhas, uma por
  // parcela, como a tela de Pagamentos faz. É de propósito: a tela sabe o
  // vencimento de cada parcela porque alguém digitou, e aqui ninguém digitou.
  // Inventar doze vencimentos a partir de "em 12x" poria onze datas erradas no
  // fluxo de caixa. O total e o `installment_total` são verdade; o resto seria
  // palpite.

  const linha = {
    owner_id: ownerId,
    unit_id: unitId,
    account_id: gasto.contaId,
    // Traduzidos por `comoGravar`, no gêmeo em Deno de
    // `src/lib/agenda/forma-de-pagamento.ts` — são os mesmos valores que o
    // filtro da tela de Recebimentos compara.
    payment_method: gasto.paymentMethod,
    installment_total: gasto.installmentTotal,
    type: "payable",
    // Despesa já paga entra como paga na data do gasto; conta a vencer entra
    // pendente com aquele vencimento. São os dois estados que o painel conhece.
    status: gasto.pago ? "paid" : "pending",
    description: gasto.descricao,
    amount: gasto.valor,
    due_date: gasto.data,
    paid_date: gasto.pago ? gasto.data : null,
    category_id: gasto.categoriaId,
    supplier_name: gasto.fornecedor,
    notes: nota,
  };

  const { data, error } = await supabase
    .from("financial_transactions")
    .insert(linha)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[financeiro-do-grupo] não deu para lançar:", error.message);
    return { ok: false, transactionId: null, motivo: error.message };
  }
  return { ok: true, transactionId: data?.id ? String(data.id) : null, motivo: "lançado" };
}

/**
 * Desfaz um lançamento.
 *
 * Apaga a linha, não marca como cancelada. A diferença importa: uma despesa
 * `cancelled` continua aparecendo em listagens e relatórios que filtram por
 * outra coisa, e o robô errou — o certo é a linha nunca ter existido. O
 * registro de que ela existiu fica em `financeiro_do_grupo`, que é onde se
 * audita o robô.
 */
export async function desfazerLancamento(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ownerId: string,
  transactionId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("financial_transactions")
    .delete()
    .eq("id", transactionId)
    .eq("owner_id", ownerId);
  if (error) {
    console.error("[financeiro-do-grupo] não deu para desfazer:", error.message);
    return false;
  }
  return true;
}

/**
 * Dá baixa numa conta que já estava prevista: o aluguel, a luz.
 *
 * Em vez de inserir uma despesa nova (que duplicaria a conta: a prevista
 * continuaria aberta), atualiza a prevista com o que de fato aconteceu: pago,
 * na data do pagamento, com o valor pago (o comprovante manda, não a
 * previsão), de qual conta saiu e como. A nota de antes não se perde: o
 * registro do grupo vai embaixo dela.
 *
 * Só baixa o que ainda está em aberto (pendente ou vencido): duas
 * confirmações seguidas não pagam a mesma conta duas vezes.
 */
export async function darBaixaNaPrevista(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ownerId: string,
  gasto: GastoConferido,
  origem: { quem: string | null; mensagem: string },
): Promise<Lancado> {
  const prevista = gasto.prevista;
  if (!prevista) return { ok: false, transactionId: null, motivo: "sem conta prevista" };
  if (gasto.faltando.length) {
    return { ok: false, transactionId: null, motivo: `falta ${gasto.faltando.join(" e ")}` };
  }
  if (!gasto.data) return { ok: false, transactionId: null, motivo: "falta data" };

  const { data: atual } = await supabase
    .from("financial_transactions")
    .select("notes")
    .eq("id", prevista.id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  const nota = [
    String(atual?.notes ?? "").trim(),
    `Paga pelo grupo do financeiro${origem.quem ? ` por ${origem.quem}` : ""}` +
      (Math.abs(gasto.valor - prevista.valorPrevisto) >= 0.01
        ? ` (previsto R$ ${prevista.valorPrevisto.toFixed(2)}).`
        : "."),
    `Mensagem: "${origem.mensagem.slice(0, 200)}"`,
  ]
    .filter(Boolean)
    .join("\n");

  const { data, error } = await supabase
    .from("financial_transactions")
    .update({
      status: "paid",
      paid_date: gasto.data,
      amount: gasto.valor,
      account_id: gasto.contaId,
      payment_method: gasto.paymentMethod,
      notes: nota,
      updated_at: new Date().toISOString(),
    })
    .eq("id", prevista.id)
    .eq("owner_id", ownerId)
    .in("status", ["pending", "overdue"])
    .select("id");
  if (error) {
    console.error("[financeiro-do-grupo] não deu para dar baixa:", error.message);
    return { ok: false, transactionId: null, motivo: error.message };
  }
  if (!(data ?? []).length) {
    return { ok: false, transactionId: null, motivo: "essa conta já não está em aberto" };
  }
  return { ok: true, transactionId: prevista.id, motivo: "baixa dada" };
}

/**
 * Desfaz uma baixa: a conta volta a ficar em aberto, com o valor previsto de
 * antes. Não apaga a linha — ela existia antes do robô e continua existindo.
 */
export async function desfazerBaixa(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ownerId: string,
  gasto: GastoConferido,
): Promise<boolean> {
  const prevista = gasto.prevista;
  if (!prevista) return false;
  const { error } = await supabase
    .from("financial_transactions")
    .update({
      status: "pending",
      paid_date: null,
      amount: prevista.valorPrevisto,
      updated_at: new Date().toISOString(),
    })
    .eq("id", prevista.id)
    .eq("owner_id", ownerId);
  if (error) {
    console.error("[financeiro-do-grupo] não deu para desfazer a baixa:", error.message);
    return false;
  }
  return true;
}
