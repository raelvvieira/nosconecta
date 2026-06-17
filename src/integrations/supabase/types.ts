export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      financial_accounts: {
        Row: {
          company_id: string
          created_at: string
          current_balance: number
          id: string
          last_digits: string | null
          name: string
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          current_balance?: number
          id?: string
          last_digits?: string | null
          name: string
          type: Database["public"]["Enums"]["account_type"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          current_balance?: number
          id?: string
          last_digits?: string | null
          name?: string
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string
        }
        Relationships: []
      }
      financial_categories: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
          type: Database["public"]["Enums"]["category_type"]
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          type: Database["public"]["Enums"]["category_type"]
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          type?: Database["public"]["Enums"]["category_type"]
        }
        Relationships: []
      }
      financial_transactions: {
        Row: {
          account_id: string | null
          amount: number
          category_id: string | null
          company_id: string
          created_at: string
          description: string
          due_date: string
          id: string
          installment_number: number | null
          installment_total: number | null
          is_recurring: boolean
          notes: string | null
          paid_date: string | null
          parent_transaction_id: string | null
          patient_id: string | null
          payment_method: string | null
          professional_id: string | null
          recurrence_type: string | null
          source_id: string | null
          source_type: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          supplier_name: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          category_id?: string | null
          company_id: string
          created_at?: string
          description: string
          due_date: string
          id?: string
          installment_number?: number | null
          installment_total?: number | null
          is_recurring?: boolean
          notes?: string | null
          paid_date?: string | null
          parent_transaction_id?: string | null
          patient_id?: string | null
          payment_method?: string | null
          professional_id?: string | null
          recurrence_type?: string | null
          source_id?: string | null
          source_type?: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          supplier_name?: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          category_id?: string | null
          company_id?: string
          created_at?: string
          description?: string
          due_date?: string
          id?: string
          installment_number?: number | null
          installment_total?: number | null
          is_recurring?: boolean
          notes?: string | null
          paid_date?: string | null
          parent_transaction_id?: string | null
          patient_id?: string | null
          payment_method?: string | null
          professional_id?: string | null
          recurrence_type?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          supplier_name?: string | null
          type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "financial_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_parent_transaction_id_fkey"
            columns: ["parent_transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          account_id: string
          amount: number
          created_at: string
          entry_type: Database["public"]["Enums"]["entry_type"]
          id: string
          transaction_id: string
        }
        Insert: {
          account_id: string
          amount: number
          created_at?: string
          entry_type: Database["public"]["Enums"]["entry_type"]
          id?: string
          transaction_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          created_at?: string
          entry_type?: Database["public"]["Enums"]["entry_type"]
          id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      professionals: {
        Row: {
          commission_pct: number
          company_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          commission_pct?: number
          company_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          commission_pct?: number
          company_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      finance_cash_flow_series: {
        Args: {
          p_company_id: string
          p_from: string
          p_granularity: string
          p_to: string
        }
        Returns: {
          bucket: string
          expense: number
          future_receivable: number
          income: number
        }[]
      }
      finance_revenue_by_category: {
        Args: { p_company_id: string; p_from: string; p_to: string }
        Returns: {
          category_id: string
          name: string
          total: number
        }[]
      }
      finance_revenue_by_professional: {
        Args: { p_company_id: string; p_from: string; p_to: string }
        Returns: {
          commission_pct: number
          name: string
          professional_id: string
          total: number
        }[]
      }
    }
    Enums: {
      account_type: "bank" | "cash" | "pix" | "credit"
      category_type: "income" | "expense"
      entry_type: "debit" | "credit"
      transaction_status: "pending" | "paid" | "overdue" | "cancelled"
      transaction_type: "receivable" | "payable"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_type: ["bank", "cash", "pix", "credit"],
      category_type: ["income", "expense"],
      entry_type: ["debit", "credit"],
      transaction_status: ["pending", "paid", "overdue", "cancelled"],
      transaction_type: ["receivable", "payable"],
    },
  },
} as const
