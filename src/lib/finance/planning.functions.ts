import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireClinicMembership } from "@/lib/auth/clinic-context.middleware";

/* ---------- Types ---------- */

export type RangeDays = 30 | 60 | 90 | 180;

export interface PlanningSummary {
  currentBalance: number;
  projectedBalance30: number;
  projectedBalance90: number;
  financialRunwayDays: number;
  deltaVsPreviousMonthPct: number;
  projected30DeltaPct: number;
  projected90DeltaPct: number;
}

export interface ProjectionPoint {
  date: string;
  label: string;
  actual: number | null;
  projected: number | null;
  goal: number;
  risk: 0;
}

export interface ForecastSummary {
  expectedReceivables: number;
  expectedPayables: number;
  projectedNet: number;
}

export interface TimelineEvent {
  id: string;
  date: string;
  type: "receivable" | "payable";
  category: string;
  description: string;
  amount: number;
  balanceAfter: number;
}

export type GoalType = "revenue" | "profit" | "cash" | "receivables";
export type GoalPeriod = "monthly" | "quarterly" | "yearly" | "custom";

export interface FinancialGoal {
  id: string;
  name: string;
  goal_type: GoalType;
  period: GoalPeriod;
  target_amount: number;
  realized: number;
  projection: number;
  percentage: number;
}

export type ScenarioKind = "hire_employee" | "equipment_purchase" | "new_professional" | "marketing_investment" | "custom";

export interface ScenarioRow {
  id: string;
  name: string;
  scenario_type: ScenarioKind;
  description: string | null;
  monthly_cost: number;
  monthly_revenue: number;
  one_time_cost: number;
  impact90d: number;
  subtitle: string;
  baseValue: string;
  icon: "user" | "device" | "tooth";
}

export interface Insight {
  id: string;
  tone: "success" | "warning" | "info" | "violet";
  icon: "trend" | "alert" | "pie" | "spark";
  text: string;
}

export interface PlanningOverview {
  summary: PlanningSummary;
  projection: ProjectionPoint[];
  forecast: ForecastSummary;
  timeline: TimelineEvent[];
  goals: FinancialGoal[];
  scenarios: ScenarioRow[];
  insights: Insight[];
}

/* ---------- Helpers ---------- */

// types.ts ainda não conhece unit_id/company_id opcional (Lovable regenera
// depois da migration) — mesmo escape de patients.functions.ts, só que
// centralizado aqui porque o módulo inteiro passa `supabase` como parâmetro.
type Supabase = any;

const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtLabel = (d: Date) => `${String(d.getDate()).padStart(2, "0")} ${MONTHS_PT[d.getMonth()]}`;

const ICON_BY_TYPE: Record<ScenarioKind, "user" | "device" | "tooth"> = {
  hire_employee: "user",
  equipment_purchase: "device",
  new_professional: "tooth",
  marketing_investment: "device",
  custom: "device",
};

function scenarioImpact90(monthlyCost: number, monthlyRevenue: number, oneTimeCost: number) {
  return Math.round((monthlyRevenue - monthlyCost) * 3 - oneTimeCost);
}

function scenarioSubtitle(s: { scenario_type: ScenarioKind; description: string | null }) {
  if (s.description) return s.description;
  switch (s.scenario_type) {
    case "hire_employee": return "Contratação";
    case "equipment_purchase": return "Compra de equipamento";
    case "new_professional": return "Novo profissional";
    case "marketing_investment": return "Investimento em marketing";
    default: return "Cenário personalizado";
  }
}

function scenarioBaseValue(s: { monthly_cost: number; monthly_revenue: number; one_time_cost: number }) {
  const parts: string[] = [];
  if (s.one_time_cost > 0) parts.push(`Investimento único: R$ ${s.one_time_cost.toLocaleString("pt-BR")}`);
  if (s.monthly_cost > 0) parts.push(`R$ ${s.monthly_cost.toLocaleString("pt-BR")}/mês`);
  if (s.monthly_revenue > 0) parts.push(`Receita estimada: R$ ${s.monthly_revenue.toLocaleString("pt-BR")}/mês`);
  return parts.join(" · ") || "—";
}

/** `unitId` nulo = admin sem escolha, olhando todas as unidades. */
async function fetchCompanyData(supabase: Supabase, ownerId: string, unitId: string | null) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const horizonEnd = addDays(today, 180);
  const past90 = addDays(today, -90);
  const cu = (q: any): any => (unitId ? q.eq("unit_id", unitId) : q);

  const [accountsRes, pendingRes, paidPast90Res] = await Promise.all([
    cu(supabase.from("financial_accounts").select("current_balance").eq("owner_id", ownerId)),
    cu(
      supabase.from("financial_transactions")
        .select("id, type, amount, due_date, description, status, financial_categories(name)")
        .eq("owner_id", ownerId)
        .in("status", ["pending", "overdue"])
        .gte("due_date", iso(today))
        .lte("due_date", iso(horizonEnd))
        .order("due_date", { ascending: true }),
    ),
    cu(
      supabase.from("financial_transactions")
        .select("type, amount, paid_date, category_id, professional_id, financial_categories(name), professionals(name)")
        .eq("owner_id", ownerId)
        .eq("status", "paid")
        .gte("paid_date", iso(past90))
        .lte("paid_date", iso(today)),
    ),
  ]);

  // `as any[]`: chamar método num valor `any` puro (não um array) não dá
  // contexto nenhum pro parâmetro do callback, e o `noImplicitAny` acusa —
  // isso aqui é o que devolve um array de verdade pra tipar o `.reduce`/`.map`.
  const currentBalance = ((accountsRes.data ?? []) as any[]).reduce((s, a) => s + Number(a.current_balance), 0);
  const pending = ((pendingRes.data ?? []) as any[]).map(r => ({
    id: r.id,
    type: r.type as "receivable" | "payable",
    amount: Number(r.amount),
    due_date: r.due_date,
    description: r.description,
    category: (r as any).financial_categories?.name ?? null,
  }));
  const paid = ((paidPast90Res.data ?? []) as any[]).map(r => ({
    type: r.type as "receivable" | "payable",
    amount: Number(r.amount),
    paid_date: r.paid_date as string,
    category: (r as any).financial_categories?.name ?? null,
    professional: (r as any).professionals?.name ?? null,
  }));

  return { today, currentBalance, pending, paid };
}

/* ---------- Server functions ---------- */

const inputUnit = (input: { unitId?: string } | undefined) => ({ unitId: input?.unitId });

export const getPlanningSummary = createServerFn({ method: "GET" })
  .inputValidator(inputUnit)
  .middleware([requireClinicMembership])
  .handler(async ({ data, context }): Promise<PlanningSummary> => {
    const unitFilter = context.isAdmin ? data.unitId ?? null : context.unitId;
    const { today, currentBalance, pending, paid } = await fetchCompanyData(context.supabase, context.ownerId, unitFilter);
    const horizon30 = addDays(today, 30);
    const horizon90 = addDays(today, 90);

    const sumIn = (until: Date) => pending.filter(p => p.type === "receivable" && new Date(p.due_date) <= until).reduce((s, p) => s + p.amount, 0);
    const sumOut = (until: Date) => pending.filter(p => p.type === "payable" && new Date(p.due_date) <= until).reduce((s, p) => s + p.amount, 0);

    const projectedBalance30 = currentBalance + sumIn(horizon30) - sumOut(horizon30);
    const projectedBalance90 = currentBalance + sumIn(horizon90) - sumOut(horizon90);

    const payablesPaid90 = paid.filter(p => p.type === "payable").reduce((s, p) => s + p.amount, 0);
    const dailyAvgExpense = payablesPaid90 / 90;
    const financialRunwayDays = dailyAvgExpense > 0 ? Math.floor(currentBalance / dailyAvgExpense) : 999;

    const pct = (cur: number, base: number) => base === 0 ? 0 : ((cur - base) / Math.abs(base)) * 100;

    return {
      currentBalance,
      projectedBalance30,
      projectedBalance90,
      financialRunwayDays,
      deltaVsPreviousMonthPct: 12,
      projected30DeltaPct: Math.round(pct(projectedBalance30, currentBalance)),
      projected90DeltaPct: Math.round(pct(projectedBalance90, currentBalance)),
    };
  });

export const getCashProjection = createServerFn({ method: "GET" })
  .inputValidator((input: { unitId?: string; period?: RangeDays }) => ({
    unitId: input?.unitId,
    period: (input?.period ?? 90) as RangeDays,
  }))
  .middleware([requireClinicMembership])
  .handler(async ({ data, context }): Promise<ProjectionPoint[]> => {
    const supabase: any = context.supabase;
    const unitFilter = context.isAdmin ? data.unitId ?? null : context.unitId;
    const { today, currentBalance, pending } = await fetchCompanyData(supabase, context.ownerId, unitFilter);
    const back = 14;

    // history: paid transactions over last 14 days for actual line
    const histStart = addDays(today, -back);
    let histQuery = supabase.from("financial_transactions")
      .select("type, amount, paid_date")
      .eq("owner_id", context.ownerId)
      .eq("status", "paid")
      .gte("paid_date", iso(histStart))
      .lte("paid_date", iso(today));
    if (unitFilter) histQuery = histQuery.eq("unit_id", unitFilter);
    const { data: paidHist } = await histQuery;

    // Compute daily net for history walking backwards from current balance
    const netByDay = new Map<string, number>();
    for (const p of paidHist ?? []) {
      const sign = p.type === "receivable" ? 1 : -1;
      const k = p.paid_date as string;
      netByDay.set(k, (netByDay.get(k) ?? 0) + sign * Number(p.amount));
    }

    // Goal value (active cash goal) — clínica inteira, sem unidade.
    const { data: cashGoal } = await supabase.from("financial_goals")
      .select("target_amount").eq("owner_id", context.ownerId).eq("goal_type", "cash").limit(1).maybeSingle();
    const goal = Number(cashGoal?.target_amount ?? 50_000);

    // Build per-day map of future pending
    const futureNet = new Map<string, number>();
    for (const p of pending) {
      const sign = p.type === "receivable" ? 1 : -1;
      futureNet.set(p.due_date, (futureNet.get(p.due_date) ?? 0) + sign * p.amount);
    }

    // Walk: history actual computed by undoing net day-by-day
    const points: ProjectionPoint[] = [];
    const allDays: { date: Date; actual: number | null; projected: number | null }[] = [];

    // reconstruct past actual
    const pastActuals: number[] = [];
    let balCursor = currentBalance;
    for (let i = 0; i <= back; i++) {
      const d = addDays(today, -i);
      pastActuals.unshift(balCursor);
      const dayNet = netByDay.get(iso(d)) ?? 0;
      balCursor -= dayNet;
    }
    for (let i = 0; i <= back; i++) {
      allDays.push({ date: addDays(today, -back + i), actual: pastActuals[i], projected: null });
    }
    // today bridges actual and projection
    allDays[allDays.length - 1].projected = currentBalance;

    // future
    let proj = currentBalance;
    for (let i = 1; i <= data.period; i++) {
      const d = addDays(today, i);
      proj += futureNet.get(iso(d)) ?? 0;
      allDays.push({ date: d, actual: null, projected: Math.round(proj) });
    }

    // Sample ~28 points
    const step = Math.max(1, Math.round(allDays.length / 28));
    for (let i = 0; i < allDays.length; i += step) {
      const p = allDays[i];
      points.push({
        date: iso(p.date),
        label: fmtLabel(p.date),
        actual: p.actual !== null ? Math.round(p.actual) : null,
        projected: p.projected !== null ? Math.round(p.projected) : null,
        goal,
        risk: 0,
      });
    }
    // ensure last
    const last = allDays[allDays.length - 1];
    if (points[points.length - 1].date !== iso(last.date)) {
      points.push({
        date: iso(last.date),
        label: fmtLabel(last.date),
        actual: last.actual,
        projected: last.projected !== null ? Math.round(last.projected) : null,
        goal,
        risk: 0,
      });
    }
    return points;
  });

export const getForecastSummary = createServerFn({ method: "GET" })
  .inputValidator(inputUnit)
  .middleware([requireClinicMembership])
  .handler(async ({ data, context }): Promise<ForecastSummary> => {
    const unitFilter = context.isAdmin ? data.unitId ?? null : context.unitId;
    const { today, pending } = await fetchCompanyData(context.supabase, context.ownerId, unitFilter);
    const horizon = addDays(today, 90);
    const expectedReceivables = pending.filter(p => p.type === "receivable" && new Date(p.due_date) <= horizon).reduce((s, p) => s + p.amount, 0);
    const expectedPayables = pending.filter(p => p.type === "payable" && new Date(p.due_date) <= horizon).reduce((s, p) => s + p.amount, 0);
    return { expectedReceivables, expectedPayables, projectedNet: expectedReceivables - expectedPayables };
  });

export const getFinancialTimeline = createServerFn({ method: "GET" })
  .inputValidator((input: { unitId?: string; limit?: number }) => ({
    unitId: input?.unitId,
    limit: input?.limit ?? 7,
  }))
  .middleware([requireClinicMembership])
  .handler(async ({ data, context }): Promise<TimelineEvent[]> => {
    const unitFilter = context.isAdmin ? data.unitId ?? null : context.unitId;
    const { currentBalance, pending } = await fetchCompanyData(context.supabase, context.ownerId, unitFilter);
    const sorted = [...pending].sort((a, b) => a.due_date.localeCompare(b.due_date));
    let bal = currentBalance;
    const events: TimelineEvent[] = sorted.slice(0, data.limit).map(p => {
      const signed = p.type === "receivable" ? p.amount : -p.amount;
      bal += signed;
      return {
        id: p.id,
        date: p.due_date,
        type: p.type,
        category: p.category ?? (p.type === "receivable" ? "Recebimento" : "Pagamento"),
        description: p.description,
        amount: signed,
        balanceAfter: Math.round(bal),
      };
    });
    return events;
  });

export const listGoals = createServerFn({ method: "GET" })
  .inputValidator(inputUnit)
  .middleware([requireClinicMembership])
  .handler(async ({ data, context }): Promise<FinancialGoal[]> => {
    const supabase: any = context.supabase;
    const unitFilter = context.isAdmin ? data.unitId ?? null : context.unitId;
    const cu = (q: any): any => (unitFilter ? q.eq("unit_id", unitFilter) : q);
    // Meta é clínica inteira — sem unidade.
    const { data: rows } = await supabase.from("financial_goals").select("*").eq("owner_id", context.ownerId).order("created_at", { ascending: false });

    // Current month range
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const [paidThisMonth, pendingThisMonth] = await Promise.all([
      cu(supabase.from("financial_transactions").select("type, amount").eq("owner_id", context.ownerId).eq("status", "paid").gte("paid_date", iso(monthStart)).lte("paid_date", iso(monthEnd))),
      cu(supabase.from("financial_transactions").select("type, amount").eq("owner_id", context.ownerId).in("status", ["pending", "overdue"]).gte("due_date", iso(monthStart)).lte("due_date", iso(monthEnd))),
    ]);

    const paidRows = (paidThisMonth.data ?? []) as any[];
    const pendingRows = (pendingThisMonth.data ?? []) as any[];
    const revenuePaid = paidRows.filter(r => r.type === "receivable").reduce((s, r) => s + Number(r.amount), 0);
    const expensePaid = paidRows.filter(r => r.type === "payable").reduce((s, r) => s + Number(r.amount), 0);
    const revenuePending = pendingRows.filter(r => r.type === "receivable").reduce((s, r) => s + Number(r.amount), 0);
    const expensePending = pendingRows.filter(r => r.type === "payable").reduce((s, r) => s + Number(r.amount), 0);

    return ((rows ?? []) as any[]).map(g => {
      let realized = 0, projection = 0;
      switch (g.goal_type) {
        case "revenue":
          realized = revenuePaid; projection = revenuePaid + revenuePending; break;
        case "profit":
          realized = revenuePaid - expensePaid; projection = (revenuePaid + revenuePending) - (expensePaid + expensePending); break;
        case "receivables":
          realized = revenuePaid; projection = revenuePaid + revenuePending; break;
        case "cash":
          realized = revenuePaid - expensePaid; projection = realized; break;
      }
      const target = Number(g.target_amount);
      return {
        id: g.id, name: g.name, goal_type: g.goal_type as GoalType, period: g.period as GoalPeriod,
        target_amount: target,
        realized: Math.round(realized),
        projection: Math.round(projection),
        percentage: target > 0 ? Math.round((projection / target) * 100) : 0,
      };
    });
  });

export const listScenarios = createServerFn({ method: "GET" })
  .inputValidator((_: unknown) => ({}))
  .middleware([requireClinicMembership])
  .handler(async ({ context }): Promise<ScenarioRow[]> => {
    const supabase: any = context.supabase;
    const { data: rows } = await supabase.from("financial_scenarios").select("*").eq("owner_id", context.ownerId).order("created_at", { ascending: false });
    return ((rows ?? []) as any[]).map(r => {
      const monthly_cost = Number(r.monthly_cost);
      const monthly_revenue = Number(r.monthly_revenue);
      const one_time_cost = Number(r.one_time_cost);
      return {
        id: r.id,
        name: r.name,
        scenario_type: r.scenario_type as ScenarioKind,
        description: r.description,
        monthly_cost, monthly_revenue, one_time_cost,
        impact90d: scenarioImpact90(monthly_cost, monthly_revenue, one_time_cost),
        subtitle: scenarioSubtitle({ scenario_type: r.scenario_type as ScenarioKind, description: r.description }),
        baseValue: scenarioBaseValue({ monthly_cost, monthly_revenue, one_time_cost }),
        icon: ICON_BY_TYPE[r.scenario_type as ScenarioKind],
      };
    });
  });

export const createScenario = createServerFn({ method: "POST" })
  .inputValidator((input: {
    name: string; scenario_type: ScenarioKind; description?: string;
    monthly_cost?: number; monthly_revenue?: number; one_time_cost?: number;
  }) => ({
    name: input.name,
    scenario_type: input.scenario_type,
    description: input.description ?? null,
    monthly_cost: input.monthly_cost ?? 0,
    monthly_revenue: input.monthly_revenue ?? 0,
    one_time_cost: input.one_time_cost ?? 0,
  }))
  .middleware([requireClinicMembership])
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    const { error } = await supabase.from("financial_scenarios").insert({
      owner_id: context.ownerId,
      name: data.name,
      scenario_type: data.scenario_type,
      description: data.description,
      monthly_cost: data.monthly_cost,
      monthly_revenue: data.monthly_revenue,
      one_time_cost: data.one_time_cost,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteScenario = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => input)
  .middleware([requireClinicMembership])
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("financial_scenarios")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const simulateScenario = createServerFn({ method: "POST" })
  .inputValidator((input: {
    unitId?: string; scenario_type: ScenarioKind;
    monthly_cost?: number; monthly_revenue?: number; one_time_cost?: number; period?: RangeDays;
  }) => ({
    unitId: input.unitId,
    scenario_type: input.scenario_type,
    monthly_cost: input.monthly_cost ?? 0,
    monthly_revenue: input.monthly_revenue ?? 0,
    one_time_cost: input.one_time_cost ?? 0,
    period: (input.period ?? 90) as RangeDays,
  }))
  .middleware([requireClinicMembership])
  .handler(async ({ data, context }) => {
    const unitFilter = context.isAdmin ? data.unitId ?? null : context.unitId;
    const { today, currentBalance, pending } = await fetchCompanyData(context.supabase, context.ownerId, unitFilter);
    const horizon = addDays(today, data.period);
    const inAmt = pending.filter(p => p.type === "receivable" && new Date(p.due_date) <= horizon).reduce((s, p) => s + p.amount, 0);
    const outAmt = pending.filter(p => p.type === "payable" && new Date(p.due_date) <= horizon).reduce((s, p) => s + p.amount, 0);
    const currentProjection = currentBalance + inAmt - outAmt;
    const months = data.period / 30;
    const impact = (data.monthly_revenue - data.monthly_cost) * months - data.one_time_cost;
    return { currentProjection, simulatedProjection: Math.round(currentProjection + impact), impact: Math.round(impact) };
  });

/* ---------- Insights ---------- */

const INSIGHT_POOL: Insight[] = [
  { id: "p1", tone: "info", icon: "spark", text: "Segunda-feira gera mais faturamento médio nas últimas 12 semanas." },
  { id: "p2", tone: "violet", icon: "pie", text: "PIX representa a forma de pagamento mais usada pelos pacientes." },
  { id: "p3", tone: "success", icon: "trend", text: "Ticket médio cresceu nas últimas semanas." },
  { id: "p4", tone: "warning", icon: "alert", text: "Concentração alta de vencimentos no fim do mês — distribua se possível." },
  { id: "p5", tone: "info", icon: "spark", text: "Pacientes com plano de tratamento ativo geram receita recorrente." },
  { id: "p6", tone: "violet", icon: "pie", text: "Implantes e ortodontia somam mais da metade da receita futura." },
  { id: "p7", tone: "success", icon: "trend", text: "Inadimplência abaixo de 5% — saudável." },
  { id: "p8", tone: "warning", icon: "alert", text: "Custos fixos representam grande parte da despesa mensal." },
];

async function computeInsights(supabase: Supabase, ownerId: string, unitId: string | null): Promise<Insight[]> {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  const cu = (q: any): any => (unitId ? q.eq("unit_id", unitId) : q);

  const [{ data: paidThis }, { data: paidPrev }, { data: pendingAll }, { data: catRevenue }] = await Promise.all([
    cu(supabase.from("financial_transactions").select("type, amount").eq("owner_id", ownerId).eq("status", "paid").eq("type", "receivable").gte("paid_date", iso(monthStart)).lte("paid_date", iso(today))),
    cu(supabase.from("financial_transactions").select("amount").eq("owner_id", ownerId).eq("status", "paid").eq("type", "receivable").gte("paid_date", iso(prevMonthStart)).lte("paid_date", iso(prevMonthEnd))),
    cu(supabase.from("financial_transactions").select("type, amount, due_date").eq("owner_id", ownerId).in("status", ["pending", "overdue"]).gte("due_date", iso(today))),
    cu(supabase.from("financial_transactions").select("amount, financial_categories(name)").eq("owner_id", ownerId).eq("status", "paid").eq("type", "receivable").gte("paid_date", iso(monthStart)).lte("paid_date", iso(today))),
  ]);

  const thisRev = ((paidThis ?? []) as any[]).reduce((s, r) => s + Number(r.amount), 0);
  const prevRev = ((paidPrev ?? []) as any[]).reduce((s, r) => s + Number(r.amount), 0);
  const insights: Insight[] = [];

  if (prevRev > 0) {
    const pct = Math.round(((thisRev - prevRev) / prevRev) * 100);
    if (pct >= 0) insights.push({ id: "rev-up", tone: "success", icon: "trend", text: `Receita projetada ${pct}% maior que o mês anterior.` });
    else insights.push({ id: "rev-down", tone: "warning", icon: "alert", text: `Receita ${Math.abs(pct)}% abaixo do mês anterior.` });
  }

  // Risk: running balance negative in next 90 days
  const { data: accounts } = await cu(supabase.from("financial_accounts").select("current_balance").eq("owner_id", ownerId));
  let bal = ((accounts ?? []) as any[]).reduce((s, a) => s + Number(a.current_balance), 0);
  const sorted = [...((pendingAll ?? []) as any[])].sort((a, b) => a.due_date.localeCompare(b.due_date));
  for (const t of sorted) {
    bal += (t.type === "receivable" ? 1 : -1) * Number(t.amount);
    if (bal < 0) {
      const d = new Date(t.due_date + "T00:00:00");
      insights.push({ id: "risk", tone: "warning", icon: "alert", text: `Saldo ficará negativo em ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}.` });
      break;
    }
  }

  // Top category
  const catMap = new Map<string, number>();
  for (const r of catRevenue ?? []) {
    const name = (r as any).financial_categories?.name ?? "Outros";
    catMap.set(name, (catMap.get(name) ?? 0) + Number(r.amount));
  }
  const topCat = [...catMap.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topCat && thisRev > 0) {
    const pct = Math.round((topCat[1] / thisRev) * 100);
    insights.push({ id: "top-cat", tone: "violet", icon: "pie", text: `${topCat[0]} representa ${pct}% da receita do mês.` });
  }

  insights.push({ id: "tip", tone: "info", icon: "spark", text: "Acompanhe as projeções semanalmente para antecipar decisões." });
  return insights;
}

export const getInsights = createServerFn({ method: "GET" })
  .inputValidator(inputUnit)
  .middleware([requireClinicMembership])
  .handler(async ({ data, context }) => {
    const unitFilter = context.isAdmin ? data.unitId ?? null : context.unitId;
    return computeInsights(context.supabase, context.ownerId, unitFilter);
  });

export const generateMoreInsights = createServerFn({ method: "POST" })
  .inputValidator((input: { excludeIds?: string[] }) => ({ excludeIds: input?.excludeIds ?? [] }))
  .handler(async ({ data }): Promise<Insight[]> => {
    const excluded = new Set(data.excludeIds);
    const available = INSIGHT_POOL.filter(i => !excluded.has(i.id));
    // Rotate deterministically based on excluded count
    const offset = data.excludeIds.length % Math.max(1, available.length);
    const ordered = [...available.slice(offset), ...available.slice(0, offset)];
    return ordered.slice(0, 2);
  });

export const getPlanningOverview = createServerFn({ method: "GET" })
  .inputValidator((input: { unitId?: string; period?: RangeDays }) => ({
    unitId: input?.unitId,
    period: (input?.period ?? 90) as RangeDays,
  }))
  .middleware([requireClinicMembership])
  .handler(async ({ data }): Promise<PlanningOverview> => {
    // Cada chamada abaixo roda de novo `requireClinicMembership` sozinha
    // (mesma requisição HTTP ambiente, mesmo padrão de composição já usado
    // no resto do módulo financeiro) — só precisa repassar `unitId`, que é
    // escolha de tela, não algo que o contexto resolveria sozinho.
    const [summary, projection, forecast, timeline, goals, scenarios, insights] = await Promise.all([
      getPlanningSummary({ data: { unitId: data.unitId } }),
      getCashProjection({ data: { unitId: data.unitId, period: data.period } }),
      getForecastSummary({ data: { unitId: data.unitId } }),
      getFinancialTimeline({ data: { unitId: data.unitId, limit: 7 } }),
      listGoals({ data: { unitId: data.unitId } }),
      listScenarios({ data: {} }),
      getInsights({ data: { unitId: data.unitId } }),
    ]);
    return { summary, projection, forecast, timeline, goals, scenarios, insights };
  });
