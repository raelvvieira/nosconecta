import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ReceivableStatus = "all" | "received" | "pending" | "overdue" | "installments" | "recurring";

export interface ReceivableRow {
  id: string;
  description: string;
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
  patient_id: string | null;
  patient_name: string | null;
  professional_id: string | null;
  professional_name: string | null;
  installment_number: number | null;
  installment_total: number | null;
  is_recurring: boolean;
  recurrence_type: string | null;
}

export interface ReceivablesOverview {
  range: { from: string; to: string };
  kpis: {
    receivedInPeriod: { current: number; previous: number; deltaPct: number };
    toReceive: { total: number; count: number };
    overdue: { total: number; patients: number };
    averageTicket: number;
  };
  evolution: { period: string; received: number; expected: number; overdue: number; goal: number }[];
  topProcedures: { id: string; name: string; value: number; pct: number }[];
  topDentists: { id: string; name: string; initials: string; value: number }[];
  defaulters: { id: string; name: string; value: number }[];
  recurringReceivables: { id: string; description: string; amount: number; recurrence_type: string | null; day_of_month: number | null }[];
  transactions: ReceivableRow[];
  totalCount: number;
  accounts: { id: string; name: string; type: string; last_digits: string | null }[];
  categories: { id: string; name: string }[];
  patients: { id: string; name: string }[];
  professionals: { id: string; name: string }[];
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

const initialsOf = (name: string) =>
  name.split(" ").slice(0, 2).map((p) => p[0] ?? "").join("").toUpperCase();

export const getReceivablesOverview = createServerFn({ method: "GET" })
  .inputValidator(
    (input: {
      companyId?: string;
      from?: string;
      to?: string;
      patient?: string;
      professional?: string;
      procedure?: string;
      account?: string;
      method?: string;
      status?: ReceivableStatus;
      q?: string;
    }) => ({
      companyId: input.companyId ?? "demo",
      from: input.from,
      to: input.to,
      patient: input.patient,
      professional: input.professional,
      procedure: input.procedure,
      account: input.account,
      method: input.method,
      status: (input.status ?? "all") as ReceivableStatus,
      q: input.q?.trim() || undefined,
    }),
  )
  .handler(async ({ data }): Promise<ReceivablesOverview> => {
    const supabase = sb();
    const range = resolveRange(data.from, data.to);
    const prev = previousRange(range.from, range.to);
    const today = todayStr();

    // Build evolution: last 12 months ending at range.to
    const toDate = new Date(range.to + "T00:00:00");
    const evoStart = new Date(toDate.getFullYear(), toDate.getMonth() - 11, 1);
    const evoStartStr = evoStart.toISOString().slice(0, 10);
    const evoEnd = new Date(toDate.getFullYear(), toDate.getMonth() + 1, 0).toISOString().slice(0, 10);

    let listQuery = supabase
      .from("financial_transactions")
      .select(
        "id, description, amount, due_date, paid_date, status, payment_method, category_id, account_id, patient_id, professional_id, installment_number, installment_total, is_recurring, recurrence_type, financial_categories(name), financial_accounts(name,type,last_digits), patients(name), professionals(name)",
        { count: "exact" },
      )
      .eq("company_id", data.companyId)
      .eq("type", "receivable")
      .gte("due_date", range.from)
      .lte("due_date", range.to)
      .order("due_date", { ascending: false });

    if (data.patient) listQuery = listQuery.eq("patient_id", data.patient);
    if (data.professional) listQuery = listQuery.eq("professional_id", data.professional);
    if (data.procedure) listQuery = listQuery.eq("category_id", data.procedure);
    if (data.account) listQuery = listQuery.eq("account_id", data.account);
    if (data.method) listQuery = listQuery.eq("payment_method", data.method);
    if (data.q) listQuery = listQuery.ilike("description", `%${data.q}%`);

    const [
      listRes, paidCurRes, paidPrevRes, pendingInRangeRes, overdueAllRes,
      evoRes, topProcRes, topProfRes, defaultersRes, recurringRes,
      accountsRes, categoriesRes, patientsRes, professionalsRes,
    ] = await Promise.all([
      listQuery.limit(500),
      supabase.from("financial_transactions").select("amount")
        .eq("company_id", data.companyId).eq("type", "receivable").eq("status", "paid")
        .gte("paid_date", range.from).lte("paid_date", range.to),
      supabase.from("financial_transactions").select("amount")
        .eq("company_id", data.companyId).eq("type", "receivable").eq("status", "paid")
        .gte("paid_date", prev.from).lte("paid_date", prev.to),
      supabase.from("financial_transactions").select("amount,due_date,status")
        .eq("company_id", data.companyId).eq("type", "receivable").in("status", ["pending", "overdue"])
        .gte("due_date", range.from).lte("due_date", range.to),
      supabase.from("financial_transactions").select("amount,patient_id,patients(name)")
        .eq("company_id", data.companyId).eq("type", "receivable").eq("status", "overdue"),
      // evolution 12 months: pull paid+pending+overdue with due_date OR paid_date in window
      supabase.from("financial_transactions").select("amount,due_date,paid_date,status")
        .eq("company_id", data.companyId).eq("type", "receivable")
        .or(`and(status.eq.paid,paid_date.gte.${evoStartStr},paid_date.lte.${evoEnd}),and(status.in.(pending,overdue),due_date.gte.${evoStartStr},due_date.lte.${evoEnd})`),
      supabase.rpc("finance_revenue_by_category", {
        p_company_id: data.companyId, p_from: range.from, p_to: range.to,
      }),
      supabase.rpc("finance_revenue_by_professional", {
        p_company_id: data.companyId, p_from: range.from, p_to: range.to,
      }),
      supabase.from("financial_transactions")
        .select("amount, patient_id, patients(name)")
        .eq("company_id", data.companyId).eq("type", "receivable").eq("status", "overdue"),
      supabase.from("financial_transactions")
        .select("id, description, amount, recurrence_type, due_date")
        .eq("company_id", data.companyId).eq("type", "receivable").eq("is_recurring", true)
        .order("due_date", { ascending: true }).limit(8),
      supabase.from("financial_accounts").select("id,name,type,last_digits")
        .eq("company_id", data.companyId).order("name"),
      supabase.from("financial_categories").select("id,name")
        .eq("company_id", data.companyId).eq("type", "income").order("name"),
      supabase.from("patients").select("id,name").eq("company_id", data.companyId).order("name"),
      supabase.from("professionals").select("id,name").eq("company_id", data.companyId).order("name"),
    ]);

    for (const r of [listRes, paidCurRes, paidPrevRes, pendingInRangeRes, overdueAllRes, evoRes, topProcRes, topProfRes, defaultersRes, recurringRes, accountsRes, categoriesRes, patientsRes, professionalsRes]) {
      if ((r as any).error) throw (r as any).error;
    }

    const paidCurrent = (paidCurRes.data ?? []).reduce((a, r) => a + Number(r.amount), 0);
    const paidPrevious = (paidPrevRes.data ?? []).reduce((a, r) => a + Number(r.amount), 0);
    const paidCount = (paidCurRes.data ?? []).length;

    const pendingRows = pendingInRangeRes.data ?? [];
    const toReceiveTotal = pendingRows
      .filter((r) => r.status === "pending" && r.due_date >= today)
      .reduce((a, r) => a + Number(r.amount), 0);
    const toReceiveCount = pendingRows.filter((r) => r.status === "pending" && r.due_date >= today).length;

    const allOverdue = overdueAllRes.data ?? [];
    const overdueTotal = allOverdue.reduce((a, r) => a + Number(r.amount), 0);
    const overduePatients = new Set(allOverdue.map((r) => r.patient_id).filter(Boolean)).size;

    const averageTicket = paidCount === 0 ? 0 : paidCurrent / paidCount;

    // evolution buckets
    const evoMap = new Map<string, { period: string; received: number; expected: number; overdue: number; goal: number }>();
    for (let i = 0; i < 12; i++) {
      const d = new Date(evoStart.getFullYear(), evoStart.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      evoMap.set(key, {
        period: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
        received: 0, expected: 0, overdue: 0, goal: 0,
      });
    }
    for (const r of (evoRes.data ?? []) as any[]) {
      const amount = Number(r.amount);
      if (r.status === "paid" && r.paid_date) {
        const k = r.paid_date.slice(0, 7);
        const b = evoMap.get(k); if (b) b.received += amount;
      } else if (r.due_date) {
        const k = r.due_date.slice(0, 7);
        const b = evoMap.get(k);
        if (b) {
          if (r.status === "overdue" || (r.status === "pending" && r.due_date < today)) b.overdue += amount;
          else b.expected += amount;
        }
      }
    }
    const evolution = Array.from(evoMap.values());
    const avgReceived = evolution.reduce((a, e) => a + e.received, 0) / Math.max(1, evolution.filter((e) => e.received > 0).length || 1);
    const goal = Math.round((avgReceived * 1.1) / 1000) * 1000 || 10000;
    evolution.forEach((e) => (e.goal = goal));

    // top procedures (income categories)
    const procRows = (topProcRes.data ?? []) as { category_id: string; name: string; total: number | string }[];
    const procTotal = procRows.reduce((a, r) => a + Number(r.total), 0) || 1;
    const topProcedures = procRows
      .map((r) => ({ id: r.category_id, name: r.name, value: Number(r.total), pct: (Number(r.total) / procTotal) * 100 }))
      .filter((p) => p.value > 0);

    const profRows = (topProfRes.data ?? []) as { professional_id: string; name: string; total: number | string }[];
    const topDentists = profRows
      .map((r) => ({ id: r.professional_id, name: r.name, initials: initialsOf(r.name), value: Number(r.total) }))
      .filter((p) => p.value > 0);

    // defaulters: group overdue by patient
    const defMap = new Map<string, { id: string; name: string; value: number }>();
    for (const r of (defaultersRes.data ?? []) as any[]) {
      if (!r.patient_id) continue;
      const name = r.patients?.name ?? "Sem nome";
      const cur = defMap.get(r.patient_id) ?? { id: r.patient_id, name, value: 0 };
      cur.value += Number(r.amount);
      defMap.set(r.patient_id, cur);
    }
    const defaulters = Array.from(defMap.values()).sort((a, b) => b.value - a.value).slice(0, 5);

    const recurringReceivables = (recurringRes.data ?? []).map((t) => ({
      id: t.id,
      description: t.description,
      amount: Number(t.amount),
      recurrence_type: t.recurrence_type,
      day_of_month: t.due_date ? new Date(t.due_date + "T00:00:00").getDate() : null,
    }));

    const transactions: ReceivableRow[] = ((listRes.data ?? []) as any[]).map((t) => {
      const effective: ReceivableRow["effective_status"] =
        t.status === "pending" && t.due_date < today ? "overdue" : t.status;
      return {
        id: t.id,
        description: t.description,
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
        patient_id: t.patient_id,
        patient_name: t.patients?.name ?? null,
        professional_id: t.professional_id,
        professional_name: t.professionals?.name ?? null,
        installment_number: t.installment_number,
        installment_total: t.installment_total,
        is_recurring: t.is_recurring,
        recurrence_type: t.recurrence_type,
      };
    });

    const filtered = (() => {
      switch (data.status) {
        case "received": return transactions.filter((t) => t.effective_status === "paid");
        case "pending": return transactions.filter((t) => t.effective_status === "pending");
        case "overdue": return transactions.filter((t) => t.effective_status === "overdue");
        case "installments": return transactions.filter((t) => !!t.installment_total);
        case "recurring": return transactions.filter((t) => t.is_recurring);
        case "all":
        default: return transactions;
      }
    })();

    return {
      range,
      kpis: {
        receivedInPeriod: variation(paidCurrent, paidPrevious),
        toReceive: { total: toReceiveTotal, count: toReceiveCount },
        overdue: { total: overdueTotal, patients: overduePatients },
        averageTicket,
      },
      evolution,
      topProcedures,
      topDentists,
      defaulters,
      recurringReceivables,
      transactions: filtered,
      totalCount: filtered.length,
      accounts: (accountsRes.data ?? []) as any,
      categories: (categoriesRes.data ?? []) as any,
      patients: (patientsRes.data ?? []) as any,
      professionals: (professionalsRes.data ?? []) as any,
    };
  });

// ---------------- mutations ----------------

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export const createReceivable = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      companyId?: string;
      description: string;
      amount: number;
      due_date: string;
      patient_id?: string | null;
      professional_id?: string | null;
      category_id?: string | null;
      account_id?: string | null;
      payment_method?: string | null;
      notes?: string | null;
      markReceivedNow?: boolean;
      installments?: number;
      isRecurring?: boolean;
      recurrenceType?: "weekly" | "monthly" | "yearly";
    }) => {
      if (!input.description?.trim()) throw new Error("Descrição obrigatória");
      if (!(input.amount > 0)) throw new Error("Valor deve ser maior que zero");
      if (!input.due_date) throw new Error("Vencimento obrigatório");
      return {
        companyId: input.companyId ?? "demo",
        description: input.description.trim(),
        amount: input.amount,
        due_date: input.due_date,
        patient_id: input.patient_id ?? null,
        professional_id: input.professional_id ?? null,
        category_id: input.category_id ?? null,
        account_id: input.account_id ?? null,
        payment_method: input.payment_method ?? null,
        notes: input.notes?.trim() || null,
        markReceivedNow: !!input.markReceivedNow,
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

    // Se marcado como recebido, cada parcela cujo vencimento já passou (ou é
    // hoje) é registrada como recebida na própria data de vencimento; as
    // futuras ficam pendentes.
    const installmentReceived = (dueDate: string) => data.markReceivedNow && dueDate <= today;

    if (n > 1) {
      const perAmount = Math.floor((data.amount / n) * 100) / 100;
      const lastAmount = Math.round((data.amount - perAmount * (n - 1)) * 100) / 100;
      const firstPaid = installmentReceived(data.due_date);
      const baseRow = {
        company_id: data.companyId,
        type: "receivable" as const,
        description: `${data.description} (1/${n})`,
        amount: perAmount,
        due_date: data.due_date,
        paid_date: firstPaid ? data.due_date : null,
        status: (firstPaid ? "paid" : "pending") as any,
        patient_id: data.patient_id,
        professional_id: data.professional_id,
        category_id: data.category_id,
        account_id: data.account_id,
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
        const paid = installmentReceived(dueDate);
        return {
          company_id: data.companyId,
          type: "receivable" as const,
          description: `${data.description} (${idx}/${n})`,
          amount: isLast ? lastAmount : perAmount,
          due_date: dueDate,
          paid_date: paid ? dueDate : null,
          status: (paid ? "paid" : "pending") as any,
          patient_id: data.patient_id,
          professional_id: data.professional_id,
          category_id: data.category_id,
          account_id: data.account_id,
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
      type: "receivable" as const,
      description: data.description,
      amount: data.amount,
      due_date: data.due_date,
      paid_date: data.markReceivedNow ? today : null,
      status: (data.markReceivedNow ? "paid" : "pending") as any,
      patient_id: data.patient_id,
      professional_id: data.professional_id,
      category_id: data.category_id,
      account_id: data.account_id,
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

export const markReceivableReceived = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; paid_date?: string; account_id?: string | null; payment_method?: string | null }) => ({
    id: input.id,
    paid_date: input.paid_date ?? todayStr(),
    account_id: input.account_id ?? undefined,
    payment_method: input.payment_method ?? undefined,
  }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const update: any = { status: "paid", paid_date: data.paid_date };
    if (data.account_id) update.account_id = data.account_id;
    if (data.payment_method) update.payment_method = data.payment_method;
    const { error } = await supabase.from("financial_transactions").update(update).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const cancelReceivable = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => input)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { error } = await supabase
      .from("financial_transactions")
      .update({ status: "cancelled" })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteReceivable = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => input)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { error } = await supabase.from("financial_transactions").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
