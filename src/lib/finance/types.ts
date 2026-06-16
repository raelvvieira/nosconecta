export type TransactionType = "receivable" | "payable";
export type TransactionStatus = "pending" | "paid" | "overdue" | "cancelled";
export type AccountType = "bank" | "cash" | "pix" | "credit";
export type CategoryType = "income" | "expense";
export type EntryType = "debit" | "credit";
export type SourceType = "appointment" | "procedure" | "manual" | "supplier";

export interface FinancialAccount {
  id: string;
  name: string;
  type: AccountType;
  last_digits?: string;
  current_balance: number;
}

export interface FinancialCategory {
  id: string;
  name: string;
  type: CategoryType;
}

export interface Patient {
  id: string;
  name: string;
}

export interface Professional {
  id: string;
  name: string;
  commission_pct: number;
}

export interface FinancialTransaction {
  id: string;
  company_id: string;
  type: TransactionType;
  status: TransactionStatus;
  description: string;
  amount: number;
  due_date: string; // ISO
  paid_date: string | null;
  created_at: string;
  updated_at: string;
  patient_id: string | null;
  professional_id: string | null;
  account_id: string;
  category_id: string;
  source_type: SourceType;
  source_id: string | null;
}

export type Period = "today" | "7d" | "30d" | "90d" | "custom";
export type Granularity = "daily" | "weekly" | "monthly";
