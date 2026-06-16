import type {
  FinancialAccount,
  FinancialCategory,
  FinancialTransaction,
  Patient,
  Professional,
} from "./types";

const COMPANY_ID = "odc-001";

export const accounts: FinancialAccount[] = [
  { id: "acc-1", name: "Santander PJ", type: "bank", last_digits: "1234", current_balance: 21300 },
  { id: "acc-2", name: "Caixa", type: "cash", last_digits: "5678", current_balance: 2100 },
  { id: "acc-3", name: "Pix - Conta Principal", type: "pix", last_digits: "9012", current_balance: 5400 },
];

export const categories: FinancialCategory[] = [
  { id: "cat-impl", name: "Implantes", type: "income" },
  { id: "cat-orto", name: "Ortodontia", type: "income" },
  { id: "cat-geral", name: "Clínica Geral", type: "income" },
  { id: "cat-est", name: "Estética", type: "income" },
  { id: "cat-aluguel", name: "Administrativo", type: "expense" },
  { id: "cat-lab", name: "Laboratório", type: "expense" },
  { id: "cat-util", name: "Utilities", type: "expense" },
  { id: "cat-mkt", name: "Marketing", type: "expense" },
];

export const patients: Patient[] = [
  { id: "pat-1", name: "João Silva" },
  { id: "pat-2", name: "Maria Oliveira" },
  { id: "pat-3", name: "Carlos Santos" },
  { id: "pat-4", name: "Ana Paula" },
  { id: "pat-5", name: "Pedro Henrique" },
  { id: "pat-6", name: "Juliana Costa" },
  { id: "pat-7", name: "Roberto Lima" },
  { id: "pat-8", name: "Fernanda Souza" },
  { id: "pat-9", name: "Lucas Martins" },
  { id: "pat-10", name: "Beatriz Rocha" },
];

export const professionals: Professional[] = [
  { id: "prof-1", name: "Dr. João Silva", commission_pct: 12 },
  { id: "prof-2", name: "Dra. Maria Souza", commission_pct: 12 },
  { id: "prof-3", name: "Dr. Pedro Alves", commission_pct: 12 },
];

const procedureDescByCat: Record<string, string[]> = {
  "cat-impl": ["Implante Unitário", "Implante Múltiplo", "Enxerto Ósseo"],
  "cat-orto": ["Aparelho Ortodôntico", "Manutenção Aparelho", "Alinhador Invisível"],
  "cat-geral": ["Limpeza e Profilaxia", "Restauração", "Canal"],
  "cat-est": ["Clareamento Dental", "Faceta em Resina", "Lente de Contato"],
};

const expenseDescByCat: Record<string, string[]> = {
  "cat-aluguel": ["Aluguel", "Condomínio", "Contador"],
  "cat-lab": ["Laboratório Protético", "Materiais Cirúrgicos", "Insumos"],
  "cat-util": ["Internet", "Energia Elétrica", "Água"],
  "cat-mkt": ["Marketing Digital", "Anúncios Instagram", "SEO"],
};

// Deterministic PRNG so the mock is stable across renders.
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(42);

function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

const TODAY = new Date("2026-06-16T12:00:00");

function buildTransactions(): FinancialTransaction[] {
  const out: FinancialTransaction[] = [];
  const incomeCats = categories.filter((c) => c.type === "income");
  const expenseCats = categories.filter((c) => c.type === "expense");

  // Historical receivables (past 90 days, mostly paid)
  for (let i = 0; i < 180; i++) {
    const cat = pick(incomeCats);
    const daysBack = Math.floor(rand() * 90);
    const due = addDays(TODAY, -daysBack);
    const isPaid = rand() > 0.12;
    const isOverdue = !isPaid && daysBack > 2 && rand() > 0.5;
    const amount = Math.round((300 + rand() * 2200) / 10) * 10;
    out.push({
      id: `rcv-${i}`,
      company_id: COMPANY_ID,
      type: "receivable",
      status: isPaid ? "paid" : isOverdue ? "overdue" : "pending",
      description: pick(procedureDescByCat[cat.id]),
      amount,
      due_date: due.toISOString(),
      paid_date: isPaid ? addDays(due, Math.floor(rand() * 3) - 1).toISOString() : null,
      created_at: addDays(due, -3).toISOString(),
      updated_at: due.toISOString(),
      patient_id: pick(patients).id,
      professional_id: pick(professionals).id,
      account_id: pick(accounts).id,
      category_id: cat.id,
      source_type: "procedure",
      source_id: `proc-${i}`,
    });
  }

  // Future receivables (next 60 days)
  for (let i = 0; i < 60; i++) {
    const cat = pick(incomeCats);
    const daysAhead = 1 + Math.floor(rand() * 60);
    const due = addDays(TODAY, daysAhead);
    const amount = Math.round((300 + rand() * 2200) / 10) * 10;
    out.push({
      id: `rcv-f-${i}`,
      company_id: COMPANY_ID,
      type: "receivable",
      status: "pending",
      description: pick(procedureDescByCat[cat.id]),
      amount,
      due_date: due.toISOString(),
      paid_date: null,
      created_at: addDays(TODAY, -2).toISOString(),
      updated_at: TODAY.toISOString(),
      patient_id: pick(patients).id,
      professional_id: pick(professionals).id,
      account_id: pick(accounts).id,
      category_id: cat.id,
      source_type: "procedure",
      source_id: `proc-f-${i}`,
    });
  }

  // Expenses (past 90 + future 30)
  for (let i = 0; i < 90; i++) {
    const cat = pick(expenseCats);
    const offset = Math.floor(rand() * 120) - 90; // -90..+30
    const due = addDays(TODAY, offset);
    const isPast = offset < 0;
    const isPaid = isPast ? rand() > 0.15 : false;
    const amount = Math.round((150 + rand() * 2800) / 10) * 10;
    out.push({
      id: `pay-${i}`,
      company_id: COMPANY_ID,
      type: "payable",
      status: isPaid ? "paid" : isPast ? "overdue" : "pending",
      description: pick(expenseDescByCat[cat.id]),
      amount,
      due_date: due.toISOString(),
      paid_date: isPaid ? due.toISOString() : null,
      created_at: addDays(due, -5).toISOString(),
      updated_at: due.toISOString(),
      patient_id: null,
      professional_id: null,
      account_id: pick(accounts).id,
      category_id: cat.id,
      source_type: "supplier",
      source_id: null,
    });
  }

  return out;
}

export const transactions: FinancialTransaction[] = buildTransactions();

export const lookup = {
  account: (id: string) => accounts.find((a) => a.id === id),
  category: (id: string) => categories.find((c) => c.id === id),
  patient: (id: string | null) => (id ? patients.find((p) => p.id === id) : undefined),
  professional: (id: string | null) =>
    id ? professionals.find((p) => p.id === id) : undefined,
};

export const TODAY_REF = TODAY;
