import { createServerFn } from "@tanstack/react-start";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";
import { resolveUnitId } from "@/lib/auth/resolve-unit";
import { clinicTodayStr } from "@/lib/date";
import { estadoDaFatura, faturasDasParcelas, valorDasParcelas } from "./fatura";
import { tabelaDeCartaoAusente } from "./schema-cartao";

/**
 * Compras no cartão e as faturas que as recebem.
 *
 * ── As três naturezas de linha em `financial_transactions` ──────────────
 *
 *   1. Saída de caixa comum — `card_invoice_id` nulo, `settles_…` nulo
 *   2. Compra no cartão     — `card_invoice_id` preenchido → NÃO é caixa
 *   3. A fatura             — `settles_card_invoice_id` preenchido → É caixa
 *
 * A fatura é uma linha de pagamento comum de propósito: assim ela ganha de
 * graça a tela de pagamento, a linha na lista, o status efetivo e o filtro por
 * conta. O preço é manter o valor dela em dia quando uma compra entra ou sai —
 * e quem faz isso é um gatilho no banco, não este arquivo, porque o banco é o
 * único lugar por onde todas as escritas passam.
 */

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "Fatura Nubank PJ · out/2026" — o rótulo que aparece em Pagamentos. */
function nomeDaFatura(cartao: string, vencimento: string): string {
  const [ano, mes] = vencimento.split("-").map(Number);
  return `Fatura ${cartao} · ${MESES[mes - 1]}/${ano}`;
}

interface DadosDoCartao {
  id: string;
  name: string;
  account_id: string | null;
  closing_day: number;
  due_day: number;
  unit_id: string;
}

/**
 * Encontra ou cria a fatura de um ciclo, junto com a linha de pagamento dela.
 *
 * ── Sob demanda, nunca em lote ──────────────────────────────────────────
 *
 * Uma compra em 12x precisa de doze faturas. Criar doze meses à frente no
 * cadastro do cartão pareceria mais organizado e seria pior: não há cron neste
 * projeto para estender a janela, mudar o dia de fechamento deixaria doze
 * faturas com datas inválidas, e faturas vazias virariam lixo na lista e no
 * gráfico.
 *
 * ── E nunca em LEITURA ──────────────────────────────────────────────────
 *
 * Criar a fatura quando alguém abre a tela quebraria a RPC `STABLE`, quebraria
 * cache e correria sob concorrência. A fatura nasce no momento em que uma
 * compra precisa dela, e só aí.
 *
 * A corrida de duas compras simultâneas para o mesmo ciclo é resolvida pelo
 * índice único `(card_id, closing_date)`: o segundo `upsert` reencontra em vez
 * de duplicar.
 */
async function garantirFatura(
  supabase: any,
  ownerId: string,
  cartao: DadosDoCartao,
  fechamento: string,
  vencimento: string,
): Promise<string> {
  const { data: fatura, error } = await supabase
    .from("card_invoices")
    .upsert(
      {
        owner_id: ownerId,
        unit_id: cartao.unit_id,
        card_id: cartao.id,
        closing_date: fechamento,
        due_date: vencimento,
      },
      { onConflict: "card_id,closing_date", ignoreDuplicates: false },
    )
    .select("id")
    .single();
  if (error) throw error;

  // A linha de pagamento nasce com valor zero: o gatilho a preenche assim que
  // a primeira compra entrar. Sem ela o gatilho não teria alvo.
  const { data: existente } = await supabase
    .from("financial_transactions")
    .select("id")
    .eq("settles_card_invoice_id", fatura.id)
    .maybeSingle();

  if (!existente) {
    const { error: erroLinha } = await supabase.from("financial_transactions").insert({
      owner_id: ownerId,
      unit_id: cartao.unit_id,
      type: "payable",
      status: "pending",
      description: nomeDaFatura(cartao.name, vencimento),
      amount: 0,
      due_date: vencimento,
      account_id: cartao.account_id,
      payment_method: "fatura",
      settles_card_invoice_id: fatura.id,
      credit_card_id: cartao.id,
    });
    if (erroLinha) throw erroLinha;
  }

  return fatura.id as string;
}

export const createCardPurchase = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator(
    (input: {
      unitId?: string;
      cardId: string;
      description: string;
      amount: number;
      /** Quando a compra foi feita — NÃO é o vencimento. */
      purchaseDate: string;
      installments?: number;
      category_id?: string | null;
      supplier_name?: string | null;
      notes?: string | null;
    }) => {
      const description = input.description?.trim();
      if (!description) throw new Error("Informe a descrição da compra.");
      if (!input.cardId) throw new Error("Escolha o cartão.");
      const amount = Number(input.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Informe um valor válido.");
      if (!input.purchaseDate) throw new Error("Informe a data da compra.");
      return {
        unitId: input.unitId,
        cardId: input.cardId,
        description,
        amount,
        purchaseDate: input.purchaseDate,
        installments: Math.max(1, Math.min(60, Math.trunc(Number(input.installments) || 1))),
        category_id: input.category_id || null,
        supplier_name: input.supplier_name?.trim() || null,
        notes: input.notes?.trim() || null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;

    const { data: cartao, error: erroCartao } = await supabase
      .from("credit_cards")
      .select("id, name, account_id, closing_day, due_day, unit_id")
      .eq("id", data.cardId)
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    if (erroCartao && tabelaDeCartaoAusente(erroCartao)) {
      throw new Error(
        "Falta aplicar a migration pendente do banco (cartões de crédito) — peça isso no Lovable e tente de novo depois.",
      );
    }
    if (erroCartao) throw erroCartao;
    if (!cartao) throw new Error("Cartão não encontrado.");

    // A unidade sai do CARTÃO, não do seletor global do menu. Escolher o
    // cartão já é escolher a unidade, e perguntar de novo faria o admim que
    // está vendo "todas as unidades" bater em "Selecione a unidade." num
    // formulário que não tem esse campo.
    //
    // `resolveUnitId` continua sendo chamado para não-admin: ele ignora o que
    // vier e carimba a unidade da pessoa, o que também recusa lançar num
    // cartão de outra unidade.
    const unitId = await resolveUnitId(context, cartao.unit_id);
    if (cartao.unit_id !== unitId) throw new Error("O cartão é de outra unidade.");

    const n = data.installments;
    const ciclos = faturasDasParcelas(data.purchaseDate, cartao.closing_day, cartao.due_day, n);
    const valores = valorDasParcelas(data.amount, n);

    // Um id de grupo, e não `parent_transaction_id`: aquele é auto-referente
    // com ON DELETE CASCADE, e apagar a primeira parcela levaria as doze,
    // espalhadas por onze faturas — a exceção de fatura congelada abortaria o
    // statement inteiro com uma mensagem que ninguém entende.
    const grupo = crypto.randomUUID();

    const linhas = [];
    for (let i = 0; i < n; i++) {
      const faturaId = await garantirFatura(
        supabase,
        context.ownerId,
        cartao as DadosDoCartao,
        ciclos[i].fechamento,
        ciclos[i].vencimento,
      );
      linhas.push({
        owner_id: context.ownerId,
        unit_id: unitId,
        type: "payable",
        status: "pending",
        description: n > 1 ? `${data.description} (${i + 1}/${n})` : data.description,
        amount: valores[i],
        // O vencimento da compra é o da FATURA dela. É o que faz a parcela
        // aparecer no lugar certo do tempo mesmo quando olhada sozinha.
        due_date: ciclos[i].vencimento,
        purchase_date: data.purchaseDate,
        card_invoice_id: faturaId,
        credit_card_id: cartao.id,
        purchase_group_id: grupo,
        installment_number: n > 1 ? i + 1 : null,
        installment_total: n > 1 ? n : null,
        category_id: data.category_id,
        supplier_name: data.supplier_name,
        account_id: cartao.account_id,
        payment_method: "credito",
        notes: i === 0 ? data.notes : null,
      });
    }

    const { error } = await supabase.from("financial_transactions").insert(linhas);
    if (error) throw error;

    return {
      count: n,
      primeiroVencimento: ciclos[0].vencimento,
      ultimoVencimento: ciclos[n - 1].vencimento,
    };
  });

export interface CompraNaFatura {
  id: string;
  description: string;
  amount: number;
  purchaseDate: string | null;
  categoryName: string | null;
  supplierName: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
}

export interface DetalheDaFatura {
  id: string;
  cardName: string;
  closingDate: string;
  dueDate: string;
  estado: "aberta" | "fechada" | "paga";
  total: number;
  paidDate: string | null;
  compras: CompraNaFatura[];
}

export const getCardInvoiceDetail = createServerFn({ method: "GET" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { invoiceId: string }) => {
    if (!input.invoiceId) throw new Error("Fatura inválida.");
    return { invoiceId: input.invoiceId };
  })
  .handler(async ({ data, context }): Promise<DetalheDaFatura | null> => {
    const supabase: any = context.supabase;

    const { data: fatura, error } = await supabase
      .from("card_invoices")
      .select("id, closing_date, due_date, credit_cards(name)")
      .eq("id", data.invoiceId)
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    if (error) {
      if (tabelaDeCartaoAusente(error)) return null;
      throw error;
    }
    if (!fatura) return null;

    const [{ data: linha }, { data: compras }] = await Promise.all([
      supabase
        .from("financial_transactions")
        .select("amount, status, paid_date")
        .eq("settles_card_invoice_id", data.invoiceId)
        .maybeSingle(),
      supabase
        .from("financial_transactions")
        .select(
          "id, description, amount, purchase_date, supplier_name, installment_number, installment_total, financial_categories(name)",
        )
        .eq("card_invoice_id", data.invoiceId)
        .eq("owner_id", context.ownerId)
        .neq("status", "cancelled")
        .order("purchase_date", { ascending: true }),
    ]);

    const pagaEm = linha?.status === "paid" ? (linha.paid_date ?? null) : null;

    return {
      id: fatura.id,
      cardName: fatura.credit_cards?.name ?? "Cartão",
      closingDate: fatura.closing_date,
      dueDate: fatura.due_date,
      estado: estadoDaFatura(fatura.closing_date, clinicTodayStr(), pagaEm),
      total: Number(linha?.amount ?? 0),
      paidDate: pagaEm,
      compras: ((compras ?? []) as any[]).map((c) => ({
        id: c.id,
        description: c.description,
        amount: Number(c.amount),
        purchaseDate: c.purchase_date ?? null,
        categoryName: c.financial_categories?.name ?? null,
        supplierName: c.supplier_name ?? null,
        installmentNumber: c.installment_number ?? null,
        installmentTotal: c.installment_total ?? null,
      })),
    };
  });

/**
 * Paga a fatura inteira de uma vez.
 *
 * É como funciona na vida real: chega um débito único no extrato, não
 * quarenta. As compras de dentro são marcadas junto para que a ficha de cada
 * uma conte a mesma história — mas quem representa a saída de caixa continua
 * sendo só a linha da fatura (as compras estão fora de toda soma de caixa).
 *
 * A ordem importa: o gatilho de congelamento recusa mudança de VALOR e de
 * fatura numa fatura paga, mas deixa passar mudança de status. É essa folga
 * que permite marcar as compras depois — e é por isso que ela existe.
 */
export const payCardInvoice = createServerFn({ method: "POST" })
  .middleware([requireClinicMembership])
  .inputValidator((input: { invoiceId: string; paidDate?: string | null }) => {
    if (!input.invoiceId) throw new Error("Fatura inválida.");
    return { invoiceId: input.invoiceId, paidDate: input.paidDate || null };
  })
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const quando = data.paidDate ?? clinicTodayStr();

    const { data: linha } = await supabase
      .from("financial_transactions")
      .select("id, amount")
      .eq("settles_card_invoice_id", data.invoiceId)
      .eq("owner_id", context.ownerId)
      .maybeSingle();
    if (!linha) throw new Error("Fatura não encontrada.");
    if (Number(linha.amount) <= 0) throw new Error("Esta fatura não tem compras para pagar.");

    const { error: erroFatura } = await supabase
      .from("financial_transactions")
      .update({ status: "paid", paid_date: quando })
      .eq("id", linha.id)
      .eq("owner_id", context.ownerId);
    if (erroFatura) throw erroFatura;

    const { error: erroCompras } = await supabase
      .from("financial_transactions")
      .update({ status: "paid", paid_date: quando })
      .eq("card_invoice_id", data.invoiceId)
      .eq("owner_id", context.ownerId)
      .neq("status", "cancelled");
    if (erroCompras) throw erroCompras;

    return { ok: true, amount: Number(linha.amount) };
  });
