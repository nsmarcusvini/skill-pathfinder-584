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
      certifications_catalog: {
        Row: {
          cost_usd: number | null
          created_at: string
          difficulty: string | null
          exam_duration_min: number | null
          id: string
          is_active: boolean
          issuer: string
          level: string | null
          name: string
          official_url: string | null
          skill_ids: string[]
          track_ids: string[]
          validity_months: number | null
        }
        Insert: {
          cost_usd?: number | null
          created_at?: string
          difficulty?: string | null
          exam_duration_min?: number | null
          id?: string
          is_active?: boolean
          issuer: string
          level?: string | null
          name: string
          official_url?: string | null
          skill_ids?: string[]
          track_ids?: string[]
          validity_months?: number | null
        }
        Update: {
          cost_usd?: number | null
          created_at?: string
          difficulty?: string | null
          exam_duration_min?: number | null
          id?: string
          is_active?: boolean
          issuer?: string
          level?: string | null
          name?: string
          official_url?: string | null
          skill_ids?: string[]
          track_ids?: string[]
          validity_months?: number | null
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
      courses_catalog: {
        Row: {
          created_at: string
          duration_hours: number | null
          format: string | null
          id: string
          is_active: boolean
          language: string
          level: string | null
          price_type: string | null
          provider: string
          rating: number | null
          skill_ids: string[]
          title: string
          track_ids: string[]
          url: string | null
        }
        Insert: {
          created_at?: string
          duration_hours?: number | null
          format?: string | null
          id?: string
          is_active?: boolean
          language?: string
          level?: string | null
          price_type?: string | null
          provider: string
          rating?: number | null
          skill_ids?: string[]
          title: string
          track_ids?: string[]
          url?: string | null
        }
        Update: {
          created_at?: string
          duration_hours?: number | null
          format?: string | null
          id?: string
          is_active?: boolean
          language?: string
          level?: string | null
          price_type?: string | null
          provider?: string
          rating?: number | null
          skill_ids?: string[]
          title?: string
          track_ids?: string[]
          url?: string | null
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
      gap_analyses: {
        Row: {
          category_scores: Json
          computed_at: string
          currency: string
          id: string
          low_confidence: boolean
          market_segment: string
          overall_score: number
          params_hash: string
          postings_sample: number
          role_variant_id: string | null
          seniority: string | null
          track_id: string | null
          user_id: string
          widening_step: string
        }
        Insert: {
          category_scores?: Json
          computed_at?: string
          currency?: string
          id?: string
          low_confidence?: boolean
          market_segment?: string
          overall_score?: number
          params_hash: string
          postings_sample?: number
          role_variant_id?: string | null
          seniority?: string | null
          track_id?: string | null
          user_id: string
          widening_step?: string
        }
        Update: {
          category_scores?: Json
          computed_at?: string
          currency?: string
          id?: string
          low_confidence?: boolean
          market_segment?: string
          overall_score?: number
          params_hash?: string
          postings_sample?: number
          role_variant_id?: string | null
          seniority?: string | null
          track_id?: string | null
          user_id?: string
          widening_step?: string
        }
        Relationships: [
          {
            foreignKeyName: "gap_analyses_role_variant_id_fkey"
            columns: ["role_variant_id"]
            isOneToOne: false
            referencedRelation: "track_role_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gap_analyses_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "career_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      gap_analysis_items: {
        Row: {
          baseline_importance: number
          coverage: number
          gap_analysis_id: string
          gap_score: number
          id: string
          market_demand: number
          required_level: number
          skill_id: string
          status: string
          user_level: number
          weight: number
        }
        Insert: {
          baseline_importance?: number
          coverage?: number
          gap_analysis_id: string
          gap_score?: number
          id?: string
          market_demand?: number
          required_level?: number
          skill_id: string
          status: string
          user_level?: number
          weight?: number
        }
        Update: {
          baseline_importance?: number
          coverage?: number
          gap_analysis_id?: string
          gap_score?: number
          id?: string
          market_demand?: number
          required_level?: number
          skill_id?: string
          status?: string
          user_level?: number
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "gap_analysis_items_gap_analysis_id_fkey"
            columns: ["gap_analysis_id"]
            isOneToOne: false
            referencedRelation: "gap_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gap_analysis_items_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "job_posting_raw_job_posting_id_fkey"
            columns: ["job_posting_id"]
            isOneToOne: false
            referencedRelation: "job_postings_canonical"
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
          is_required: boolean | null
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
          is_required?: boolean | null
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
          is_required?: boolean | null
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
            foreignKeyName: "job_posting_skills_job_posting_id_fkey"
            columns: ["job_posting_id"]
            isOneToOne: false
            referencedRelation: "job_postings_canonical"
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
          benefits_text: string | null
          canonical_job_id: string | null
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
          last_seen_at: string | null
          lifecycle_status: string
          location_raw: string | null
          market_segment: string
          posted_at: string | null
          qualifications_text: string | null
          remote_restriction: string | null
          requirements_text: string | null
          role_variant_id: string | null
          salary_currency: string | null
          salary_is_estimated: boolean
          salary_max: number | null
          salary_min: number | null
          salary_period: string | null
          seniority: string | null
          skills_extracted_at: string | null
          source_id: string
          source_job_id: string | null
          source_updated_at: string | null
          source_url: string | null
          state: string | null
          title: string
          title_normalized: string | null
          track_id: string | null
          work_modality: string | null
        }
        Insert: {
          apply_url?: string | null
          benefits_text?: string | null
          canonical_job_id?: string | null
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
          last_seen_at?: string | null
          lifecycle_status?: string
          location_raw?: string | null
          market_segment: string
          posted_at?: string | null
          qualifications_text?: string | null
          remote_restriction?: string | null
          requirements_text?: string | null
          role_variant_id?: string | null
          salary_currency?: string | null
          salary_is_estimated?: boolean
          salary_max?: number | null
          salary_min?: number | null
          salary_period?: string | null
          seniority?: string | null
          skills_extracted_at?: string | null
          source_id: string
          source_job_id?: string | null
          source_updated_at?: string | null
          source_url?: string | null
          state?: string | null
          title: string
          title_normalized?: string | null
          track_id?: string | null
          work_modality?: string | null
        }
        Update: {
          apply_url?: string | null
          benefits_text?: string | null
          canonical_job_id?: string | null
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
          last_seen_at?: string | null
          lifecycle_status?: string
          location_raw?: string | null
          market_segment?: string
          posted_at?: string | null
          qualifications_text?: string | null
          remote_restriction?: string | null
          requirements_text?: string | null
          role_variant_id?: string | null
          salary_currency?: string | null
          salary_is_estimated?: boolean
          salary_max?: number | null
          salary_min?: number | null
          salary_period?: string | null
          seniority?: string | null
          skills_extracted_at?: string | null
          source_id?: string
          source_job_id?: string | null
          source_updated_at?: string | null
          source_url?: string | null
          state?: string | null
          title?: string
          title_normalized?: string | null
          track_id?: string | null
          work_modality?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_postings_canonical_job_id_fkey"
            columns: ["canonical_job_id"]
            isOneToOne: false
            referencedRelation: "job_postings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_postings_canonical_job_id_fkey"
            columns: ["canonical_job_id"]
            isOneToOne: false
            referencedRelation: "job_postings_canonical"
            referencedColumns: ["id"]
          },
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
          ingest_token_hash: string | null
          is_active: boolean
          key: string
          last_run_at: string | null
          last_run_count: number
          last_run_status: string | null
          name: string
          source_type: string
          updated_at: string
        }
        Insert: {
          adapter: string
          config?: Json
          created_at?: string
          error_message?: string | null
          id?: string
          ingest_token_hash?: string | null
          is_active?: boolean
          key: string
          last_run_at?: string | null
          last_run_count?: number
          last_run_status?: string | null
          name: string
          source_type?: string
          updated_at?: string
        }
        Update: {
          adapter?: string
          config?: Json
          created_at?: string
          error_message?: string | null
          id?: string
          ingest_token_hash?: string | null
          is_active?: boolean
          key?: string
          last_run_at?: string | null
          last_run_count?: number
          last_run_status?: string | null
          name?: string
          source_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_url: string | null
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          title?: string
          type?: string
          user_id?: string
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
          distinct_jobs: number
          example_snippet: string | null
          first_seen: string
          id: string
          lang: string
          last_seen: string
          occurrences: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          suggested_by: string | null
          suggested_skill_id: string | null
          term: string
        }
        Insert: {
          context?: string | null
          created_at?: string
          distinct_jobs?: number
          example_snippet?: string | null
          first_seen?: string
          id?: string
          lang?: string
          last_seen?: string
          occurrences?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          suggested_by?: string | null
          suggested_skill_id?: string | null
          term: string
        }
        Update: {
          context?: string | null
          created_at?: string
          distinct_jobs?: number
          example_snippet?: string | null
          first_seen?: string
          id?: string
          lang?: string
          last_seen?: string
          occurrences?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          suggested_by?: string | null
          suggested_skill_id?: string | null
          term?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_skill_terms_suggested_skill_id_fkey"
            columns: ["suggested_skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
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
          is_admin: boolean
          is_anonymous: boolean
          onboarding_completed: boolean
          seniority: string | null
          state: string | null
          target_currency: string
          target_region: string
          tour_status: string
          tour_step: number
          tour_updated_at: string | null
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
          is_admin?: boolean
          is_anonymous?: boolean
          onboarding_completed?: boolean
          seniority?: string | null
          state?: string | null
          target_currency?: string
          target_region?: string
          tour_status?: string
          tour_step?: number
          tour_updated_at?: string | null
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
          is_admin?: boolean
          is_anonymous?: boolean
          onboarding_completed?: boolean
          seniority?: string | null
          state?: string | null
          target_currency?: string
          target_region?: string
          tour_status?: string
          tour_step?: number
          tour_updated_at?: string | null
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
      provider_snapshots: {
        Row: {
          dataset_id: string | null
          error: string | null
          id: string
          ingested_at: string | null
          jobs_created: number
          jobs_rejected: number
          jobs_updated: number
          last_polled_at: string | null
          poll_count: number
          provider: string
          provider_snapshot_id: string
          records_downloaded: number
          request: Json
          source_id: string
          status: string
          triggered_at: string
        }
        Insert: {
          dataset_id?: string | null
          error?: string | null
          id?: string
          ingested_at?: string | null
          jobs_created?: number
          jobs_rejected?: number
          jobs_updated?: number
          last_polled_at?: string | null
          poll_count?: number
          provider?: string
          provider_snapshot_id: string
          records_downloaded?: number
          request?: Json
          source_id: string
          status?: string
          triggered_at?: string
        }
        Update: {
          dataset_id?: string | null
          error?: string | null
          id?: string
          ingested_at?: string | null
          jobs_created?: number
          jobs_rejected?: number
          jobs_updated?: number
          last_polled_at?: string | null
          poll_count?: number
          provider?: string
          provider_snapshot_id?: string
          records_downloaded?: number
          request?: Json
          source_id?: string
          status?: string
          triggered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_snapshots_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "job_sources"
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
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          seniority: string | null
          source: string
          status: string
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
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          seniority?: string | null
          source: string
          status?: string
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
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          seniority?: string | null
          source?: string
          status?: string
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
            foreignKeyName: "salary_observations_job_posting_id_fkey"
            columns: ["job_posting_id"]
            isOneToOne: false
            referencedRelation: "job_postings_canonical"
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
      skill_term_blocklist: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          reason: string | null
          term: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          reason?: string | null
          term: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          reason?: string | null
          term?: string
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
      study_items: {
        Row: {
          completed_at: string | null
          created_at: string
          due_date: string | null
          estimated_hours: number | null
          id: string
          notes: string | null
          plan_id: string
          priority: number
          progress_percent: number
          resource_url: string | null
          skill_id: string | null
          source_gap_item_id: string | null
          spent_hours: number
          start_date: string | null
          status: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          notes?: string | null
          plan_id: string
          priority?: number
          progress_percent?: number
          resource_url?: string | null
          skill_id?: string | null
          source_gap_item_id?: string | null
          spent_hours?: number
          start_date?: string | null
          status?: string
          title: string
          type?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          notes?: string | null
          plan_id?: string
          priority?: number
          progress_percent?: number
          resource_url?: string | null
          skill_id?: string | null
          source_gap_item_id?: string | null
          spent_hours?: number
          start_date?: string | null
          status?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "study_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_items_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      study_logs: {
        Row: {
          created_at: string
          hours: number
          id: string
          item_id: string
          logged_at: string
          note: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          hours?: number
          id?: string
          item_id: string
          logged_at?: string
          note?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          hours?: number
          id?: string
          item_id?: string
          logged_at?: string
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_logs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "study_items"
            referencedColumns: ["id"]
          },
        ]
      }
      study_plans: {
        Row: {
          created_at: string
          description: string | null
          id: string
          status: string
          target_date: string | null
          title: string
          track_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          status?: string
          target_date?: string | null
          title: string
          track_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          status?: string
          target_date?: string | null
          title?: string
          track_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_plans_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "career_tracks"
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
      user_certifications: {
        Row: {
          certification_id: string | null
          created_at: string
          credential_id: string | null
          credential_url: string | null
          custom_name: string | null
          expires_at: string | null
          id: string
          obtained_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          certification_id?: string | null
          created_at?: string
          credential_id?: string | null
          credential_url?: string | null
          custom_name?: string | null
          expires_at?: string | null
          id?: string
          obtained_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          certification_id?: string | null
          created_at?: string
          credential_id?: string | null
          credential_url?: string | null
          custom_name?: string | null
          expires_at?: string | null
          id?: string
          obtained_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_certifications_certification_id_fkey"
            columns: ["certification_id"]
            isOneToOne: false
            referencedRelation: "certifications_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      user_courses: {
        Row: {
          certificate_url: string | null
          completed_at: string | null
          course_id: string | null
          created_at: string
          custom_title: string | null
          id: string
          progress_percent: number
          started_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          certificate_url?: string | null
          completed_at?: string | null
          course_id?: string | null
          created_at?: string
          custom_title?: string | null
          id?: string
          progress_percent?: number
          started_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          certificate_url?: string | null
          completed_at?: string | null
          course_id?: string | null
          created_at?: string
          custom_title?: string | null
          id?: string
          progress_percent?: number
          started_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      user_followed_companies: {
        Row: {
          company_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_followed_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      view_refresh_log: {
        Row: {
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          id: string
          started_at: string
          status: string
          views_refreshed: number
        }
        Insert: {
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
          views_refreshed?: number
        }
        Update: {
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
          views_refreshed?: number
        }
        Relationships: []
      }
    }
    Views: {
      job_postings_canonical: {
        Row: {
          apply_url: string | null
          benefits_text: string | null
          canonical_job_id: string | null
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
          external_id: string | null
          id: string | null
          ingested_at: string | null
          is_active: boolean | null
          is_remote: boolean | null
          last_seen_at: string | null
          lifecycle_status: string | null
          location_raw: string | null
          market_segment: string | null
          posted_at: string | null
          qualifications_text: string | null
          remote_restriction: string | null
          requirements_text: string | null
          role_variant_id: string | null
          salary_currency: string | null
          salary_is_estimated: boolean | null
          salary_max: number | null
          salary_min: number | null
          salary_period: string | null
          seniority: string | null
          skills_extracted_at: string | null
          source_id: string | null
          source_job_id: string | null
          source_updated_at: string | null
          source_url: string | null
          state: string | null
          title: string | null
          title_normalized: string | null
          track_id: string | null
          work_modality: string | null
        }
        Insert: {
          apply_url?: string | null
          benefits_text?: string | null
          canonical_job_id?: string | null
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
          external_id?: string | null
          id?: string | null
          ingested_at?: string | null
          is_active?: boolean | null
          is_remote?: boolean | null
          last_seen_at?: string | null
          lifecycle_status?: string | null
          location_raw?: string | null
          market_segment?: string | null
          posted_at?: string | null
          qualifications_text?: string | null
          remote_restriction?: string | null
          requirements_text?: string | null
          role_variant_id?: string | null
          salary_currency?: string | null
          salary_is_estimated?: boolean | null
          salary_max?: number | null
          salary_min?: number | null
          salary_period?: string | null
          seniority?: string | null
          skills_extracted_at?: string | null
          source_id?: string | null
          source_job_id?: string | null
          source_updated_at?: string | null
          source_url?: string | null
          state?: string | null
          title?: string | null
          title_normalized?: string | null
          track_id?: string | null
          work_modality?: string | null
        }
        Update: {
          apply_url?: string | null
          benefits_text?: string | null
          canonical_job_id?: string | null
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
          external_id?: string | null
          id?: string | null
          ingested_at?: string | null
          is_active?: boolean | null
          is_remote?: boolean | null
          last_seen_at?: string | null
          lifecycle_status?: string | null
          location_raw?: string | null
          market_segment?: string | null
          posted_at?: string | null
          qualifications_text?: string | null
          remote_restriction?: string | null
          requirements_text?: string | null
          role_variant_id?: string | null
          salary_currency?: string | null
          salary_is_estimated?: boolean | null
          salary_max?: number | null
          salary_min?: number | null
          salary_period?: string | null
          seniority?: string | null
          skills_extracted_at?: string | null
          source_id?: string | null
          source_job_id?: string | null
          source_updated_at?: string | null
          source_url?: string | null
          state?: string | null
          title?: string | null
          title_normalized?: string | null
          track_id?: string | null
          work_modality?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_postings_canonical_job_id_fkey"
            columns: ["canonical_job_id"]
            isOneToOne: false
            referencedRelation: "job_postings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_postings_canonical_job_id_fkey"
            columns: ["canonical_job_id"]
            isOneToOne: false
            referencedRelation: "job_postings_canonical"
            referencedColumns: ["id"]
          },
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
      company_monthly: {
        Args: {
          _company_id: string
          _months?: number
          _segments: string[]
          _track_id: string
        }
        Returns: {
          jobs: number
          month: string
        }[]
      }
      company_ranking: {
        Args: {
          _segments: string[]
          _seniorities?: string[]
          _since: string
          _track_id: string
        }
        Returns: {
          avg_salary_max: number
          avg_salary_min: number
          company_id: string
          currency: string
          industry: string
          jobs: number
          last_posted_at: string
          logo_url: string
          name: string
          remote_jobs: number
          segments: string[]
          slug: string
          top_skills: Json
          website: string
        }[]
      }
      company_skill_demand: {
        Args: {
          _company_id: string
          _segments: string[]
          _since: string
          _track_id: string
        }
        Returns: {
          jobs: number
          skill_id: string
          total_jobs: number
        }[]
      }
      dedupe_job_postings: {
        Args: { _proximity_days?: number; _window_days?: number }
        Returns: {
          alteradas: number
          duplicatas: number
          grupos: number
        }[]
      }
      expire_old_jobs: { Args: never; Returns: number }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      job_locations: {
        Args: { _segments: string[]; _track_id: string }
        Returns: {
          chave: string
          grafias: string[]
          rotulo: string
          vagas: number
        }[]
      }
      landing_stats: { Args: never; Returns: Json }
      market_demand: {
        Args: {
          _include_unranked?: boolean
          _segments: string[]
          _seniorities: string[]
          _since: string
          _track_id: string
        }
        Returns: {
          jobs: number
          skill_id: string
          total_jobs: number
        }[]
      }
      market_scope_stats: {
        Args: {
          _include_unranked?: boolean
          _salary_segment?: string
          _segments: string[]
          _seniorities: string[]
          _since: string
          _track_id: string
        }
        Returns: {
          companies_30d: number
          salary_median: number
          total_jobs: number
        }[]
      }
      match_company: { Args: { _name: string }; Returns: string }
      notify_expiring_certs: { Args: never; Returns: undefined }
      purge_inactive_anonymous: { Args: never; Returns: number }
      refresh_market_views: { Args: never; Returns: undefined }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      tool_detail: {
        Args: {
          _segments: string[]
          _seniorities?: string[]
          _since: string
          _skill_id: string
          _track_id: string
        }
        Returns: {
          companies: Json
          cooccurrence: Json
          demand: number
          jobs: number
          salary_currency: string
          salary_p25: number
          salary_p50: number
          salary_p75: number
          salary_sample: number
          total_jobs: number
        }[]
      }
      tool_monthly: {
        Args: {
          _months?: number
          _segments: string[]
          _seniorities?: string[]
          _skill_ids: string[]
          _track_id: string
        }
        Returns: {
          demand: number
          jobs: number
          month: string
          skill_id: string
          total_jobs: number
        }[]
      }
      tool_ranking: {
        Args: {
          _categories?: string[]
          _segments: string[]
          _seniorities?: string[]
          _since: string
          _track_id: string
        }
        Returns: {
          category_key: string
          category_name: string
          demand: number
          is_certifiable: boolean
          jobs: number
          name: string
          skill_id: string
          slug: string
          total_jobs: number
          trend: number
          website_url: string
        }[]
      }
      unaccent: { Args: { "": string }; Returns: string }
      verify_cron_secret: { Args: { _token: string }; Returns: boolean }
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
