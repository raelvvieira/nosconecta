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
      clinic_chairs: {
        Row: {
          active: boolean
          color: string
          created_at: string
          id: string
          name: string
          notes: string | null
          owner_id: string
          room_name: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          color?: string
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          owner_id: string
          room_name?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          color?: string
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          owner_id?: string
          room_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      clinic_members: {
        Row: {
          active: boolean
          created_at: string
          email: string
          id: string
          name: string
          owner_id: string
          permissions: Json
          role: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          id?: string
          name: string
          owner_id: string
          permissions?: Json
          role?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          id?: string
          name?: string
          owner_id?: string
          permissions?: Json
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      clinic_procedures: {
        Row: {
          active: boolean
          category: string | null
          cost: number
          created_at: string
          duration_minutes: number
          id: string
          name: string
          owner_id: string
          price: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          cost?: number
          created_at?: string
          duration_minutes?: number
          id?: string
          name: string
          owner_id: string
          price?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string | null
          cost?: number
          created_at?: string
          duration_minutes?: number
          id?: string
          name?: string
          owner_id?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
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
      financial_goals: {
        Row: {
          company_id: string
          created_at: string
          end_date: string | null
          goal_type: Database["public"]["Enums"]["goal_type"]
          id: string
          name: string
          period: Database["public"]["Enums"]["goal_period"]
          start_date: string
          target_amount: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          end_date?: string | null
          goal_type: Database["public"]["Enums"]["goal_type"]
          id?: string
          name: string
          period?: Database["public"]["Enums"]["goal_period"]
          start_date?: string
          target_amount?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          end_date?: string | null
          goal_type?: Database["public"]["Enums"]["goal_type"]
          id?: string
          name?: string
          period?: Database["public"]["Enums"]["goal_period"]
          start_date?: string
          target_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      financial_scenarios: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          monthly_cost: number
          monthly_revenue: number
          name: string
          one_time_cost: number
          scenario_type: Database["public"]["Enums"]["scenario_type"]
          start_date: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          monthly_cost?: number
          monthly_revenue?: number
          name: string
          one_time_cost?: number
          scenario_type: Database["public"]["Enums"]["scenario_type"]
          start_date?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          monthly_cost?: number
          monthly_revenue?: number
          name?: string
          one_time_cost?: number
          scenario_type?: Database["public"]["Enums"]["scenario_type"]
          start_date?: string
          updated_at?: string
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
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
        }
        Relationships: []
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
          allergy_notes: string | null
          birth_date: string | null
          company_id: string | null
          cpf: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          owner_id: string | null
          phone: string | null
          responsible_professional_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          allergy_notes?: string | null
          birth_date?: string | null
          company_id?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          responsible_professional_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          allergy_notes?: string | null
          birth_date?: string | null
          company_id?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          responsible_professional_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      professionals: {
        Row: {
          active: boolean
          color: string
          commission_pct: number
          company_id: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          owner_id: string | null
          phone: string | null
          registration_number: string | null
          specialty: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          color?: string
          commission_pct?: number
          company_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          owner_id?: string | null
          phone?: string | null
          registration_number?: string | null
          specialty?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          color?: string
          commission_pct?: number
          company_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          phone?: string | null
          registration_number?: string | null
          specialty?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      account_type: "bank" | "cash" | "pix" | "credit"
      app_role: "admin" | "reception" | "dentist" | "finance"
      category_type: "income" | "expense"
      entry_type: "debit" | "credit"
      goal_period: "monthly" | "quarterly" | "yearly" | "custom"
      goal_type: "revenue" | "profit" | "cash" | "receivables"
      scenario_type:
        | "hire_employee"
        | "equipment_purchase"
        | "new_professional"
        | "marketing_investment"
        | "custom"
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
      app_role: ["admin", "reception", "dentist", "finance"],
      category_type: ["income", "expense"],
      entry_type: ["debit", "credit"],
      goal_period: ["monthly", "quarterly", "yearly", "custom"],
      goal_type: ["revenue", "profit", "cash", "receivables"],
      scenario_type: [
        "hire_employee",
        "equipment_purchase",
        "new_professional",
        "marketing_investment",
        "custom",
      ],
      transaction_status: ["pending", "paid", "overdue", "cancelled"],
      transaction_type: ["receivable", "payable"],
    },
  },
} as const
