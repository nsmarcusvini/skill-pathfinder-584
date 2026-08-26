-- RUMVIA :: 0001 core schema
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE OR REPLACE FUNCTION public.rumvia_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE IF NOT EXISTS public.career_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  icon text,
  color_token text NOT NULL DEFAULT 'accent-700',
  is_active boolean NOT NULL DEFAULT true,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.career_tracks TO authenticated;
GRANT ALL ON public.career_tracks TO service_role;
ALTER TABLE public.career_tracks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "career_tracks_read_authenticated" ON public.career_tracks
  FOR SELECT TO authenticated USING (true);
CREATE TRIGGER career_tracks_updated_at BEFORE UPDATE ON public.career_tracks
  FOR EACH ROW EXECUTE FUNCTION public.rumvia_set_updated_at();

CREATE TABLE IF NOT EXISTS public.track_role_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid NOT NULL REFERENCES public.career_tracks(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  search_terms text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (track_id, key)
);
CREATE INDEX IF NOT EXISTS idx_trv_track ON public.track_role_variants(track_id);
GRANT SELECT ON public.track_role_variants TO authenticated;
GRANT ALL ON public.track_role_variants TO service_role;
ALTER TABLE public.track_role_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "track_role_variants_read_authenticated" ON public.track_role_variants
  FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.skill_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE
    CHECK (key IN ('language','cloud','tool','practice','soft','domain','database','framework')),
  name text NOT NULL,
  color_token text NOT NULL DEFAULT 'neutral-700',
  sort_order smallint NOT NULL DEFAULT 0
);
GRANT SELECT ON public.skill_categories TO authenticated;
GRANT ALL ON public.skill_categories TO service_role;
ALTER TABLE public.skill_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "skill_categories_read_authenticated" ON public.skill_categories
  FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  category_id uuid REFERENCES public.skill_categories(id) ON DELETE SET NULL,
  description text,
  website_url text,
  is_tool boolean NOT NULL DEFAULT false,
  is_certifiable boolean NOT NULL DEFAULT false,
  match_patterns text[] NOT NULL DEFAULT '{}',
  is_ambiguous boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_skills_canonical_trgm
  ON public.skills USING gin (canonical_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_skills_category ON public.skills(category_id);
GRANT SELECT ON public.skills TO authenticated;
GRANT ALL ON public.skills TO service_role;
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "skills_read_authenticated" ON public.skills
  FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.skill_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id uuid NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  alias citext NOT NULL UNIQUE,
  lang text NOT NULL DEFAULT 'any' CHECK (lang IN ('pt','en','any')),
  source text NOT NULL DEFAULT 'curated' CHECK (source IN ('curated','mined')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_skill_aliases_trgm
  ON public.skill_aliases USING gin ((alias::text) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_skill_aliases_skill ON public.skill_aliases(skill_id);
GRANT SELECT ON public.skill_aliases TO authenticated;
GRANT ALL ON public.skill_aliases TO service_role;
ALTER TABLE public.skill_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "skill_aliases_read_authenticated" ON public.skill_aliases
  FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.track_skill_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid NOT NULL REFERENCES public.career_tracks(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  seniority text NOT NULL CHECK (seniority IN ('junior','pleno','senior','staff')),
  importance smallint NOT NULL DEFAULT 50 CHECK (importance BETWEEN 0 AND 100),
  required_level smallint NOT NULL DEFAULT 0 CHECK (required_level BETWEEN 0 AND 5),
  is_core boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (track_id, skill_id, seniority)
);
CREATE INDEX IF NOT EXISTS idx_tsb_track_sen
  ON public.track_skill_baselines(track_id, seniority);
GRANT SELECT ON public.track_skill_baselines TO authenticated;
GRANT ALL ON public.track_skill_baselines TO service_role;
ALTER TABLE public.track_skill_baselines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "track_skill_baselines_read_authenticated" ON public.track_skill_baselines
  FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  headline text,
  avatar_url text,
  country text DEFAULT 'BR',
  state text,
  city text,
  current_track_id uuid REFERENCES public.career_tracks(id) ON DELETE SET NULL,
  seniority text CHECK (seniority IN ('junior','pleno','senior','staff')),
  years_experience integer CHECK (years_experience >= 0),
  target_currency text NOT NULL DEFAULT 'BRL' CHECK (target_currency IN ('BRL','USD')),
  target_region text NOT NULL DEFAULT 'br' CHECK (target_region IN ('br','remoto_global')),
  onboarding_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_delete_own" ON public.profiles
  FOR DELETE TO authenticated USING (auth.uid() = id);
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.rumvia_set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NULLIF(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'), ''),
    NULLIF(NEW.raw_user_meta_data->>'avatar_url', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE IF NOT EXISTS public.user_track_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id uuid NOT NULL REFERENCES public.career_tracks(id) ON DELETE CASCADE,
  role_variant_id uuid REFERENCES public.track_role_variants(id) ON DELETE SET NULL,
  seniority_target text CHECK (seniority_target IN ('junior','pleno','senior','staff')),
  region text NOT NULL DEFAULT 'br' CHECK (region IN ('br','remoto_global')),
  currency text NOT NULL DEFAULT 'BRL' CHECK (currency IN ('BRL','USD')),
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_utp_user ON public.user_track_preferences(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_utp_primary
  ON public.user_track_preferences(user_id) WHERE is_primary;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_track_preferences TO authenticated;
GRANT ALL ON public.user_track_preferences TO service_role;
ALTER TABLE public.user_track_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "utp_select_own" ON public.user_track_preferences
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "utp_insert_own" ON public.user_track_preferences
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "utp_update_own" ON public.user_track_preferences
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "utp_delete_own" ON public.user_track_preferences
  FOR DELETE TO authenticated USING (auth.uid() = user_id);