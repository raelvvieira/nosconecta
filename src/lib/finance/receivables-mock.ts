export type ReceivableStatus = "received" | "pending" | "overdue" | "canceled";
export type PaymentMethod = "pix" | "credit" | "debit" | "cash" | "boleto" | "transfer";

export type Receivable = {
  id: string;
  patientName: string;
  patientInitials: string;
  procedure: string;
  professional: string;
  amount: number;
  dueDate: string; // ISO date
  receivedDate?: string;
  status: ReceivableStatus;
  paymentMethod: PaymentMethod;
  installmentNumber?: number;
  installmentTotal?: number;
  isRecurring: boolean;
  recurrenceType?: "weekly" | "monthly" | "yearly";
  notes?: string;
};

export const PAYMENT_METHODS: Record<PaymentMethod, { label: string; color: string }> = {
  pix: { label: "PIX", color: "text-emerald-600" },
  credit: { label: "Cartão de Crédito", color: "text-violet" },
  debit: { label: "Cartão de Débito", color: "text-sky-600" },
  cash: { label: "Dinheiro", color: "text-foreground" },
  boleto: { label: "Boleto", color: "text-amber-600" },
  transfer: { label: "Transferência", color: "text-info" },
};

export const STATUS_BADGE: Record<ReceivableStatus, string> = {
  received: "bg-success-soft text-success",
  pending: "bg-warning-soft text-warning",
  overdue: "bg-danger-soft text-danger",
  canceled: "bg-muted text-muted-foreground",
};
export const STATUS_LABEL: Record<ReceivableStatus, string> = {
  received: "Recebido",
  pending: "Pendente",
  overdue: "Atrasado",
  canceled: "Cancelado",
};

export const KPIS = {
  receivedInPeriod: { value: 87420, deltaPct: 18 },
  toReceive: { value: 18600, installments: 12 },
  overdue: { value: 2180, patients: 5 },
  averageTicket: { value: 1240, periodLabel: "Este mês" },
};

export const EVOLUTION_SERIES = [
  { period: "Jan", received: 62000, expected: 18000, overdue: 1800, goal: 70000 },
  { period: "Fev", received: 58000, expected: 17500, overdue: 2100, goal: 70000 },
  { period: "Mar", received: 71000, expected: 19500, overdue: 1500, goal: 70000 },
  { period: "Abr", received: 65000, expected: 18800, overdue: 2400, goal: 70000 },
  { period: "Mai", received: 78000, expected: 21000, overdue: 1900, goal: 70000 },
  { period: "Jun", received: 62450, expected: 18600, overdue: 2180, goal: 70000 },
  { period: "Jul", received: 81000, expected: 20100, overdue: 1700, goal: 70000 },
  { period: "Ago", received: 74000, expected: 19200, overdue: 2050, goal: 70000 },
  { period: "Set", received: 79000, expected: 21800, overdue: 1850, goal: 70000 },
  { period: "Out", received: 83000, expected: 22500, overdue: 1600, goal: 70000 },
  { period: "Nov", received: 76000, expected: 20400, overdue: 1900, goal: 70000 },
  { period: "Dez", received: 88000, expected: 23200, overdue: 1450, goal: 70000 },
];

export const TOP_PROCEDURES = [
  { name: "Implantes", value: 42000, pct: 48, color: "#7c3aed" },
  { name: "Ortodontia", value: 31000, pct: 35, color: "#06b6d4" },
  { name: "Estética", value: 8700, pct: 10, color: "#f97316" },
  { name: "Clínica Geral", value: 5720, pct: 7, color: "#22c55e" },
];

export const TOP_DENTISTS = [
  { name: "Dr. João Santos", initials: "JS", value: 45000 },
  { name: "Dra. Ana Paula", initials: "AP", value: 38000 },
  { name: "Dr. Carlos Mendes", initials: "CM", value: 12400 },
  { name: "Dra. Fernanda Lima", initials: "FL", value: 7820 },
];

export const DEFAULTERS = [
  { name: "João Silva", value: 1200 },
  { name: "Carla Oliveira", value: 950 },
  { name: "Pedro Lima", value: 850 },
  { name: "Fernanda Rocha", value: 650 },
  { name: "Lucas Ferreira", value: 520 },
];

export const RECURRING_RECEIVABLES = [
  { name: "Ortodontia - Mensalidade", periodicity: "Todo dia 10", amount: 18000 },
  { name: "Manutenção - Implante", periodicity: "Todo dia 15", amount: 4200 },
  { name: "Plano Preventivo", periodicity: "Todo dia 20", amount: 2800 },
];

const PATIENTS = [
  "João Silva", "Maria Souza", "Pedro Lima", "Carla Oliveira", "Lucas Ferreira",
  "Fernanda Rocha", "Bruno Almeida", "Juliana Costa", "Rafael Mendes", "Camila Duarte",
] as const;
const PROCEDURES = [
  "Implante Unitário", "Ortodontia - Mensalidade", "Clareamento Dental",
  "Aparelho Ortodôntico", "Restauração", "Limpeza Profissional",
  "Canal Dentário", "Prótese Fixa",
] as const;
const PROFESSIONALS = ["Dr. Carlos Mendes", "Dra. Ana Paula", "Dr. João Santos", "Dra. Fernanda Lima"] as const;
const METHODS_LIST: PaymentMethod[] = ["pix", "credit", "debit", "cash", "boleto", "transfer"];
const STATUSES: ReceivableStatus[] = ["received", "pending", "overdue", "received", "pending"];

const initials = (name: string) =>
  name.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();

const dateOffset = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export const RECEIVABLES: Receivable[] = Array.from({ length: 24 }).map((_, i) => {
  const status = STATUSES[i % STATUSES.length];
  const patient = PATIENTS[i % PATIENTS.length];
  const procedure = PROCEDURES[i % PROCEDURES.length];
  const professional = PROFESSIONALS[i % PROFESSIONALS.length];
  const method = METHODS_LIST[i % METHODS_LIST.length];
  const isInstallment = i % 5 === 0;
  const isRecurring = i % 7 === 0;
  const due = status === "overdue" ? dateOffset(-((i % 6) + 2)) : dateOffset(((i % 14) - 3));
  return {
    id: `rcv-${i + 1}`,
    patientName: patient,
    patientInitials: initials(patient),
    procedure,
    professional,
    amount: [380, 450, 850, 1240, 4500, 12000, 380, 18000][i % 8],
    dueDate: due,
    receivedDate: status === "received" ? due : undefined,
    status,
    paymentMethod: method,
    installmentNumber: isInstallment ? (i % 6) + 1 : undefined,
    installmentTotal: isInstallment ? 6 : undefined,
    isRecurring,
    recurrenceType: isRecurring ? "monthly" : undefined,
  };
});

export const FINANCIAL_ACCOUNTS = [
  { id: "acc-1", name: "Conta Corrente - Itaú" },
  { id: "acc-2", name: "Conta Poupança - Bradesco" },
  { id: "acc-3", name: "Caixa Interno" },
];
