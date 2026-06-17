import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type Period = "today" | "7d" | "30d" | "90d";
export type Granularity = "daily" | "weekly" | "monthly";

export interface KpiVariation {
  current: number;
  previous: number;
  deltaPct: number;
}

export interface CashFlowPoint {
  key: string;
  label: string;
  entradas: number;
  saidas: number;
  receb_futuro: number;
  saldo: number;
}

export interface Insight {
  id: string;
  icon: "trend" | "alert" | "tooth" | "calendar";
  tone: "info" | "warning" | "success" | "violet";
  text: string;
}

export interface OverviewData {
  range: { from: string; to: string };
  kpis: {
    revenue: KpiVariation;
    expenses: KpiVariation;
    profit: KpiVariation;
    margin: number;
    overdue: { total: number; patients: number };
  };
  cashFlow: CashFlowPoint[];
  accounts: {
    id: string;
    name: string;
    type: string;
    last_digits: string | null;
    current_balance: number;
  }[];
  totalAvailable: number;
  upcomingReceivables: {
    id: string;
    description: string;
    amount: number;
    due_date: string;
    patient_name: string | null;
  }[];
  upcomingPayables: {
    id: string;
    description: string;
    amount: number;
    due_date: string;
    category_name: string | null;
  }[];
  procedures: { id: string; name: string; value: number; pct: number }[];
  dentists: { id: string; name: string; value: number; pct: number }[];
  commissions: { id: string; name: string; value: number; pct: number }[];
  insights: Insight[];
}

function getServerSupabase() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, storage: undefined } },
  );
}

function periodToRange(period: Period, customFrom?: string, customTo?: string): { from: Date; to: Date } {
  if (customFrom && customTo) {
    const f = new Date(customFrom + "T00:00:00");
    const t = new Date(customTo + "T23:59:59");
    return { from: f, to: t };
  }
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  if (period === "7d") from.setDate(from.getDate() - 6);
  else if (period === "30d") from.setDate(from.getDate() - 29);
  else if (period === "90d") from.setDate(from.getDate() - 89);
  return { from, to };
}

const toDateStr = (d: Date) => d.toISOString().slice(0, 10);

function previousRange({ from, to }: { from: Date; to: Date }) {
  const span = to.getTime() - from.getTime();
  return { from: new Date(from.getTime() - span - 1), to: new Date(from.getTime() - 1) };
}

const variation = (current: number, previous: number): KpiVariation => ({
  current,
  previous,
  deltaPct: previous === 0 ? (current === 0 ? 0 : 100) : ((current - previous) / previous) * 100,
});

function bucketKey(d: Date, g: Granularity): string {
  if (g === "monthly") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  if (g === "weekly") {
    const x = new Date(d);
    const day = x.getDay();
    x.setDate(x.getDate() - ((day + 6) % 7));
    return x.toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}
function bucketLabel(key: string, g: Granularity): string {
  if (g === "monthly") {
    const [y, m] = key.split("-");
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("pt-BR", { month: "short" });
  }
  const d = new Date(key + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

async function sumAmount(
  supabase: ReturnType<typeof getServerSupabase>,
  companyId: string,
  type: "receivable" | "payable",
  status: "paid",
  fromCol: "paid_date",
  from: string,
  to: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("financial_transactions")
    .select("amount")
    .eq("company_id", companyId)
    .eq("type", type)
    .eq("status", status)
    .gte(fromCol, from)
    .lte(fromCol, to);
  if (error) throw error;
  return (data ?? []).reduce((acc, r) => acc + Number(r.amount), 0);
}

export const getFinanceOverview = createServerFn({ method: "GET" })
  .inputValidator(
    (input: { companyId?: string; period?: Period; granularity?: Granularity }) => ({
      companyId: input.companyId ?? "demo",
      period: input.period ?? "30d",
      granularity: input.granularity ?? "daily",
    }),
  )
  .handler(async ({ data }): Promise<OverviewData> => {
    const supabase = getServerSupabase();
    const { companyId, period, granularity } = data;
    const range = periodToRange(period);
    const prev = previousRange(range);
    const fromStr = toDateStr(range.from);
    const toStr = toDateStr(range.to);
    const prevFromStr = toDateStr(prev.from);
    const prevToStr = toDateStr(prev.to);

    // --- KPIs (parallel) ---
    const [
      revCur, revPrev, expCur, expPrev,
      overdueRes, accountsRes, procRes, profRes,
      upRecRes, upPayRes, cashRes, paidByDayRes,
    ] = await Promise.all([
      sumAmount(supabase, companyId, "receivable", "paid", "paid_date", fromStr, toStr),
      sumAmount(supabase, companyId, "receivable", "paid", "paid_date", prevFromStr, prevToStr),
      sumAmount(supabase, companyId, "payable", "paid", "paid_date", fromStr, toStr),
      sumAmount(supabase, companyId, "payable", "paid", "paid_date", prevFromStr, prevToStr),
      supabase
        .from("financial_transactions")
        .select("amount, patient_id")
        .eq("company_id", companyId)
        .eq("type", "receivable")
        .eq("status", "overdue"),
      supabase
        .from("financial_accounts")
        .select("id,name,type,last_digits,current_balance")
        .eq("company_id", companyId)
        .order("name"),
      supabase.rpc("finance_revenue_by_category", {
        p_company_id: companyId, p_from: fromStr, p_to: toStr,
      }),
      supabase.rpc("finance_revenue_by_professional", {
        p_company_id: companyId, p_from: fromStr, p_to: toStr,
      }),
      supabase
        .from("financial_transactions")
        .select("id, description, amount, due_date, patient_id, patients(name)")
        .eq("company_id", companyId)
        .eq("type", "receivable")
        .eq("status", "pending")
        .gte("due_date", toDateStr(new Date()))
        .order("due_date", { ascending: true })
        .limit(5),
      supabase
        .from("financial_transactions")
        .select("id, description, amount, due_date, category_id, financial_categories(name)")
        .eq("company_id", companyId)
        .eq("type", "payable")
        .eq("status", "pending")
        .gte("due_date", toDateStr(new Date()))
        .order("due_date", { ascending: true })
        .limit(5),
      supabase.rpc("finance_cash_flow_series", {
        p_company_id: companyId, p_from: fromStr, p_to: toStr, p_granularity: granularity,
      }),
      // Day-of-week revenue for insight
      supabase
        .from("financial_transactions")
        .select("amount, paid_date")
        .eq("company_id", companyId)
        .eq("type", "receivable")
        .eq("status", "paid")
        .gte("paid_date", fromStr)
        .lte("paid_date", toStr),
    ]);

    if (overdueRes.error) throw overdueRes.error;
    if (accountsRes.error) throw accountsRes.error;
    if (procRes.error) throw procRes.error;
    if (profRes.error) throw profRes.error;
    if (upRecRes.error) throw upRecRes.error;
    if (upPayRes.error) throw upPayRes.error;
    if (cashRes.error) throw cashRes.error;
    if (paidByDayRes.error) throw paidByDayRes.error;

    const revenue = variation(revCur, revPrev);
    const expenses = variation(expCur, expPrev);
    const profit = variation(revCur - expCur, revPrev - expPrev);
    const margin = revCur === 0 ? 0 : (profit.current / revCur) * 100;

    const overdueRows = overdueRes.data ?? [];
    const overdueTotal = overdueRows.reduce((a, r) => a + Number(r.amount), 0);
    const overduePatients = new Set(overdueRows.map((r) => r.patient_id).filter(Boolean)).size;

    const accounts = (accountsRes.data ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      last_digits: a.last_digits,
      current_balance: Number(a.current_balance),
    }));
    const totalAvailable = accounts.reduce((a, b) => a + b.current_balance, 0);

    const procRows = (procRes.data ?? []) as { category_id: string; name: string; total: number | string }[];
    const procTotal = procRows.reduce((a, r) => a + Number(r.total), 0) || 1;
    const procedures = procRows
      .map((r) => ({
        id: r.category_id,
        name: r.name,
        value: Number(r.total),
        pct: (Number(r.total) / procTotal) * 100,
      }))
      .filter((p) => p.value > 0);

    const profRows = (profRes.data ?? []) as {
      professional_id: string; name: string; total: number | string; commission_pct: number | string;
    }[];
    const profMax = Math.max(1, ...profRows.map((r) => Number(r.total)));
    const dentists = profRows.map((r) => ({
      id: r.professional_id,
      name: r.name,
      value: Number(r.total),
      pct: (Number(r.total) / profMax) * 100,
    }));
    const commissions = profRows.map((r) => ({
      id: r.professional_id,
      name: r.name,
      value: (Number(r.total) * Number(r.commission_pct)) / 100,
      pct: Number(r.commission_pct),
    }));

    const upcomingReceivables = (upRecRes.data ?? []).map((t: any) => ({
      id: t.id,
      description: t.description,
      amount: Number(t.amount),
      due_date: t.due_date,
      patient_name: t.patients?.name ?? null,
    }));
    const upcomingPayables = (upPayRes.data ?? []).map((t: any) => ({
      id: t.id,
      description: t.description,
      amount: Number(t.amount),
      due_date: t.due_date,
      category_name: t.financial_categories?.name ?? null,
    }));

    // Cash flow series — re-bucket if weekly/monthly because RPC returns daily-aligned buckets per row.
    const cashRows = (cashRes.data ?? []) as {
      bucket: string; income: number | string; expense: number | string; future_receivable: number | string;
    }[];
    const buckets = new Map<string, CashFlowPoint>();
    for (const r of cashRows) {
      const d = new Date(r.bucket + "T00:00:00");
      const key = bucketKey(d, granularity);
      const existing = buckets.get(key) ?? {
        key,
        label: bucketLabel(key, granularity),
        entradas: 0, saidas: 0, receb_futuro: 0, saldo: 0,
      };
      existing.entradas += Number(r.income);
      existing.saidas += Number(r.expense);
      existing.receb_futuro += Number(r.future_receivable);
      buckets.set(key, existing);
    }
    const series = Array.from(buckets.values()).sort((a, b) => (a.key < b.key ? -1 : 1));
    let running = 0;
    for (const p of series) {
      running += p.entradas - p.saidas;
      p.saldo = running;
    }

    // Insights
    const dayMap = new Map<number, number>();
    for (const r of paidByDayRes.data ?? []) {
      if (!r.paid_date) continue;
      const d = new Date(r.paid_date + "T00:00:00").getDay();
      dayMap.set(d, (dayMap.get(d) ?? 0) + Number(r.amount));
    }
    const bestDay = Array.from(dayMap.entries()).sort((a, b) => b[1] - a[1])[0];
    const dayNames = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
    const topProc = procedures[0];

    const insights: Insight[] = [
      {
        id: "rev",
        icon: "trend",
        tone: revenue.deltaPct >= 0 ? "success" : "warning",
        text: `Receita ${revenue.deltaPct >= 0 ? "aumentou" : "caiu"} ${Math.abs(revenue.deltaPct).toFixed(0)}% em comparação ao período anterior.`,
      },
      {
        id: "over",
        icon: "alert",
        tone: "warning",
        text: `${overduePatients} pacientes estão inadimplentes com parcelas em atraso.`,
      },
    ];
    if (topProc) {
      insights.push({
        id: "proc",
        icon: "tooth",
        tone: "violet",
        text: `${topProc.name} representam ${topProc.pct.toFixed(0)}% do faturamento total do período.`,
      });
    }
    if (bestDay) {
      insights.push({
        id: "day",
        icon: "calendar",
        tone: "info",
        text: `${dayNames[bestDay[0]]} é o dia mais lucrativo da semana em média.`,
      });
    }

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      kpis: {
        revenue,
        expenses,
        profit,
        margin,
        overdue: { total: overdueTotal, patients: overduePatients },
      },
      cashFlow: series,
      accounts,
      totalAvailable,
      upcomingReceivables,
      upcomingPayables,
      procedures,
      dentists,
      commissions,
      insights,
    };
  });
