-- RUMVIA 0004: currículos, parsing determinístico e skills do usuário

CREATE TABLE IF NOT EXISTS public.cvs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  file_size integer NOT NULL,
  is_current boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'uploaded',
  parse_error text,
  consent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cvs_status_check CHECK (status IN ('uploaded','parsing','parsed','failed')),
  CONSTRAINT cvs_mime_check CHECK (mime_type IN (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  CONSTRAINT cvs_size_check CHECK (file_size > 0 AND file_size <= 10485760)
);
CREATE INDEX IF NOT EXISTS cvs_user_created_idx ON public.cvs (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS cvs_one_current_per_user
  ON public.cvs (user_id) WHERE is_current;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cvs TO authenticated;
GRANT ALL ON public.cvs TO service_role;
ALTER TABLE public.cvs ENABLE ROW LEVEL SECURITY;

CREATE POLICY cvs_select_own ON public.cvs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY cvs_insert_own ON public.cvs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY cvs_update_own ON public.cvs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY cvs_delete_own ON public.cvs FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.cv_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cv_id uuid NOT NULL REFERENCES public.cvs(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  extracted_text text,
  parsed_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  detected_track_id uuid REFERENCES public.career_tracks(id) ON DELETE SET NULL,
  detected_seniority text,
  detection_confidence numeric(4,3),
  parser_version text NOT NULL DEFAULT 'v1',
  parsed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cv_versions_seniority_check CHECK (
    detected_seniority IS NULL OR detected_seniority IN ('junior','pleno','senior','staff')
  ),
  CONSTRAINT cv_versions_unique UNIQUE (cv_id, version)
);
CREATE INDEX IF NOT EXISTS cv_versions_cv_idx ON public.cv_versions (cv_id, version DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cv_versions TO authenticated;
GRANT ALL ON public.cv_versions TO service_role;
ALTER TABLE public.cv_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY cv_versions_select_own ON public.cv_versions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cvs c WHERE c.id = cv_id AND c.user_id = auth.uid()));
CREATE POLICY cv_versions_insert_own ON public.cv_versions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.cvs c WHERE c.id = cv_id AND c.user_id = auth.uid()));
CREATE POLICY cv_versions_update_own ON public.cv_versions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cvs c WHERE c.id = cv_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.cvs c WHERE c.id = cv_id AND c.user_id = auth.uid()));
CREATE POLICY cv_versions_delete_own ON public.cv_versions FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cvs c WHERE c.id = cv_id AND c.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.cv_extracted_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cv_id uuid NOT NULL REFERENCES public.cvs(id) ON DELETE CASCADE,
  skill_id uuid REFERENCES public.skills(id) ON DELETE CASCADE,
  raw_term text NOT NULL,
  matched_by text NOT NULL,
  confidence numeric(4,3) NOT NULL DEFAULT 1.000,
  evidence_snippet text,
  section text NOT NULL DEFAULT 'outro',
  mention_count integer NOT NULL DEFAULT 1,
  first_year integer,
  last_year integer,
  years_hint numeric(4,1),
  level_hint smallint,
  accepted boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cv_extracted_matched_by_check CHECK (matched_by IN ('exact','alias','regex','trigram','unmatched')),
  CONSTRAINT cv_extracted_section_check CHECK (section IN ('skills','experiencia','formacao','certificacoes','outro')),
  CONSTRAINT cv_extracted_level_check CHECK (level_hint IS NULL OR (level_hint >= 0 AND level_hint <= 5)),
  CONSTRAINT cv_extracted_unique UNIQUE (cv_id, raw_term, skill_id)
);
CREATE INDEX IF NOT EXISTS cv_extracted_cv_idx ON public.cv_extracted_skills (cv_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cv_extracted_skills TO authenticated;
GRANT ALL ON public.cv_extracted_skills TO service_role;
ALTER TABLE public.cv_extracted_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY cv_extracted_select_own ON public.cv_extracted_skills FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cvs c WHERE c.id = cv_id AND c.user_id = auth.uid()));
CREATE POLICY cv_extracted_insert_own ON public.cv_extracted_skills FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.cvs c WHERE c.id = cv_id AND c.user_id = auth.uid()));
CREATE POLICY cv_extracted_update_own ON public.cv_extracted_skills FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cvs c WHERE c.id = cv_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.cvs c WHERE c.id = cv_id AND c.user_id = auth.uid()));
CREATE POLICY cv_extracted_delete_own ON public.cv_extracted_skills FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cvs c WHERE c.id = cv_id AND c.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.user_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  level smallint NOT NULL DEFAULT 0,
  years numeric(4,1),
  source text NOT NULL DEFAULT 'manual',
  evidence text,
  last_used_year integer,
  is_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_skills_level_check CHECK (level >= 0 AND level <= 5),
  CONSTRAINT user_skills_source_check CHECK (source IN ('cv','manual','certification')),
  CONSTRAINT user_skills_unique UNIQUE (user_id, skill_id)
);
CREATE INDEX IF NOT EXISTS user_skills_user_idx ON public.user_skills (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_skills TO authenticated;
GRANT ALL ON public.user_skills TO service_role;
ALTER TABLE public.user_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_skills_select_own ON public.user_skills FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_skills_insert_own ON public.user_skills FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_skills_update_own ON public.user_skills FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_skills_delete_own ON public.user_skills FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS user_skills_set_updated_at ON public.user_skills;
CREATE TRIGGER user_skills_set_updated_at BEFORE UPDATE ON public.user_skills
  FOR EACH ROW EXECUTE FUNCTION public.rumvia_set_updated_at();

-- Fila de curadoria de termos desconhecidos
CREATE TABLE IF NOT EXISTS public.pending_skill_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term text NOT NULL,
  suggested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  context text,
  occurrences integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pending_skill_terms_status_check CHECK (status IN ('pending','approved','rejected'))
);
CREATE INDEX IF NOT EXISTS pending_skill_terms_term_idx ON public.pending_skill_terms (lower(term));

GRANT SELECT, INSERT ON public.pending_skill_terms TO authenticated;
GRANT ALL ON public.pending_skill_terms TO service_role;
ALTER TABLE public.pending_skill_terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY pending_terms_select_own ON public.pending_skill_terms FOR SELECT TO authenticated
  USING (auth.uid() = suggested_by);
CREATE POLICY pending_terms_insert_own ON public.pending_skill_terms FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = suggested_by);

-- Rate limit de parses por IP (somente service_role / server functions)
CREATE TABLE IF NOT EXISTS public.parse_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 1,
  CONSTRAINT parse_rate_limits_unique UNIQUE (ip_hash, window_start)
);
GRANT ALL ON public.parse_rate_limits TO service_role;
ALTER TABLE public.parse_rate_limits ENABLE ROW LEVEL SECURITY;