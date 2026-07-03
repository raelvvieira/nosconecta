import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PayableStatus = "all" | "paid" | "pending" | "overdue";

export interface PayableRow {
  id: string;
  description: string;
  supplier_name: string | null;
  amount: number;
  due_date: string;
  paid_date: string | null;
  status: "paid" | "pending" | "overdue" | "cancelled";
  effective_status: "paid" | "pending" | "overdue" | "cancelled";
  payment_method: string | null;
  category_id: string | null;
  category_name: string | null;
  account_id: string | null;
  account_name: string | null;
  account_type: string | null;
  installment_number: number | null;
  installment_total: number | null;
  is_recurring: boolean;
  recurrence_type: string | null;
}

export interface PayablesOverview {
  range: { from: string; to: string };
  kpis: {
    paidInPeriod: { current: number; previous: number; deltaPct: number };
    toPay: { total: number; count: number };
    overdue: { current: number; previous: number; deltaPct: number };
    forecastTotal: number;
  };
  categoryBreakdown: { id: string; name: string; total: number; pct: number }[];
  upcomingDueDates: {
    id: string;
    description: string;
    amount: number;
    due_date: string;
    days_until: number;
  }[];
  recurringPayments: {
    id: string;
    description: string;
    amount: number;
    recurrence_type: string | null;
    day_of_month: number | null;
  }[];
  transactions: PayableRow[];
  totalCount: number;
  accounts: { id: string; name: string; type: string; last_digits: string | null }[];
  categories: { id: string; name: string }[];
  suppliers: string[];
}

function sb() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, storage: undefined } },
  );
}

const todayStr = () => new Date().toISOString().slice(0, 10);

function resolveRange(from?: string, to?: string): { from: string; to: string } {
  if (from && to) return { from, to };
  const t = new Date();
  const f = new Date();
  f.setDate(f.getDate() - 29);
  return { from: f.toISOString().slice(0, 10), to: t.toISOString().slice(0, 10) };
}

function previousRange(from: string, to: string): { from: string; to: string } {
  const f = new Date(from + "T00:00:00");
  const t = new Date(to + "T00:00:00");
  const days = Math.round((t.getTime() - f.getTime()) / 86400000) + 1;
  const prevTo = new Date(f);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - (days - 1));
  return { from: prevFrom.toISOString().slice(0, 10), to: prevTo.toISOString().slice(0, 10) };
}

const variation = (current: number, previous: number) => ({
  current,
  previous,
  deltaPct: previous === 0 ? (current === 0 ? 0 : 100) : ((current - previous) / previous) * 100,
});

export const getPayablesOverview = createServerFn({ method: "GET" })
  .inputValidator(
    (input: {
      companyId?: string;
      from?: string;
      to?: string;
      category?: string;
      account?: string;
      supplier?: string;
      status?: PayableStatus;
      method?: string;
      q?: string;
    }) => ({
      companyId: input.companyId ?? "demo",
      from: input.from,
      to: input.to,
      category: input.category,
      account: input.account,
      supplier: input.supplier,
      status: (input.status ?? "all") as PayableStatus,
      method: input.method,
      q: input.q?.trim() || undefined,
    }),
  )
  .handler(async ({ data }): Promise<PayablesOverview> => {
    const supabase = sb();
    const range = resolveRange(data.from, data.to);
    const prev = previousRange(range.from, range.to);
    const today = todayStr();

    // Base query for the list — by due_date within range
    let listQuery = supabase
      .from("financial_transactions")
      .select(
        "id, description, amount, due_date, paid_date, status, payment_method, supplier_name, category_id, account_id, installment_number, installment_total, is_recurring, recurrence_type, financial_categories(name), financial_accounts(name,type,last_digits)",
        { count: "exact" },
      )
      .eq("company_id", data.companyId)
      .eq("type", "payable")
      .gte("due_date", range.from)
      .lte("due_date", range.to)
      .order("due_date", { ascending: false });

    if (data.category) listQuery = listQuery.eq("category_id", data.category);
    if (data.account) listQuery = listQuery.eq("account_id", data.account);
    if (data.supplier) listQuery = listQuery.eq("supplier_name", data.supplier);
    if (data.method) listQuery = listQuery.eq("payment_method", data.method);
    if (data.q) listQuery = listQuery.or(`description.ilike.%${data.q}%,supplier_name.ilike.%${data.q}%`);

    const [
      listRes,
      paidCurRes,
      paidPrevRes,
      pendingInRangeRes,
      overdueAllRes,
      catAggRes,
      upcomingRes,
      recurringRes,
      accountsRes,
      categoriesRes,
      suppliersRes,
    ] = await Promise.all([
      listQuery.limit(500),
      supabase.from("financial_transactions").select("amount")
        .eq("company_id", data.companyId).eq("type", "payable").eq("status", "paid")
        .gte("paid_date", range.from).lte("paid_date", range.to),
      supabase.from("financial_transactions").select("amount")
        .eq("company_id", data.companyId).eq("type", "payable").eq("status", "paid")
        .gte("paid_date", prev.from).lte("paid_date", prev.to),
      supabase.from("financial_transactions").select("amount,due_date,status")
        .eq("company_id", data.companyId).eq("type", "payable").in("status", ["pending", "overdue"])
        .gte("due_date", range.from).lte("due_date", range.to),
      supabase.from("financial_transactions").select("amount,due_date,status")
        .eq("company_id", data.companyId).eq("type", "payable").in("status", ["pending", "overdue"]),
      supabase.from("financial_transactions")
        .select("amount, category_id, financial_categories(name)")
        .eq("company_id", data.companyId).eq("type", "payable").neq("status", "cancelled")
        .gte("due_date", range.from).lte("due_date", range.to),
      supabase.from("financial_transactions")
        .select("id, description, amount, due_date")
        .eq("company_id", data.companyId).eq("type", "payable").eq("status", "pending")
        .gte("due_date", today).order("due_date", { ascending: true }).limit(5),
      supabase.from("financial_transactions")
        .select("id, description, amount, recurrence_type, due_date")
        .eq("company_id", data.companyId).eq("type", "payable").eq("is_recurring", true)
        .order("due_date", { ascending: true }).limit(8),
      supabase.from("financial_accounts").select("id,name,type,last_digits")
        .eq("company_id", data.companyId).order("name"),
      supabase.from("financial_categories").select("id,name")
        .eq("company_id", data.companyId).eq("type", "expense").order("name"),
      supabase.from("financial_transactions").select("supplier_name")
        .eq("company_id", data.companyId).eq("type", "payable").not("supplier_name", "is", null),
    ]);

    const errs = [listRes, paidCurRes, paidPrevRes, pendingInRangeRes, overdueAllRes, catAggRes, upcomingRes, recurringRes, accountsRes, categoriesRes, suppliersRes];
    for (const r of errs) if ((r as any).error) throw (r as any).error;

    const paidCurrent = (paidCurRes.data ?? []).reduce((a, r) => a + Number(r.amount), 0);
    const paidPrevious = (paidPrevRes.data ?? []).reduce((a, r) => a + Number(r.amount), 0);

    const pendingRows = pendingInRangeRes.data ?? [];
    const toPayTotal = pendingRows.filter(r => r.status === "pending" && r.due_date >= today).reduce((a, r) => a + Number(r.amount), 0);
    const toPayCount = pendingRows.filter(r => r.status === "pending" && r.due_date >= today).length;

    const allUnpaid = overdueAllRes.data ?? [];
    const overdueCurrent = allUnpaid
      .filter(r => r.status === "overdue" || (r.status === "pending" && r.due_date < today))
      .reduce((a, r) => a + Number(r.amount), 0);
    // simple previous-period proxy: count overdue items whose due_date fell in prev range
    const overduePrevious = allUnpaid
      .filter(r => r.due_date >= prev.from && r.due_date <= prev.to)
      .reduce((a, r) => a + Number(r.amount), 0);

    const forecastTotal = paidCurrent + pendingRows.reduce((a, r) => a + Number(r.amount), 0);

    // Category breakdown
    const catMap = new Map<string, { id: string; name: string; total: number }>();
    for (const r of (catAggRes.data ?? []) as any[]) {
      const id = r.category_id ?? "uncategorized";
      const name = r.financial_categories?.name ?? "Outros";
      const cur = catMap.get(id) ?? { id, name, total: 0 };
      cur.total += Number(r.amount);
      catMap.set(id, cur);
    }
    const catTotal = Array.from(catMap.values()).reduce((a, c) => a + c.total, 0) || 1;
    const categoryBreakdown = Array.from(catMap.values())
      .sort((a, b) => b.total - a.total)
      .map(c => ({ ...c, pct: (c.total / catTotal) * 100 }));

    const upcomingDueDates = (upcomingRes.data ?? []).map(t => {
      const d = new Date(t.due_date + "T00:00:00").getTime();
      const now = new Date(today + "T00:00:00").getTime();
      return {
        id: t.id,
        description: t.description,
        amount: Number(t.amount),
        due_date: t.due_date,
        days_until: Math.round((d - now) / 86400000),
      };
    });

    const recurringPayments = (recurringRes.data ?? []).map(t => ({
      id: t.id,
      description: t.description,
      amount: Number(t.amount),
      recurrence_type: t.recurrence_type,
      day_of_month: t.due_date ? new Date(t.due_date + "T00:00:00").getDate() : null,
    }));

    const transactions: PayableRow[] = ((listRes.data ?? []) as any[]).map(t => {
      const effective: PayableRow["effective_status"] =
        t.status === "pending" && t.due_date < today ? "overdue" : t.status;
      return {
        id: t.id,
        description: t.description,
        supplier_name: t.supplier_name,
        amount: Number(t.amount),
        due_date: t.due_date,
        paid_date: t.paid_date,
        status: t.status,
        effective_status: effective,
        payment_method: t.payment_method,
        category_id: t.category_id,
        category_name: t.financial_categories?.name ?? null,
        account_id: t.account_id,
        account_name: t.financial_accounts?.name ?? null,
        account_type: t.financial_accounts?.type ?? null,
        installment_number: t.installment_number,
        installment_total: t.installment_total,
        is_recurring: t.is_recurring,
        recurrence_type: t.recurrence_type,
      };
    });

    const filteredTransactions = data.status === "all"
      ? transactions
      : transactions.filter(t => t.effective_status === data.status);

    const supplierSet = new Set<string>();
    for (const r of (suppliersRes.data ?? []) as any[]) if (r.supplier_name) supplierSet.add(r.supplier_name);

    return {
      range,
      kpis: {
        paidInPeriod: variation(paidCurrent, paidPrevious),
        toPay: { total: toPayTotal, count: toPayCount },
        overdue: variation(overdueCurrent, overduePrevious),
        forecastTotal,
      },
      categoryBreakdown,
      upcomingDueDates,
      recurringPayments,
      transactions: filteredTransactions,
      totalCount: filteredTransactions.length,
      accounts: (accountsRes.data ?? []) as any,
      categories: (categoriesRes.data ?? []) as any,
      suppliers: Array.from(supplierSet).sort(),
    };
  });

// ---------- mutations ----------

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export const createPayable = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      companyId?: string;
      description: string;
      amount: number;
      due_date: string;
      category_id?: string | null;
      account_id?: string | null;
      supplier_name?: string | null;
      payment_method?: string | null;
      notes?: string | null;
      markPaidNow?: boolean;
      paid_date?: string | null;
      installments?: number;
      isRecurring?: boolean;
      recurrenceType?: "monthly" | "weekly" | "yearly";
    }) => {
      if (!input.description?.trim()) throw new Error("Descrição obrigatória");
      if (!(input.amount > 0)) throw new Error("Valor deve ser maior que zero");
      if (!input.due_date) throw new Error("Vencimento obrigatório");
      return {
        companyId: input.companyId ?? "demo",
        description: input.description.trim(),
        amount: input.amount,
        due_date: input.due_date,
        category_id: input.category_id ?? null,
        account_id: input.account_id ?? null,
        supplier_name: input.supplier_name?.trim() || null,
        payment_method: input.payment_method ?? null,
        notes: input.notes?.trim() || null,
        markPaidNow: !!input.markPaidNow,
        paid_date: input.paid_date || null,
        installments: Math.max(1, Math.min(60, input.installments ?? 1)),
        isRecurring: !!input.isRecurring,
        recurrenceType: input.recurrenceType ?? "monthly",
      };
    },
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const today = todayStr();
    const n = data.installments;

    // Considera pago se o toggle foi marcado ou se uma data de pagamento foi informada.
    const isPaid = data.markPaidNow || !!data.paid_date;
    const paidDateVal = isPaid ? (data.paid_date ?? today) : null;

    // Numa despesa parcelada marcada como paga, cada parcela cujo vencimento
    // já passou (ou é hoje) é registrada como paga na própria data de
    // vencimento; as futuras ficam pendentes. Reflete o pagamento das faturas.
    const installmentPaid = (dueDate: string) => isPaid && dueDate <= today;

    if (n > 1) {
      // First insert: parent
      const perAmount = Math.floor((data.amount / n) * 100) / 100;
      const lastAmount = Math.round((data.amount - perAmount * (n - 1)) * 100) / 100;
      const firstPaid = installmentPaid(data.due_date);
      const baseRow = {
        company_id: data.companyId,
        type: "payable" as const,
        description: `${data.description} (1/${n})`,
        amount: perAmount,
        due_date: data.due_date,
        paid_date: firstPaid ? data.due_date : null,
        status: (firstPaid ? "paid" : "pending") as any,
        category_id: data.category_id,
        account_id: data.account_id,
        supplier_name: data.supplier_name,
        payment_method: data.payment_method,
        notes: data.notes,
        installment_number: 1,
        installment_total: n,
      };
      const { data: parent, error: pErr } = await supabase
        .from("financial_transactions").insert(baseRow).select("id").single();
      if (pErr) throw pErr;

      const rest = Array.from({ length: n - 1 }, (_, i) => {
        const idx = i + 2;
        const isLast = idx === n;
        const dueDate = addMonths(data.due_date, idx - 1);
        const paid = installmentPaid(dueDate);
        return {
          company_id: data.companyId,
          type: "payable" as const,
          description: `${data.description} (${idx}/${n})`,
          amount: isLast ? lastAmount : perAmount,
          due_date: dueDate,
          paid_date: paid ? dueDate : null,
          status: (paid ? "paid" : "pending") as any,
          category_id: data.category_id,
          account_id: data.account_id,
          supplier_name: data.supplier_name,
          payment_method: data.payment_method,
          installment_number: idx,
          installment_total: n,
          parent_transaction_id: parent.id,
        };
      });
      const { error: rErr } = await supabase.from("financial_transactions").insert(rest);
      if (rErr) throw rErr;
      return { id: parent.id, count: n };
    }

    const row = {
      company_id: data.companyId,
      type: "payable" as const,
      description: data.description,
      amount: data.amount,
      due_date: data.due_date,
      paid_date: paidDateVal,
      status: (isPaid ? "paid" : "pending") as any,
      category_id: data.category_id,
      account_id: data.account_id,
      supplier_name: data.supplier_name,
      payment_method: data.payment_method,
      notes: data.notes,
      is_recurring: data.isRecurring,
      recurrence_type: data.isRecurring ? data.recurrenceType : null,
    };
    const { data: inserted, error } = await supabase
      .from("financial_transactions").insert(row).select("id").single();
    if (error) throw error;
    return { id: inserted.id, count: 1 };
  });

export const markPayablePaid = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; paid_date?: string }) => ({
    id: input.id,
    paid_date: input.paid_date ?? todayStr(),
  }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { error } = await supabase
      .from("financial_transactions")
      .update({ status: "paid", paid_date: data.paid_date })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deletePayable = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => input)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { error } = await supabase.from("financial_transactions").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
