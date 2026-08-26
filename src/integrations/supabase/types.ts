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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      career_tracks: {
        Row: {
          color_token: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          key: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color_token?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          key: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color_token?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          key?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          city: string | null
          country: string | null
          created_at: string
          current_track_id: string | null
          full_name: string | null
          headline: string | null
          id: string
          onboarding_completed: boolean
          seniority: string | null
          state: string | null
          target_currency: string
          target_region: string
          updated_at: string
          years_experience: number | null
        }
        Insert: {
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          current_track_id?: string | null
          full_name?: string | null
          headline?: string | null
          id: string
          onboarding_completed?: boolean
          seniority?: string | null
          state?: string | null
          target_currency?: string
          target_region?: string
          updated_at?: string
          years_experience?: number | null
        }
        Update: {
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          current_track_id?: string | null
          full_name?: string | null
          headline?: string | null
          id?: string
          onboarding_completed?: boolean
          seniority?: string | null
          state?: string | null
          target_currency?: string
          target_region?: string
          updated_at?: string
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_current_track_id_fkey"
            columns: ["current_track_id"]
            isOneToOne: false
            referencedRelation: "career_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_aliases: {
        Row: {
          alias: string
          created_at: string
          id: string
          lang: string
          skill_id: string
          source: string
        }
        Insert: {
          alias: string
          created_at?: string
          id?: string
          lang?: string
          skill_id: string
          source?: string
        }
        Update: {
          alias?: string
          created_at?: string
          id?: string
          lang?: string
          skill_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "skill_aliases_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_categories: {
        Row: {
          color_token: string
          id: string
          key: string
          name: string
          sort_order: number
        }
        Insert: {
          color_token?: string
          id?: string
          key: string
          name: string
          sort_order?: number
        }
        Update: {
          color_token?: string
          id?: string
          key?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      skills: {
        Row: {
          canonical_name: string
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          is_ambiguous: boolean
          is_certifiable: boolean
          is_tool: boolean
          match_patterns: string[]
          slug: string
          website_url: string | null
        }
        Insert: {
          canonical_name: string
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_ambiguous?: boolean
          is_certifiable?: boolean
          is_tool?: boolean
          match_patterns?: string[]
          slug: string
          website_url?: string | null
        }
        Update: {
          canonical_name?: string
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_ambiguous?: boolean
          is_certifiable?: boolean
          is_tool?: boolean
          match_patterns?: string[]
          slug?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "skills_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "skill_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      track_role_variants: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          key: string
          name: string
          search_terms: string[]
          sort_order: number
          track_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          key: string
          name: string
          search_terms?: string[]
          sort_order?: number
          track_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string
          name?: string
          search_terms?: string[]
          sort_order?: number
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "track_role_variants_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "career_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      track_skill_baselines: {
        Row: {
          created_at: string
          id: string
          importance: number
          is_core: boolean
          required_level: number
          seniority: string
          skill_id: string
          track_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          importance?: number
          is_core?: boolean
          required_level?: number
          seniority: string
          skill_id: string
          track_id: string
        }
        Update: {
          created_at?: string
          id?: string
          importance?: number
          is_core?: boolean
          required_level?: number
          seniority?: string
          skill_id?: string
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "track_skill_baselines_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "track_skill_baselines_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "career_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      user_track_preferences: {
        Row: {
          created_at: string
          currency: string
          id: string
          is_primary: boolean
          region: string
          role_variant_id: string | null
          seniority_target: string | null
          track_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          is_primary?: boolean
          region?: string
          role_variant_id?: string | null
          seniority_target?: string | null
          track_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          is_primary?: boolean
          region?: string
          role_variant_id?: string | null
          seniority_target?: string | null
          track_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_track_preferences_role_variant_id_fkey"
            columns: ["role_variant_id"]
            isOneToOne: false
            referencedRelation: "track_role_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_track_preferences_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "career_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      unaccent: { Args: { "": string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
