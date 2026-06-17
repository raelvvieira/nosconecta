export type RangeDays = 30 | 60 | 90 | 180;

export type ProjectionPoint = {
  date: string; // ISO
  label: string;
  actual: number | null;
  projected: number | null;
  goal: number;
  risk: 0;
};

export type TimelineEvent = {
  id: string;
  date: string; // ISO
  type: "receivable" | "payable";
  category: "Recebimento" | "Folha de Pagamento" | "Aluguel" | "Laboratório" | "Equipamento" | "Imposto" | "Fornecedor";
  description: string;
  amount: number; // signed
  balanceAfter: number;
};

export type Scenario = {
  id: string;
  name: string;
  subtitle: string;
  baseValue: string;
  impact90d: number;
  icon: "user" | "device" | "tooth";
};

export type Insight = {
  id: string;
  tone: "success" | "warning" | "info" | "violet";
  icon: "trend" | "alert" | "pie" | "spark";
  text: string;
};

export const CURRENT_BALANCE = 28_800;
export const PROJECTED_30 = 42_300;
export const PROJECTED_90 = 71_900;
export const RUNWAY_DAYS = 64;

export const FORECAST_RECEIVABLES = 120_000;
export const FORECAST_PAYABLES = 78_000;
export const FORECAST_NET = FORECAST_RECEIVABLES - FORECAST_PAYABLES;

export const MONTHLY_GOAL = 120_000;
export const MONTHLY_REALIZED = 87_000;
export const MONTHLY_PROJECTION = 132_000;

const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function fmtLabel(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS_PT[d.getMonth()]}`;
}

/**
 * Builds a deterministic-looking projection curve over N days.
 * - Actual line stops at "today" (index 0); projected continues.
 * - Goal is a flat reference; risk band is rendered separately.
 */
export function buildProjection(rangeDays: RangeDays): ProjectionPoint[] {
  const points: ProjectionPoint[] = [];
  const today = new Date();
  // history: 14 days back for context
  const back = 14;
  const totalSteps = rangeDays + back;
  const step = Math.max(1, Math.round(totalSteps / 28)); // ~28 points

  let actual = CURRENT_BALANCE - 9_000; // start lower so we see a rise
  let projected = CURRENT_BALANCE;

  for (let i = -back; i <= rangeDays; i += step) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const isPast = i <= 0;

    if (isPast) {
      // simulate growth into today
      actual += 1_400 + Math.sin(i / 2) * 800;
    }

    // projected: gentle rise, mid dip, recovery, then mild decay if 180d
    const t = i / rangeDays;
    const wave = Math.sin(t * Math.PI * 2.2) * 7_000;
    const trend =
      rangeDays >= 180
        ? Math.min(70_000, 28_800 + i * 220) - Math.max(0, i - 90) * 380
        : 28_800 + i * (rangeDays === 30 ? 450 : rangeDays === 60 ? 380 : 480);
    projected = Math.round(trend + wave);

    points.push({
      date: d.toISOString(),
      label: fmtLabel(d),
      actual: isPast ? Math.round(actual) : null,
      projected: isPast && i !== 0 ? null : projected,
      goal: 50_000,
      risk: 0,
    });
  }
  return points;
}

export const TIMELINE_EVENTS: TimelineEvent[] = [
  { id: "1", date: "2026-06-20", type: "receivable", category: "Recebimento", description: "Implante - João Silva", amount: 4_500, balanceAfter: 31_800 },
  { id: "2", date: "2026-06-25", type: "payable", category: "Folha de Pagamento", description: "Folha mensal", amount: -18_000, balanceAfter: 13_800 },
  { id: "3", date: "2026-07-02", type: "payable", category: "Aluguel", description: "Aluguel mensal", amount: -3_500, balanceAfter: 10_300 },
  { id: "4", date: "2026-07-05", type: "receivable", category: "Recebimento", description: "Ortodontia - Maria Souza", amount: 2_800, balanceAfter: 13_100 },
  { id: "5", date: "2026-07-10", type: "payable", category: "Fornecedor", description: "Materiais odontológicos", amount: -2_200, balanceAfter: 10_900 },
  { id: "6", date: "2026-07-15", type: "payable", category: "Laboratório", description: "Próteses - Lab Sorriso", amount: -3_400, balanceAfter: 7_500 },
  { id: "7", date: "2026-07-20", type: "receivable", category: "Recebimento", description: "Clareamento - Carlos M.", amount: 1_800, balanceAfter: 9_300 },
];

export const SCENARIOS: Scenario[] = [
  { id: "s1", name: "Nova Contratação", subtitle: "Recepcionista", baseValue: "R$ 2.500/mês", impact90d: -7_500, icon: "user" },
  { id: "s2", name: "Novo Equipamento", subtitle: "Scanner Intraoral", baseValue: "Investimento único: R$ 35.000", impact90d: -22_000, icon: "device" },
  { id: "s3", name: "Novo Dentista", subtitle: "Dr. Carlos", baseValue: "Receita estimada: R$ 18.000/mês · Comissão: 40%", impact90d: 19_440, icon: "tooth" },
];

export const INSIGHTS: Insight[] = [
  { id: "i1", tone: "success", icon: "trend", text: "Receita projetada 18% maior que o mês anterior." },
  { id: "i2", tone: "warning", icon: "alert", text: "Saldo ficará negativo em 14 de agosto." },
  { id: "i3", tone: "violet", icon: "pie", text: "Ortodontia representa 47% da receita futura." },
  { id: "i4", tone: "info", icon: "spark", text: "Segunda-feira gera mais faturamento médio." },
];
