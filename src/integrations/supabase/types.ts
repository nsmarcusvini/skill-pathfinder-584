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
      app_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
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
      companies: {
        Row: {
          created_at: string
          hq_country: string | null
          id: string
          industry: string | null
          is_verified: boolean
          linkedin_url: string | null
          logo_url: string | null
          name: string
          size_range: string | null
          slug: string
          website: string | null
        }
        Insert: {
          created_at?: string
          hq_country?: string | null
          id?: string
          industry?: string | null
          is_verified?: boolean
          linkedin_url?: string | null
          logo_url?: string | null
          name: string
          size_range?: string | null
          slug: string
          website?: string | null
        }
        Update: {
          created_at?: string
          hq_country?: string | null
          id?: string
          industry?: string | null
          is_verified?: boolean
          linkedin_url?: string | null
          logo_url?: string | null
          name?: string
          size_range?: string | null
          slug?: string
          website?: string | null
        }
        Relationships: []
      }
      cv_extracted_skills: {
        Row: {
          accepted: boolean | null
          confidence: number
          created_at: string
          cv_id: string
          evidence_snippet: string | null
          first_year: number | null
          id: string
          last_year: number | null
          level_hint: number | null
          matched_by: string
          mention_count: number
          raw_term: string
          section: string
          skill_id: string | null
          years_hint: number | null
        }
        Insert: {
          accepted?: boolean | null
          confidence?: number
          created_at?: string
          cv_id: string
          evidence_snippet?: string | null
          first_year?: number | null
          id?: string
          last_year?: number | null
          level_hint?: number | null
          matched_by: string
          mention_count?: number
          raw_term: string
          section?: string
          skill_id?: string | null
          years_hint?: number | null
        }
        Update: {
          accepted?: boolean | null
          confidence?: number
          created_at?: string
          cv_id?: string
          evidence_snippet?: string | null
          first_year?: number | null
          id?: string
          last_year?: number | null
          level_hint?: number | null
          matched_by?: string
          mention_count?: number
          raw_term?: string
          section?: string
          skill_id?: string | null
          years_hint?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cv_extracted_skills_cv_id_fkey"
            columns: ["cv_id"]
            isOneToOne: false
            referencedRelation: "cvs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cv_extracted_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      cv_versions: {
        Row: {
          cv_id: string
          detected_seniority: string | null
          detected_track_id: string | null
          detection_confidence: number | null
          extracted_text: string | null
          id: string
          parsed_at: string
          parsed_json: Json
          parser_version: string
          version: number
        }
        Insert: {
          cv_id: string
          detected_seniority?: string | null
          detected_track_id?: string | null
          detection_confidence?: number | null
          extracted_text?: string | null
          id?: string
          parsed_at?: string
          parsed_json?: Json
          parser_version?: string
          version?: number
        }
        Update: {
          cv_id?: string
          detected_seniority?: string | null
          detected_track_id?: string | null
          detection_confidence?: number | null
          extracted_text?: string | null
          id?: string
          parsed_at?: string
          parsed_json?: Json
          parser_version?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "cv_versions_cv_id_fkey"
            columns: ["cv_id"]
            isOneToOne: false
            referencedRelation: "cvs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cv_versions_detected_track_id_fkey"
            columns: ["detected_track_id"]
            isOneToOne: false
            referencedRelation: "career_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      cvs: {
        Row: {
          consent_at: string | null
          created_at: string
          file_size: number
          id: string
          is_current: boolean
          mime_type: string
          original_filename: string
          parse_error: string | null
          status: string
          storage_path: string
          user_id: string
        }
        Insert: {
          consent_at?: string | null
          created_at?: string
          file_size: number
          id?: string
          is_current?: boolean
          mime_type: string
          original_filename: string
          parse_error?: string | null
          status?: string
          storage_path: string
          user_id: string
        }
        Update: {
          consent_at?: string | null
          created_at?: string
          file_size?: number
          id?: string
          is_current?: boolean
          mime_type?: string
          original_filename?: string
          parse_error?: string | null
          status?: string
          storage_path?: string
          user_id?: string
        }
        Relationships: []
      }
      ingestion_runs: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          jobs_found: number
          jobs_new: number
          jobs_updated: number
          source_id: string
          started_at: string
          status: string
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          jobs_found?: number
          jobs_new?: number
          jobs_updated?: number
          source_id: string
          started_at?: string
          status?: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          jobs_found?: number
          jobs_new?: number
          jobs_updated?: number
          source_id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "job_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      job_posting_raw: {
        Row: {
          fetched_at: string
          id: string
          job_posting_id: string
          payload: Json
        }
        Insert: {
          fetched_at?: string
          id?: string
          job_posting_id: string
          payload?: Json
        }
        Update: {
          fetched_at?: string
          id?: string
          job_posting_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "job_posting_raw_job_posting_id_fkey"
            columns: ["job_posting_id"]
            isOneToOne: false
            referencedRelation: "job_postings"
            referencedColumns: ["id"]
          },
        ]
      }
      job_posting_skills: {
        Row: {
          confidence: number
          created_at: string
          extraction_method: string
          id: string
          is_required: boolean
          job_posting_id: string
          matched_alias: string | null
          mention_count: number
          skill_id: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          extraction_method: string
          id?: string
          is_required?: boolean
          job_posting_id: string
          matched_alias?: string | null
          mention_count?: number
          skill_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          extraction_method?: string
          id?: string
          is_required?: boolean
          job_posting_id?: string
          matched_alias?: string | null
          mention_count?: number
          skill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_posting_skills_job_posting_id_fkey"
            columns: ["job_posting_id"]
            isOneToOne: false
            referencedRelation: "job_postings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_posting_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      job_postings: {
        Row: {
          apply_url: string | null
          city: string | null
          company_id: string | null
          company_name_raw: string | null
          country: string | null
          dedupe_hash: string | null
          description_lang: string | null
          description_text: string | null
          description_tsv: unknown
          employment_type: string | null
          expires_at: string | null
          external_id: string
          id: string
          ingested_at: string
          is_active: boolean
          is_remote: boolean
          location_raw: string | null
          market_segment: string
          posted_at: string | null
          remote_restriction: string | null
          role_variant_id: string | null
          salary_currency: string | null
          salary_is_estimated: boolean
          salary_max: number | null
          salary_min: number | null
          salary_period: string | null
          seniority: string | null
          source_id: string
          state: string | null
          title: string
          title_normalized: string | null
          track_id: string | null
        }
        Insert: {
          apply_url?: string | null
          city?: string | null
          company_id?: string | null
          company_name_raw?: string | null
          country?: string | null
          dedupe_hash?: string | null
          description_lang?: string | null
          description_text?: string | null
          description_tsv?: unknown
          employment_type?: string | null
          expires_at?: string | null
          external_id: string
          id?: string
          ingested_at?: string
          is_active?: boolean
          is_remote?: boolean
          location_raw?: string | null
          market_segment: string
          posted_at?: string | null
          remote_restriction?: string | null
          role_variant_id?: string | null
          salary_currency?: string | null
          salary_is_estimated?: boolean
          salary_max?: number | null
          salary_min?: number | null
          salary_period?: string | null
          seniority?: string | null
          source_id: string
          state?: string | null
          title: string
          title_normalized?: string | null
          track_id?: string | null
        }
        Update: {
          apply_url?: string | null
          city?: string | null
          company_id?: string | null
          company_name_raw?: string | null
          country?: string | null
          dedupe_hash?: string | null
          description_lang?: string | null
          description_text?: string | null
          description_tsv?: unknown
          employment_type?: string | null
          expires_at?: string | null
          external_id?: string
          id?: string
          ingested_at?: string
          is_active?: boolean
          is_remote?: boolean
          location_raw?: string | null
          market_segment?: string
          posted_at?: string | null
          remote_restriction?: string | null
          role_variant_id?: string | null
          salary_currency?: string | null
          salary_is_estimated?: boolean
          salary_max?: number | null
          salary_min?: number | null
          salary_period?: string | null
          seniority?: string | null
          source_id?: string
          state?: string | null
          title?: string
          title_normalized?: string | null
          track_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_postings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_postings_role_variant_id_fkey"
            columns: ["role_variant_id"]
            isOneToOne: false
            referencedRelation: "track_role_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_postings_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "job_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_postings_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "career_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      job_sources: {
        Row: {
          adapter: string
          config: Json
          created_at: string
          error_message: string | null
          id: string
          is_active: boolean
          key: string
          last_run_at: string | null
          last_run_count: number
          last_run_status: string | null
          name: string
          updated_at: string
        }
        Insert: {
          adapter: string
          config?: Json
          created_at?: string
          error_message?: string | null
          id?: string
          is_active?: boolean
          key: string
          last_run_at?: string | null
          last_run_count?: number
          last_run_status?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          adapter?: string
          config?: Json
          created_at?: string
          error_message?: string | null
          id?: string
          is_active?: boolean
          key?: string
          last_run_at?: string | null
          last_run_count?: number
          last_run_status?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      parse_rate_limits: {
        Row: {
          count: number
          id: string
          ip_hash: string
          window_start: string
        }
        Insert: {
          count?: number
          id?: string
          ip_hash: string
          window_start: string
        }
        Update: {
          count?: number
          id?: string
          ip_hash?: string
          window_start?: string
        }
        Relationships: []
      }
      pending_skill_terms: {
        Row: {
          context: string | null
          created_at: string
          id: string
          occurrences: number
          status: string
          suggested_by: string | null
          term: string
        }
        Insert: {
          context?: string | null
          created_at?: string
          id?: string
          occurrences?: number
          status?: string
          suggested_by?: string | null
          term: string
        }
        Update: {
          context?: string | null
          created_at?: string
          id?: string
          occurrences?: number
          status?: string
          suggested_by?: string | null
          term?: string
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
          is_anonymous: boolean
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
          is_anonymous?: boolean
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
          is_anonymous?: boolean
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
      salary_observations: {
        Row: {
          amount_max: number | null
          amount_min: number | null
          country: string | null
          currency: string
          id: string
          job_posting_id: string | null
          market_segment: string
          observed_at: string
          period: string
          seniority: string | null
          source: string
          track_id: string | null
          user_id: string | null
        }
        Insert: {
          amount_max?: number | null
          amount_min?: number | null
          country?: string | null
          currency: string
          id?: string
          job_posting_id?: string | null
          market_segment: string
          observed_at?: string
          period?: string
          seniority?: string | null
          source: string
          track_id?: string | null
          user_id?: string | null
        }
        Update: {
          amount_max?: number | null
          amount_min?: number | null
          country?: string | null
          currency?: string
          id?: string
          job_posting_id?: string | null
          market_segment?: string
          observed_at?: string
          period?: string
          seniority?: string | null
          source?: string
          track_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salary_observations_job_posting_id_fkey"
            columns: ["job_posting_id"]
            isOneToOne: false
            referencedRelation: "job_postings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_observations_track_id_fkey"
            columns: ["track_id"]
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
      user_skills: {
        Row: {
          created_at: string
          evidence: string | null
          id: string
          is_verified: boolean
          last_used_year: number | null
          level: number
          skill_id: string
          source: string
          updated_at: string
          user_id: string
          years: number | null
        }
        Insert: {
          created_at?: string
          evidence?: string | null
          id?: string
          is_verified?: boolean
          last_used_year?: number | null
          level?: number
          skill_id: string
          source?: string
          updated_at?: string
          user_id: string
          years?: number | null
        }
        Update: {
          created_at?: string
          evidence?: string | null
          id?: string
          is_verified?: boolean
          last_used_year?: number | null
          level?: number
          skill_id?: string
          source?: string
          updated_at?: string
          user_id?: string
          years?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
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
          market_segment: string
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
          market_segment?: string
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
          market_segment?: string
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
      mv_company_hiring: {
        Row: {
          avg_salary_max: number | null
          avg_salary_min: number | null
          company_id: string | null
          last_posted_at: string | null
          market_segment: string | null
          postings_count: number | null
          top_skills: Json | null
          track_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_postings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_postings_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "career_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_salary_stats: {
        Row: {
          currency: string | null
          market_segment: string | null
          p25: number | null
          p50: number | null
          p75: number | null
          sample_size: number | null
          seniority: string | null
          track_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salary_observations_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "career_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_skill_demand_by_track: {
        Row: {
          demand_ratio: number | null
          market_segment: string | null
          postings_count: number | null
          rank: number | null
          seniority: string | null
          skill_id: string | null
          total_postings: number | null
          track_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_posting_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_postings_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "career_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_tool_demand: {
        Row: {
          demand_ratio: number | null
          market_segment: string | null
          postings_count: number | null
          skill_id: string | null
          track_id: string | null
          trend_30d_vs_prev30d: number | null
        }
        Relationships: [
          {
            foreignKeyName: "job_posting_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_postings_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "career_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      refresh_market_views: { Args: never; Returns: undefined }
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
