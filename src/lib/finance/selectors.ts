import {
  accounts,
  categories,
  lookup,
  professionals,
  TODAY_REF,
  transactions,
} from "./mock-data";
import type { Granularity, Period, FinancialTransaction } from "./types";

export interface DateRange {
  from: Date;
  to: Date;
}

export const periodToRange = (period: Period): DateRange => {
  const to = new Date(TODAY_REF);
  to.setHours(23, 59, 59, 999);
  const from = new Date(TODAY_REF);
  from.setHours(0, 0, 0, 0);
  switch (period) {
    case "today":
      break;
    case "7d":
      from.setDate(from.getDate() - 6);
      break;
    case "30d":
      from.setDate(from.getDate() - 29);
      break;
    case "90d":
      from.setDate(from.getDate() - 89);
      break;
    case "custom":
      from.setDate(from.getDate() - 29);
      break;
  }
  return { from, to };
};

const previousRange = ({ from, to }: DateRange): DateRange => {
  const span = to.getTime() - from.getTime();
  return { from: new Date(from.getTime() - span - 1), to: new Date(from.getTime() - 1) };
};

const within = (iso: string | null, range: DateRange) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= range.from.getTime() && t <= range.to.getTime();
};

const sum = (arr: FinancialTransaction[]) => arr.reduce((acc, t) => acc + t.amount, 0);

export const getRevenue = (range: DateRange) =>
  sum(transactions.filter((t) => t.type === "receivable" && t.status === "paid" && within(t.paid_date, range)));

export const getExpenses = (range: DateRange) =>
  sum(transactions.filter((t) => t.type === "payable" && t.status === "paid" && within(t.paid_date, range)));

export const getOverdue = (range: DateRange) => {
  const overdue = transactions.filter(
    (t) => t.type === "receivable" && t.status === "overdue" && within(t.due_date, { from: new Date(0), to: range.to }),
  );
  const patientIds = new Set(overdue.map((t) => t.patient_id).filter(Boolean));
  return { total: sum(overdue), patients: patientIds.size };
};

export interface KpiVariation {
  current: number;
  previous: number;
  deltaPct: number;
}

const variation = (current: number, previous: number): KpiVariation => {
  const deltaPct = previous === 0 ? (current === 0 ? 0 : 100) : ((current - previous) / previous) * 100;
  return { current, previous, deltaPct };
};

export const getKpis = (range: DateRange) => {
  const prev = previousRange(range);
  const revenue = variation(getRevenue(range), getRevenue(prev));
  const expenses = variation(getExpenses(range), getExpenses(prev));
  const profit = variation(revenue.current - expenses.current, revenue.previous - expenses.previous);
  const margin = revenue.current === 0 ? 0 : (profit.current / revenue.current) * 100;
  const overdue = getOverdue(range);
  return { revenue, expenses, profit, margin, overdue };
};

// ---------- Cash flow series ----------

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const bucketKey = (d: Date, gran: Granularity) => {
  const x = startOfDay(d);
  if (gran === "daily") return x.toISOString().slice(0, 10);
  if (gran === "weekly") {
    const day = x.getDay();
    const monday = new Date(x);
    monday.setDate(x.getDate() - ((day + 6) % 7));
    return monday.toISOString().slice(0, 10);
  }
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
};

const labelFor = (key: string, gran: Granularity) => {
  if (gran === "monthly") {
    const [y, m] = key.split("-");
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("pt-BR", { month: "short" });
  }
  const d = new Date(key + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

export interface CashFlowPoint {
  key: string;
  label: string;
  entradas: number;
  saidas: number;
  receb_futuro: number;
  saldo: number;
}

export const getCashFlowSeries = (range: DateRange, gran: Granularity): CashFlowPoint[] => {
  const buckets = new Map<string, CashFlowPoint>();

  // seed empty buckets
  const cursor = startOfDay(range.from);
  const end = startOfDay(range.to);
  while (cursor.getTime() <= end.getTime()) {
    const k = bucketKey(cursor, gran);
    if (!buckets.has(k)) {
      buckets.set(k, { key: k, label: labelFor(k, gran), entradas: 0, saidas: 0, receb_futuro: 0, saldo: 0 });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const t of transactions) {
    // realized inflow
    if (t.type === "receivable" && t.status === "paid" && t.paid_date && within(t.paid_date, range)) {
      const k = bucketKey(new Date(t.paid_date), gran);
      const b = buckets.get(k);
      if (b) b.entradas += t.amount;
    }
    // realized outflow
    if (t.type === "payable" && t.status === "paid" && t.paid_date && within(t.paid_date, range)) {
      const k = bucketKey(new Date(t.paid_date), gran);
      const b = buckets.get(k);
      if (b) b.saidas += t.amount;
    }
    // future receivable
    if (t.type === "receivable" && t.status === "pending" && within(t.due_date, range)) {
      const k = bucketKey(new Date(t.due_date), gran);
      const b = buckets.get(k);
      if (b) b.receb_futuro += t.amount;
    }
  }

  // running saldo
  let running = 0;
  const series = Array.from(buckets.values()).sort((a, b) => (a.key < b.key ? -1 : 1));
  for (const p of series) {
    running += p.entradas - p.saidas;
    p.saldo = running;
  }
  return series;
};

// ---------- Lists ----------

export const getUpcomingReceivables = (limit = 5) => {
  return transactions
    .filter((t) => t.type === "receivable" && t.status === "pending" && new Date(t.due_date) >= startOfDay(TODAY_REF))
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, limit)
    .map((t) => ({
      ...t,
      patient: lookup.patient(t.patient_id),
    }));
};

export const getUpcomingPayables = (limit = 5) => {
  return transactions
    .filter((t) => t.type === "payable" && t.status === "pending" && new Date(t.due_date) >= startOfDay(TODAY_REF))
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, limit)
    .map((t) => ({
      ...t,
      category: lookup.category(t.category_id),
    }));
};

// ---------- Breakdowns ----------

export const getRevenueByProcedure = (range: DateRange) => {
  const map = new Map<string, number>();
  for (const t of transactions) {
    if (t.type === "receivable" && t.status === "paid" && within(t.paid_date, range)) {
      map.set(t.category_id, (map.get(t.category_id) ?? 0) + t.amount);
    }
  }
  const total = Array.from(map.values()).reduce((a, b) => a + b, 0) || 1;
  return categories
    .filter((c) => c.type === "income")
    .map((c) => ({
      id: c.id,
      name: c.name,
      value: map.get(c.id) ?? 0,
      pct: ((map.get(c.id) ?? 0) / total) * 100,
    }))
    .sort((a, b) => b.value - a.value);
};

export const getRevenueByDentist = (range: DateRange) => {
  const map = new Map<string, number>();
  for (const t of transactions) {
    if (t.type === "receivable" && t.status === "paid" && t.professional_id && within(t.paid_date, range)) {
      map.set(t.professional_id, (map.get(t.professional_id) ?? 0) + t.amount);
    }
  }
  const ranked = professionals
    .map((p) => ({ id: p.id, name: p.name, value: map.get(p.id) ?? 0 }))
    .sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...ranked.map((r) => r.value));
  return ranked.map((r) => ({ ...r, pct: (r.value / max) * 100 }));
};

export const getCommissions = (range: DateRange) => {
  const rev = getRevenueByDentist(range);
  return rev.map((r) => {
    const prof = professionals.find((p) => p.id === r.id)!;
    return {
      id: r.id,
      name: r.name,
      pct: prof.commission_pct,
      value: (r.value * prof.commission_pct) / 100,
    };
  });
};

// ---------- Accounts ----------

export const getAccounts = () => accounts;
export const getTotalAvailable = () => accounts.reduce((a, b) => a + b.current_balance, 0);

// ---------- Insights ----------

export interface Insight {
  id: string;
  icon: "trend" | "alert" | "tooth" | "calendar";
  text: string;
  tone: "info" | "warning" | "success" | "violet";
}

export const getInsights = (range: DateRange): Insight[] => {
  const kpis = getKpis(range);
  const proc = getRevenueByProcedure(range);
  const topProc = proc[0];
  const dayMap = new Map<number, number>();
  for (const t of transactions) {
    if (t.type === "receivable" && t.status === "paid" && t.paid_date && within(t.paid_date, range)) {
      const d = new Date(t.paid_date).getDay();
      dayMap.set(d, (dayMap.get(d) ?? 0) + t.amount);
    }
  }
  const bestDayEntry = Array.from(dayMap.entries()).sort((a, b) => b[1] - a[1])[0];
  const dayNames = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

  const insights: Insight[] = [
    {
      id: "rev",
      icon: "trend",
      tone: kpis.revenue.deltaPct >= 0 ? "success" : "warning",
      text: `Receita ${kpis.revenue.deltaPct >= 0 ? "aumentou" : "caiu"} ${Math.abs(kpis.revenue.deltaPct).toFixed(0)}% em comparação ao período anterior.`,
    },
    {
      id: "over",
      icon: "alert",
      tone: "warning",
      text: `${kpis.overdue.patients} pacientes estão inadimplentes com parcelas em atraso.`,
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
  if (bestDayEntry) {
    insights.push({
      id: "day",
      icon: "calendar",
      tone: "info",
      text: `${dayNames[bestDayEntry[0]]} é o dia mais lucrativo da semana em média.`,
    });
  }
  return insights;
};
