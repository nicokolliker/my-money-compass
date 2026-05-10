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
      account_groups: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          name: string
          sort_order: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          sort_order?: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          sort_order?: number
          user_id?: string | null
        }
        Relationships: []
      }
      accounts: {
        Row: {
          created_at: string
          currency: string
          group_id: string | null
          id: string
          institution: string | null
          integration_id: string | null
          is_active: boolean
          logo_url: string | null
          name: string
          notes: string | null
          official_balance: number | null
          official_balance_updated_at: string | null
          opening_balance: number
          sort_order: number
          source: string
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          currency?: string
          group_id?: string | null
          id?: string
          institution?: string | null
          integration_id?: string | null
          is_active?: boolean
          logo_url?: string | null
          name: string
          notes?: string | null
          official_balance?: number | null
          official_balance_updated_at?: string | null
          opening_balance?: number
          sort_order?: number
          source?: string
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          currency?: string
          group_id?: string | null
          id?: string
          institution?: string | null
          integration_id?: string | null
          is_active?: boolean
          logo_url?: string | null
          name?: string
          notes?: string | null
          official_balance?: number | null
          official_balance_updated_at?: string | null
          opening_balance?: number
          sort_order?: number
          source?: string
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "account_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          currency: string
          id: string
          month: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount?: number
          category_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          month: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          month?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          is_system: boolean
          name: string
          sort_order: number
          user_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_system?: boolean
          name: string
          sort_order?: number
          user_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_system?: boolean
          name?: string
          sort_order?: number
          user_id?: string | null
        }
        Relationships: []
      }
      fx_rates: {
        Row: {
          created_at: string
          date: string
          from_currency: string
          id: string
          rate: number
          source: string
          to_currency: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          date?: string
          from_currency: string
          id?: string
          rate: number
          source?: string
          to_currency?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          date?: string
          from_currency?: string
          id?: string
          rate?: number
          source?: string
          to_currency?: string
          user_id?: string | null
        }
        Relationships: []
      }
      import_log: {
        Row: {
          id: string
          imported_at: string
          month: string
          source: string
          transaction_count: number
          user_id: string
        }
        Insert: {
          id?: string
          imported_at?: string
          month: string
          source: string
          transaction_count?: number
          user_id: string
        }
        Update: {
          id?: string
          imported_at?: string
          month?: string
          source?: string
          transaction_count?: number
          user_id?: string
        }
        Relationships: []
      }
      import_logs: {
        Row: {
          account_id: string | null
          filename: string
          id: string
          imported_at: string
          row_count: number
          user_id: string | null
        }
        Insert: {
          account_id?: string | null
          filename: string
          id?: string
          imported_at?: string
          row_count?: number
          user_id?: string | null
        }
        Update: {
          account_id?: string | null
          filename?: string
          id?: string
          imported_at?: string
          row_count?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_logs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          cliente: string
          created_at: string
          estado: string
          fecha: string | null
          id: string
          monto_ars: number | null
          monto_usd: number
          notas: string | null
          numero_factura: string | null
          periodo: string
          tc_ars: number
          user_id: string
        }
        Insert: {
          cliente?: string
          created_at?: string
          estado?: string
          fecha?: string | null
          id?: string
          monto_ars?: number | null
          monto_usd: number
          notas?: string | null
          numero_factura?: string | null
          periodo: string
          tc_ars: number
          user_id: string
        }
        Update: {
          cliente?: string
          created_at?: string
          estado?: string
          fecha?: string | null
          id?: string
          monto_ars?: number | null
          monto_usd?: number
          notas?: string | null
          numero_factura?: string | null
          periodo?: string
          tc_ars?: number
          user_id?: string
        }
        Relationships: []
      }
      merchants: {
        Row: {
          created_at: string
          default_category_id: string | null
          display_name: string | null
          domain: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_category_id?: string | null
          display_name?: string | null
          domain?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          default_category_id?: string | null
          display_name?: string | null
          domain?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      net_worth_snapshots: {
        Row: {
          created_at: string
          date: string
          id: string
          net_worth_usd: number
          snapshot_data: Json | null
          total_assets_usd: number
          total_liabilities_usd: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          net_worth_usd?: number
          snapshot_data?: Json | null
          total_assets_usd?: number
          total_liabilities_usd?: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          net_worth_usd?: number
          snapshot_data?: Json | null
          total_assets_usd?: number
          total_liabilities_usd?: number
          user_id?: string | null
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          is_active: boolean
          linked_account_id: string | null
          name: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          linked_account_id?: string | null
          name: string
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          linked_account_id?: string | null
          name?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          base_currency: string
          created_at: string
          display_name: string | null
          has_demo_data: boolean
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          base_currency?: string
          created_at?: string
          display_name?: string | null
          has_demo_data?: boolean
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          base_currency?: string
          created_at?: string
          display_name?: string | null
          has_demo_data?: boolean
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recurring_expenses: {
        Row: {
          account_id: string | null
          amount: number
          category_id: string | null
          created_at: string
          currency: string
          due_day: number | null
          end_date: string | null
          frequency: string
          id: string
          is_active: boolean
          last_matched_transaction_id: string | null
          last_paid_date: string | null
          linked_category_id: string | null
          name: string
          next_due_date: string | null
          notes: string | null
          payment_method_id: string | null
          renewal_notes: string | null
          status: string
          subtype: string | null
          type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          account_id?: string | null
          amount?: number
          category_id?: string | null
          created_at?: string
          currency?: string
          due_day?: number | null
          end_date?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          last_matched_transaction_id?: string | null
          last_paid_date?: string | null
          linked_category_id?: string | null
          name: string
          next_due_date?: string | null
          notes?: string | null
          payment_method_id?: string | null
          renewal_notes?: string | null
          status?: string
          subtype?: string | null
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          account_id?: string | null
          amount?: number
          category_id?: string | null
          created_at?: string
          currency?: string
          due_day?: number | null
          end_date?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          last_matched_transaction_id?: string | null
          last_paid_date?: string | null
          linked_category_id?: string | null
          name?: string
          next_due_date?: string | null
          notes?: string | null
          payment_method_id?: string | null
          renewal_notes?: string | null
          status?: string
          subtype?: string | null
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_expenses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expenses_last_matched_transaction_id_fkey"
            columns: ["last_matched_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expenses_linked_category_id_fkey"
            columns: ["linked_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_instances: {
        Row: {
          created_at: string
          expected_account_id: string | null
          expected_amount: number
          expected_currency: string
          expected_date: string
          id: string
          match_confidence: number | null
          matched_at: string | null
          matched_transaction_id: string | null
          notes: string | null
          recurring_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expected_account_id?: string | null
          expected_amount?: number
          expected_currency?: string
          expected_date: string
          id?: string
          match_confidence?: number | null
          matched_at?: string | null
          matched_transaction_id?: string | null
          notes?: string | null
          recurring_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expected_account_id?: string | null
          expected_amount?: number
          expected_currency?: string
          expected_date?: string
          id?: string
          match_confidence?: number | null
          matched_at?: string | null
          matched_transaction_id?: string | null
          notes?: string | null
          recurring_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_instances_matched_transaction_id_fkey"
            columns: ["matched_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_instances_recurring_id_fkey"
            columns: ["recurring_id"]
            isOneToOne: false
            referencedRelation: "recurring_expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      rules: {
        Row: {
          category_id: string | null
          created_at: string
          id: string
          is_active: boolean
          keyword: string
          mark_as_subscription: boolean
          match_field: string
          subcategory_id: string | null
          tag_ids: Json | null
          user_id: string | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          keyword: string
          mark_as_subscription?: boolean
          match_field?: string
          subcategory_id?: string | null
          tag_ids?: Json | null
          user_id?: string | null
        }
        Update: {
          category_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          keyword?: string
          mark_as_subscription?: boolean
          match_field?: string
          subcategory_id?: string | null
          tag_ids?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rules_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      subcategories: {
        Row: {
          category_id: string
          created_at: string
          id: string
          name: string
          user_id: string | null
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          name: string
          user_id?: string | null
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          user_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          user_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      transaction_splits: {
        Row: {
          amount: number
          amount_usd: number
          category_id: string | null
          id: string
          notes: string | null
          subcategory_id: string | null
          transaction_id: string
          user_id: string | null
        }
        Insert: {
          amount?: number
          amount_usd?: number
          category_id?: string | null
          id?: string
          notes?: string | null
          subcategory_id?: string | null
          transaction_id: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          amount_usd?: number
          category_id?: string | null
          id?: string
          notes?: string | null
          subcategory_id?: string | null
          transaction_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transaction_splits_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_splits_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_splits_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_tags: {
        Row: {
          tag_id: string
          transaction_id: string
          user_id: string | null
        }
        Insert: {
          tag_id: string
          transaction_id: string
          user_id?: string | null
        }
        Update: {
          tag_id?: string
          transaction_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transaction_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_tags_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string
          amount: number
          amount_usd: number
          category_id: string | null
          created_at: string
          currency: string
          date: string
          description: string | null
          external_id: string | null
          fx_rate: number
          id: string
          is_subscription: boolean
          linked_transfer_id: string | null
          merchant: string | null
          merchant_id: string | null
          notes: string | null
          payment_method_id: string | null
          raw_imported_description: string | null
          subcategory_id: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          account_id: string
          amount?: number
          amount_usd?: number
          category_id?: string | null
          created_at?: string
          currency?: string
          date?: string
          description?: string | null
          external_id?: string | null
          fx_rate?: number
          id?: string
          is_subscription?: boolean
          linked_transfer_id?: string | null
          merchant?: string | null
          merchant_id?: string | null
          notes?: string | null
          payment_method_id?: string | null
          raw_imported_description?: string | null
          subcategory_id?: string | null
          type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          account_id?: string
          amount?: number
          amount_usd?: number
          category_id?: string | null
          created_at?: string
          currency?: string
          date?: string
          description?: string | null
          external_id?: string | null
          fx_rate?: number
          id?: string
          is_subscription?: boolean
          linked_transfer_id?: string | null
          merchant?: string | null
          merchant_id?: string | null
          notes?: string | null
          payment_method_id?: string | null
          raw_imported_description?: string | null
          subcategory_id?: string | null
          type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_linked_transfer_id_fkey"
            columns: ["linked_transfer_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          created_at: string
          updated_at: string
          user_id: string
          wise_last_sync: string | null
          wise_profile_id: string | null
          wise_token: string | null
        }
        Insert: {
          created_at?: string
          updated_at?: string
          user_id: string
          wise_last_sync?: string | null
          wise_profile_id?: string | null
          wise_token?: string | null
        }
        Update: {
          created_at?: string
          updated_at?: string
          user_id?: string
          wise_last_sync?: string | null
          wise_profile_id?: string | null
          wise_token?: string | null
        }
        Relationships: []
      }
      wise_sync_log: {
        Row: {
          account_id: string | null
          created_at: string
          error_message: string | null
          id: string
          last_transaction_date: string | null
          profile_id: string | null
          status: string
          transactions_imported: number
          user_id: string | null
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          last_transaction_date?: string | null
          profile_id?: string | null
          status?: string
          transactions_imported?: number
          user_id?: string | null
        }
        Update: {
          account_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          last_transaction_date?: string | null
          profile_id?: string | null
          status?: string
          transactions_imported?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wise_sync_log_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_recurring_instances: {
        Args: {
          p_months_ahead?: number
          p_months_back?: number
          p_user_id: string
        }
        Returns: number
      }
      match_recurring_instances: {
        Args: { p_user_id: string }
        Returns: number
      }
      refresh_recurring_tracking: { Args: { p_user_id: string }; Returns: Json }
      seed_demo_data: { Args: { p_user_id: string }; Returns: undefined }
    }
    Enums: {
      account_type:
        | "bank"
        | "digital_wallet"
        | "cash"
        | "credit_card"
        | "debt"
        | "receivable"
        | "investment"
        | "manual"
      transaction_type: "expense" | "income" | "transfer" | "adjustment"
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
      account_type: [
        "bank",
        "digital_wallet",
        "cash",
        "credit_card",
        "debt",
        "receivable",
        "investment",
        "manual",
      ],
      transaction_type: ["expense", "income", "transfer", "adjustment"],
    },
  },
} as const
