// Hand-written DB types matching supabase/schema.sql.
// (Later we can replace with `supabase gen types typescript` output.)

export type Database = {
  public: {
    Tables: {
      households: {
        Row: {
          id: string
          name: string
          home_currency: string
          timezone: string
          reminder_template: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          home_currency?: string
          timezone?: string
          reminder_template?: string
        }
        Update: {
          name?: string
          home_currency?: string
          timezone?: string
          reminder_template?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          user_id: string
          household_id: string
          username: string
          email: string
          created_at: string
        }
        Insert: {
          user_id: string
          household_id: string
          username: string
          email: string
        }
        Update: {
          username?: string
          email?: string
        }
        Relationships: []
      }
      people: {
        Row: {
          id: string
          household_id: string
          name: string
          whatsapp: string
          color: string
          sort_order: number
          created_at: string
          deleted_at: string | null
        }
        Insert: {
          id: string
          household_id: string
          name?: string
          whatsapp?: string
          color?: string
          sort_order?: number
          deleted_at?: string | null
        }
        Update: {
          name?: string
          whatsapp?: string
          color?: string
          sort_order?: number
          deleted_at?: string | null
        }
        Relationships: []
      }
      countries: {
        Row: {
          id: string
          household_id: string
          name: string
          currency_code: string
          sort_order: number
          created_at: string
          deleted_at: string | null
        }
        Insert: {
          id: string
          household_id: string
          name: string
          currency_code: string
          sort_order?: number
          deleted_at?: string | null
        }
        Update: {
          name?: string
          currency_code?: string
          sort_order?: number
          deleted_at?: string | null
        }
        Relationships: []
      }
      items: {
        Row: {
          id: string
          household_id: string
          country_id: string
          name: string
          type: string
          sort_order: number
          created_at: string
          deleted_at: string | null
        }
        Insert: {
          id: string
          household_id: string
          country_id: string
          name: string
          type?: string
          sort_order?: number
          deleted_at?: string | null
        }
        Update: {
          country_id?: string
          name?: string
          type?: string
          sort_order?: number
          deleted_at?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          id: string
          household_id: string
          item_id: string | null
          person: string
          name: string
          amount: number
          currency: string
          direction: 'incoming' | 'outgoing'
          due_date: string
          recurrence: 'one-off' | 'monthly' | 'quarterly' | 'yearly'
          end_date: string | null
          status: 'upcoming' | 'overdue' | 'paid'
          paid_at: string | null
          paid_via: 'portal' | 'whatsapp' | null
          last_reminder_sent: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
          portal_name: string | null
          bank_name: string | null
          notes: string | null
          has_credentials: boolean
        }
        Insert: {
          id?: string
          household_id: string
          item_id?: string | null
          person?: string
          name: string
          amount: number
          currency?: string
          direction: 'incoming' | 'outgoing'
          due_date: string
          recurrence?: 'one-off' | 'monthly' | 'quarterly' | 'yearly'
          end_date?: string | null
          status?: 'upcoming' | 'overdue' | 'paid'
          paid_at?: string | null
          paid_via?: 'portal' | 'whatsapp' | null
          last_reminder_sent?: string | null
          deleted_at?: string | null
          portal_name?: string | null
          bank_name?: string | null
          notes?: string | null
        }
        Update: {
          item_id?: string | null
          person?: string
          name?: string
          amount?: number
          currency?: string
          direction?: 'incoming' | 'outgoing'
          due_date?: string
          recurrence?: 'one-off' | 'monthly' | 'quarterly' | 'yearly'
          end_date?: string | null
          status?: 'upcoming' | 'overdue' | 'paid'
          paid_at?: string | null
          paid_via?: 'portal' | 'whatsapp' | null
          last_reminder_sent?: string | null
          deleted_at?: string | null
          portal_name?: string | null
          bank_name?: string | null
          notes?: string | null
        }
        Relationships: []
      }
      reminder_rules: {
        Row: {
          id: string
          household_id: string
          offset_days: number | null
          enabled: boolean
          sort_order: number
          created_at: string
        }
        Insert: {
          id: string
          household_id: string
          offset_days?: number | null
          enabled?: boolean
          sort_order?: number
        }
        Update: {
          offset_days?: number | null
          enabled?: boolean
          sort_order?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_email_by_username: {
        Args: { p_username: string }
        Returns: string | null
      }
      setup_new_household: {
        Args: {
          p_username: string
          p_email: string
          p_household_name: string
        }
        Returns: string
      }
      clone_payment_next_recurrence: {
        Args: {
          source_payment_id: string
          next_due_date: string
          next_status: 'upcoming' | 'overdue'
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
