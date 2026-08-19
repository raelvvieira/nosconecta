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
      appointment_notification_replies: {
        Row: {
          action: string
          appointment_id: string | null
          channel: string
          created_at: string
          from_phone: string
          id: string
          message_text: string
          owner_id: string
          patient_id: string | null
        }
        Insert: {
          action: string
          appointment_id?: string | null
          channel?: string
          created_at?: string
          from_phone: string
          id?: string
          message_text: string
          owner_id: string
          patient_id?: string | null
        }
        Update: {
          action?: string
          appointment_id?: string | null
          channel?: string
          created_at?: string
          from_phone?: string
          id?: string
          message_text?: string
          owner_id?: string
          patient_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_notification_replies_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_notification_replies_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_notifications: {
        Row: {
          appointment_id: string
          channel: string
          created_at: string
          error: string | null
          id: string
          kind: string
          owner_id: string
          sent_at: string | null
          status: string
        }
        Insert: {
          appointment_id: string
          channel: string
          created_at?: string
          error?: string | null
          id?: string
          kind: string
          owner_id: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          appointment_id?: string
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          kind?: string
          owner_id?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_notifications_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          actual_revenue: number | null
          created_at: string
          date: string
          end_time: string
          expected_revenue: number
          generate_financial: boolean
          id: string
          notes: string | null
          owner_id: string
          patient_id: string | null
          patient_name: string
          procedure_id: string | null
          procedure_name: string
          professional_id: string | null
          professional_name: string
          room_id: string | null
          room_name: string | null
          start_time: string
          status: string
          type: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          actual_revenue?: number | null
          created_at?: string
          date: string
          end_time: string
          expected_revenue?: number
          generate_financial?: boolean
          id?: string
          notes?: string | null
          owner_id: string
          patient_id?: string | null
          patient_name: string
          procedure_id?: string | null
          procedure_name: string
          professional_id?: string | null
          professional_name: string
          room_id?: string | null
          room_name?: string | null
          start_time: string
          status?: string
          type?: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          actual_revenue?: number | null
          created_at?: string
          date?: string
          end_time?: string
          expected_revenue?: number
          generate_financial?: boolean
          id?: string
          notes?: string | null
          owner_id?: string
          patient_id?: string | null
          patient_name?: string
          procedure_id?: string | null
          procedure_name?: string
          professional_id?: string | null
          professional_name?: string
          room_id?: string | null
          room_name?: string | null
          start_time?: string
          status?: string
          type?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "clinic_procedures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "clinic_chairs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "clinic_units"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_pending_actions: {
        Row: {
          context: Json
          created_at: string
          depth: number
          error: string | null
          id: string
          owner_id: string
          ran_at: string | null
          remaining_actions: Json
          rule_id: string | null
          rule_name: string | null
          run_after: string
          status: string
          trigger_event: string
        }
        Insert: {
          context?: Json
          created_at?: string
          depth?: number
          error?: string | null
          id?: string
          owner_id: string
          ran_at?: string | null
          remaining_actions?: Json
          rule_id?: string | null
          rule_name?: string | null
          run_after: string
          status?: string
          trigger_event: string
        }
        Update: {
          context?: Json
          created_at?: string
          depth?: number
          error?: string | null
          id?: string
          owner_id?: string
          ran_at?: string | null
          remaining_actions?: Json
          rule_id?: string | null
          rule_name?: string | null
          run_after?: string
          status?: string
          trigger_event?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_pending_actions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          actions: Json
          active: boolean
          canvas_layout: Json
          created_at: string
          id: string
          name: string
          owner_id: string
          schedule_window: Json
          trigger_conditions: Json
          trigger_event: string
          updated_at: string
        }
        Insert: {
          actions?: Json
          active?: boolean
          canvas_layout?: Json
          created_at?: string
          id?: string
          name: string
          owner_id: string
          schedule_window?: Json
          trigger_conditions?: Json
          trigger_event: string
          updated_at?: string
        }
        Update: {
          actions?: Json
          active?: boolean
          canvas_layout?: Json
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          schedule_window?: Json
          trigger_conditions?: Json
          trigger_event?: string
          updated_at?: string
        }
        Relationships: []
      }
      automation_runs: {
        Row: {
          action_type: string
          error: string | null
          id: string
          owner_id: string
          ran_at: string
          rule_id: string | null
          rule_name: string | null
          status: string
          trigger_event: string
        }
        Insert: {
          action_type: string
          error?: string | null
          id?: string
          owner_id: string
          ran_at?: string
          rule_id?: string | null
          rule_name?: string | null
          status: string
          trigger_event: string
        }
        Update: {
          action_type?: string
          error?: string | null
          id?: string
          owner_id?: string
          ran_at?: string
          rule_id?: string | null
          rule_name?: string | null
          status?: string
          trigger_event?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_times: {
        Row: {
          created_at: string
          date: string
          end_time: string
          id: string
          owner_id: string
          professional_id: string | null
          reason: string | null
          room_id: string | null
          start_time: string
          unit_id: string
        }
        Insert: {
          created_at?: string
          date: string
          end_time: string
          id?: string
          owner_id: string
          professional_id?: string | null
          reason?: string | null
          room_id?: string | null
          start_time: string
          unit_id: string
        }
        Update: {
          created_at?: string
          date?: string
          end_time?: string
          id?: string
          owner_id?: string
          professional_id?: string | null
          reason?: string | null
          room_id?: string | null
          start_time?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocked_times_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_times_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "clinic_chairs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_times_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "clinic_units"
            referencedColumns: ["id"]
          },
        ]
      }
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
          unit_id: string
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
          unit_id: string
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
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_chairs_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "clinic_units"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_members: {
        Row: {
          active: boolean
          approved_at: string | null
          approved_by: string | null
          created_at: string
          email: string
          id: string
          name: string
          owner_id: string
          permissions: Json
          phone: string | null
          rejected_reason: string | null
          requested_at: string
          role: string | null
          status: string
          unit_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          email: string
          id?: string
          name: string
          owner_id: string
          permissions?: Json
          phone?: string | null
          rejected_reason?: string | null
          requested_at?: string
          role?: string | null
          status?: string
          unit_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          owner_id?: string
          permissions?: Json
          phone?: string | null
          rejected_reason?: string | null
          requested_at?: string
          role?: string | null
          status?: string
          unit_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinic_members_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "clinic_units"
            referencedColumns: ["id"]
          },
        ]
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
          tuss_code: string | null
          tuss_name: string | null
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
          tuss_code?: string | null
          tuss_name?: string | null
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
          tuss_code?: string | null
          tuss_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      clinic_units: {
        Row: {
          active: boolean
          address: string | null
          created_at: string
          id: string
          is_default: boolean
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_campaign_sends: {
        Row: {
          campaign_id: string
          executed_at: string
          id: string
          owner_id: string
          recipient_count: number
        }
        Insert: {
          campaign_id: string
          executed_at?: string
          id?: string
          owner_id: string
          recipient_count: number
        }
        Update: {
          campaign_id?: string
          executed_at?: string
          id?: string
          owner_id?: string
          recipient_count?: number
        }
        Relationships: []
      }
      crm_credentials: {
        Row: {
          access_token: string | null
          created_at: string
          crm_email: string
          crm_password: string
          crm_pipeline_debug: Json | null
          crm_status_debug: Json | null
          daily_send_limit: number
          evolution_instance_name: string | null
          id: string
          inbox_id: string | null
          last_error: string | null
          owner_id: string
          phone_number: string | null
          pipeline_id: string | null
          qr_code: string | null
          qr_expires_at: string | null
          token_expires_at: string | null
          updated_at: string
          whatsapp_status: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          crm_email: string
          crm_password: string
          crm_pipeline_debug?: Json | null
          crm_status_debug?: Json | null
          daily_send_limit?: number
          evolution_instance_name?: string | null
          id?: string
          inbox_id?: string | null
          last_error?: string | null
          owner_id: string
          phone_number?: string | null
          pipeline_id?: string | null
          qr_code?: string | null
          qr_expires_at?: string | null
          token_expires_at?: string | null
          updated_at?: string
          whatsapp_status?: string
        }
        Update: {
          access_token?: string | null
          created_at?: string
          crm_email?: string
          crm_password?: string
          crm_pipeline_debug?: Json | null
          crm_status_debug?: Json | null
          daily_send_limit?: number
          evolution_instance_name?: string | null
          id?: string
          inbox_id?: string | null
          last_error?: string | null
          owner_id?: string
          phone_number?: string | null
          pipeline_id?: string | null
          qr_code?: string | null
          qr_expires_at?: string | null
          token_expires_at?: string | null
          updated_at?: string
          whatsapp_status?: string
        }
        Relationships: []
      }
      financial_accounts: {
        Row: {
          company_id: string | null
          created_at: string
          current_balance: number
          id: string
          last_digits: string | null
          name: string
          owner_id: string | null
          type: Database["public"]["Enums"]["account_type"]
          unit_id: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          current_balance?: number
          id?: string
          last_digits?: string | null
          name: string
          owner_id?: string | null
          type: Database["public"]["Enums"]["account_type"]
          unit_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          current_balance?: number
          id?: string
          last_digits?: string | null
          name?: string
          owner_id?: string | null
          type?: Database["public"]["Enums"]["account_type"]
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_accounts_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "clinic_units"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_categories: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          name: string
          owner_id: string | null
          type: Database["public"]["Enums"]["category_type"]
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          name: string
          owner_id?: string | null
          type: Database["public"]["Enums"]["category_type"]
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          name?: string
          owner_id?: string | null
          type?: Database["public"]["Enums"]["category_type"]
        }
        Relationships: []
      }
      financial_goals: {
        Row: {
          company_id: string | null
          created_at: string
          end_date: string | null
          goal_type: Database["public"]["Enums"]["goal_type"]
          id: string
          name: string
          owner_id: string | null
          period: Database["public"]["Enums"]["goal_period"]
          start_date: string
          target_amount: number
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          end_date?: string | null
          goal_type: Database["public"]["Enums"]["goal_type"]
          id?: string
          name: string
          owner_id?: string | null
          period?: Database["public"]["Enums"]["goal_period"]
          start_date?: string
          target_amount?: number
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          end_date?: string | null
          goal_type?: Database["public"]["Enums"]["goal_type"]
          id?: string
          name?: string
          owner_id?: string | null
          period?: Database["public"]["Enums"]["goal_period"]
          start_date?: string
          target_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      financial_scenarios: {
        Row: {
          company_id: string | null
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          monthly_cost: number
          monthly_revenue: number
          name: string
          one_time_cost: number
          owner_id: string | null
          scenario_type: Database["public"]["Enums"]["scenario_type"]
          start_date: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          monthly_cost?: number
          monthly_revenue?: number
          name: string
          one_time_cost?: number
          owner_id?: string | null
          scenario_type: Database["public"]["Enums"]["scenario_type"]
          start_date?: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          monthly_cost?: number
          monthly_revenue?: number
          name?: string
          one_time_cost?: number
          owner_id?: string | null
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
          company_id: string | null
          created_at: string
          description: string
          due_date: string
          id: string
          installment_number: number | null
          installment_total: number | null
          is_recurring: boolean
          notes: string | null
          owner_id: string | null
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
          unit_id: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          category_id?: string | null
          company_id?: string | null
          created_at?: string
          description: string
          due_date: string
          id?: string
          installment_number?: number | null
          installment_total?: number | null
          is_recurring?: boolean
          notes?: string | null
          owner_id?: string | null
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
          unit_id: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          category_id?: string | null
          company_id?: string | null
          created_at?: string
          description?: string
          due_date?: string
          id?: string
          installment_number?: number | null
          installment_total?: number | null
          is_recurring?: boolean
          notes?: string | null
          owner_id?: string | null
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
          unit_id?: string
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
          {
            foreignKeyName: "financial_transactions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "clinic_units"
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
      meta_capi_credentials: {
        Row: {
          access_token: string | null
          api_version: string
          created_at: string
          enabled: boolean
          id: string
          last_error: string | null
          last_success_at: string | null
          offline_event_set_id: string | null
          owner_id: string
          pixel_id: string | null
          test_event_code: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          api_version?: string
          created_at?: string
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_success_at?: string | null
          offline_event_set_id?: string | null
          owner_id: string
          pixel_id?: string | null
          test_event_code?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          api_version?: string
          created_at?: string
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_success_at?: string | null
          offline_event_set_id?: string | null
          owner_id?: string
          pixel_id?: string | null
          test_event_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      meta_capi_events: {
        Row: {
          created_at: string
          dropped_keys: Json | null
          error: string | null
          event_id: string
          id: string
          meta_event_name: string
          owner_id: string
          payload: Json | null
          response: Json | null
          sent_at: string
          status: string
          system_event: string
          trigger_id: string | null
        }
        Insert: {
          created_at?: string
          dropped_keys?: Json | null
          error?: string | null
          event_id: string
          id?: string
          meta_event_name: string
          owner_id: string
          payload?: Json | null
          response?: Json | null
          sent_at?: string
          status: string
          system_event: string
          trigger_id?: string | null
        }
        Update: {
          created_at?: string
          dropped_keys?: Json | null
          error?: string | null
          event_id?: string
          id?: string
          meta_event_name?: string
          owner_id?: string
          payload?: Json | null
          response?: Json | null
          sent_at?: string
          status?: string
          system_event?: string
          trigger_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_capi_events_trigger_id_fkey"
            columns: ["trigger_id"]
            isOneToOne: false
            referencedRelation: "meta_capi_triggers"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_capi_triggers: {
        Row: {
          active: boolean
          conditions: Json
          created_at: string
          currency: string
          fixed_value: number | null
          id: string
          meta_event_name: string
          name: string
          owner_id: string
          system_event: string
          updated_at: string
          value_source: string
        }
        Insert: {
          active?: boolean
          conditions?: Json
          created_at?: string
          currency?: string
          fixed_value?: number | null
          id?: string
          meta_event_name: string
          name: string
          owner_id: string
          system_event: string
          updated_at?: string
          value_source?: string
        }
        Update: {
          active?: boolean
          conditions?: Json
          created_at?: string
          currency?: string
          fixed_value?: number | null
          id?: string
          meta_event_name?: string
          name?: string
          owner_id?: string
          system_event?: string
          updated_at?: string
          value_source?: string
        }
        Relationships: []
      }
      patients: {
        Row: {
          address: string | null
          address_complement: string | null
          allergy_notes: string | null
          birth_date: string | null
          city: string | null
          company_id: string | null
          cpf: string | null
          created_at: string
          crm_contact_id: string | null
          email: string | null
          gender: string | null
          guardian_cpf: string | null
          guardian_name: string | null
          id: string
          legacy_patient_id: string | null
          name: string
          neighborhood: string | null
          notes: string | null
          owner_id: string | null
          phone: string | null
          responsible_professional_id: string | null
          state: string | null
          status: string
          unit_id: string
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          address_complement?: string | null
          allergy_notes?: string | null
          birth_date?: string | null
          city?: string | null
          company_id?: string | null
          cpf?: string | null
          created_at?: string
          crm_contact_id?: string | null
          email?: string | null
          gender?: string | null
          guardian_cpf?: string | null
          guardian_name?: string | null
          id?: string
          legacy_patient_id?: string | null
          name: string
          neighborhood?: string | null
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          responsible_professional_id?: string | null
          state?: string | null
          status?: string
          unit_id: string
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          address_complement?: string | null
          allergy_notes?: string | null
          birth_date?: string | null
          city?: string | null
          company_id?: string | null
          cpf?: string | null
          created_at?: string
          crm_contact_id?: string | null
          email?: string | null
          gender?: string | null
          guardian_cpf?: string | null
          guardian_name?: string | null
          id?: string
          legacy_patient_id?: string | null
          name?: string
          neighborhood?: string | null
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          responsible_professional_id?: string | null
          state?: string | null
          status?: string
          unit_id?: string
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "clinic_units"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_deal_events: {
        Row: {
          body: string | null
          created_at: string
          id: string
          item_id: string
          kind: string
          meta: Json | null
          owner_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          item_id: string
          kind?: string
          meta?: Json | null
          owner_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          item_id?: string
          kind?: string
          meta?: Json | null
          owner_id?: string
        }
        Relationships: []
      }
      pipeline_deals: {
        Row: {
          appointment_id: string | null
          created_at: string
          currency: string
          id: string
          item_id: string
          loss_reason: string | null
          owner_id: string
          realized_on: string | null
          status: string
          updated_at: string
          value: number | null
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          item_id: string
          loss_reason?: string | null
          owner_id: string
          realized_on?: string | null
          status?: string
          updated_at?: string
          value?: number | null
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          item_id?: string
          loss_reason?: string | null
          owner_id?: string
          realized_on?: string | null
          status?: string
          updated_at?: string
          value?: number | null
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
          unit_id: string
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
          unit_id: string
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
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professionals_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "clinic_units"
            referencedColumns: ["id"]
          },
        ]
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
      push_poll_state: {
        Row: {
          owner_id: string
          unread_snapshot: Json
          updated_at: string
        }
        Insert: {
          owner_id: string
          unread_snapshot?: Json
          updated_at?: string
        }
        Update: {
          owner_id?: string
          unread_snapshot?: Json
          updated_at?: string
        }
        Relationships: []
      }
      push_preferences: {
        Row: {
          appointment_reply: boolean
          automation: boolean
          created_at: string
          daily_agenda: boolean
          deal_result: boolean
          owner_id: string
          updated_at: string
          whatsapp_message: boolean
        }
        Insert: {
          appointment_reply?: boolean
          automation?: boolean
          created_at?: string
          daily_agenda?: boolean
          deal_result?: boolean
          owner_id: string
          updated_at?: string
          whatsapp_message?: boolean
        }
        Update: {
          appointment_reply?: boolean
          automation?: boolean
          created_at?: string
          daily_agenda?: boolean
          deal_result?: boolean
          owner_id?: string
          updated_at?: string
          whatsapp_message?: boolean
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_seen_at: string
          owner_id: string
          p256dh: string
          user_agent: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_seen_at?: string
          owner_id: string
          p256dh: string
          user_agent?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          owner_id?: string
          p256dh?: string
          user_agent?: string | null
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
      waiting_list: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          patient_id: string | null
          patient_name: string
          procedure_name: string
          unit_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          patient_id?: string | null
          patient_name: string
          procedure_name: string
          unit_id: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          patient_id?: string | null
          patient_name?: string
          procedure_name?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waiting_list_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiting_list_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "clinic_units"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_broadcast_targets: {
        Row: {
          broadcast_id: string
          contact_id: string
          contact_name: string | null
          conversation_id: string | null
          error: string | null
          id: string
          owner_id: string
          phone: string | null
          scheduled_for: string
          sent_at: string | null
          sent_via: string | null
          status: string
        }
        Insert: {
          broadcast_id: string
          contact_id: string
          contact_name?: string | null
          conversation_id?: string | null
          error?: string | null
          id?: string
          owner_id: string
          phone?: string | null
          scheduled_for: string
          sent_at?: string | null
          sent_via?: string | null
          status?: string
        }
        Update: {
          broadcast_id?: string
          contact_id?: string
          contact_name?: string | null
          conversation_id?: string | null
          error?: string | null
          id?: string
          owner_id?: string
          phone?: string | null
          scheduled_for?: string
          sent_at?: string | null
          sent_via?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_broadcast_targets_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_broadcasts"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_broadcasts: {
        Row: {
          created_at: string
          id: string
          interval_seconds: number
          message: string
          owner_id: string
          status: string
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          interval_seconds?: number
          message: string
          owner_id: string
          status?: string
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          interval_seconds?: number
          message?: string
          owner_id?: string
          status?: string
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { _token: string }; Returns: boolean }
      can_access_row:
        | { Args: { _owner_id: string }; Returns: boolean }
        | { Args: { _owner_id: string; _unit_id: string }; Returns: boolean }
      current_owner_id: { Args: never; Returns: string }
      current_unit_id: { Args: never; Returns: string }
      finance_cash_flow_series: {
        Args: {
          p_from: string
          p_granularity: string
          p_owner_id: string
          p_to: string
          p_unit_id: string
        }
        Returns: {
          bucket: string
          expense: number
          future_receivable: number
          income: number
        }[]
      }
      finance_revenue_by_category: {
        Args: {
          p_from: string
          p_owner_id: string
          p_to: string
          p_unit_id: string
        }
        Returns: {
          category_id: string
          name: string
          total: number
        }[]
      }
      finance_revenue_by_professional: {
        Args: {
          p_from: string
          p_owner_id: string
          p_to: string
          p_unit_id: string
        }
        Returns: {
          commission_pct: number
          name: string
          professional_id: string
          total: number
        }[]
      }
      get_invitation_by_token: {
        Args: { _token: string }
        Returns: {
          accepted_at: string
          email: string
          expires_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_clinic_admin: { Args: never; Returns: boolean }
      primary_clinic_owner: { Args: never; Returns: string }
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
