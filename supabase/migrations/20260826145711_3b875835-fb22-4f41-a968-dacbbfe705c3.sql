-- RUMVIA :: 0003 mercado (fontes, vagas, skills de vagas, salários, views)

-- ============================================================ app_settings
CREATE TABLE IF NOT EXISTS public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_settings_read_authenticated" ON public.app_settings
  FOR SELECT TO authenticated USING (true);
CREATE TRIGGER app_settings_updated_at BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.rumvia_set_updated_at();

INSERT INTO public.app_settings (key, value) VALUES
  ('usd_brl', jsonb_build_object('rate', 5.40, 'date', to_char(now(), 'YYYY-MM-DD'), 'source', 'manual')),
  ('analysis_window_days', jsonb_build_object('days', 90))
ON CONFLICT (key) DO NOTHING;

-- ============================================================= job_sources
CREATE TABLE IF NOT EXISTS public.job_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  adapter text NOT NULL CHECK (adapter IN (
    'greenhouse','lever','ashby','workable','smartrecruiters','recruitee',
    'remotive','remoteok','himalayas','jobicy','arbeitnow',
    'adzuna','jsearch','manual')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  last_run_status text CHECK (last_run_status IN ('success','partial','error','running')),
  last_run_count integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.job_sources TO authenticated;
GRANT ALL ON public.job_sources TO service_role;
ALTER TABLE public.job_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "job_sources_read_authenticated" ON public.job_sources
  FOR SELECT TO authenticated USING (true);
CREATE TRIGGER job_sources_updated_at BEFORE UPDATE ON public.job_sources
  FOR EACH ROW EXECUTE FUNCTION public.rumvia_set_updated_at();

-- =============================================================== companies
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  website text,
  logo_url text,
  linkedin_url text,
  size_range text,
  industry text,
  hq_country text,
  is_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_companies_name_trgm
  ON public.companies USING gin (name gin_trgm_ops);
GRANT SELECT ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "companies_read_authenticated" ON public.companies
  FOR SELECT TO authenticated USING (true);

-- ============================================================ job_postings
CREATE TABLE IF NOT EXISTS public.job_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.job_sources(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  company_name_raw text,
  title text NOT NULL,
  title_normalized text,
  track_id uuid REFERENCES public.career_tracks(id) ON DELETE SET NULL,
  role_variant_id uuid REFERENCES public.track_role_variants(id) ON DELETE SET NULL,
  seniority text CHECK (seniority IN ('junior','pleno','senior','staff')),
  location_raw text,
  country text,
  state text,
  city text,
  is_remote boolean NOT NULL DEFAULT false,
  remote_restriction text CHECK (remote_restriction IN ('brazil_only','latam','global')),
  market_segment text NOT NULL CHECK (market_segment IN ('br','remoto_global','outro')),
  description_lang text CHECK (description_lang IN ('pt','en','es','other')),
  employment_type text,
  description_text text,
  description_tsv tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(description_text,''))
  ) STORED,
  salary_min numeric(12,2),
  salary_max numeric(12,2),
  salary_currency text CHECK (salary_currency IN ('BRL','USD','EUR')),
  salary_period text CHECK (salary_period IN ('hour','month','year')),
  salary_is_estimated boolean NOT NULL DEFAULT false,
  apply_url text,
  posted_at timestamptz,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  dedupe_hash text,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (source_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_jp_posted_at ON public.job_postings (posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_jp_track_sen_seg_active
  ON public.job_postings (track_id, seniority, market_segment, is_active);
CREATE INDEX IF NOT EXISTS idx_jp_tsv ON public.job_postings USING gin (description_tsv);
CREATE INDEX IF NOT EXISTS idx_jp_dedupe ON public.job_postings (dedupe_hash);
CREATE INDEX IF NOT EXISTS idx_jp_company ON public.job_postings (company_id);
GRANT SELECT ON public.job_postings TO authenticated;
GRANT ALL ON public.job_postings TO service_role;
ALTER TABLE public.job_postings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "job_postings_read_authenticated" ON public.job_postings
  FOR SELECT TO authenticated USING (true);

-- ========================================================= job_posting_raw
CREATE TABLE IF NOT EXISTS public.job_posting_raw (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_posting_id uuid NOT NULL REFERENCES public.job_postings(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jpr_posting ON public.job_posting_raw (job_posting_id);
GRANT ALL ON public.job_posting_raw TO service_role;
ALTER TABLE public.job_posting_raw ENABLE ROW LEVEL SECURITY;

-- ====================================================== job_posting_skills
CREATE TABLE IF NOT EXISTS public.job_posting_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_posting_id uuid NOT NULL REFERENCES public.job_postings(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  mention_count integer NOT NULL DEFAULT 1,
  is_required boolean NOT NULL DEFAULT false,
  confidence numeric(4,3) NOT NULL DEFAULT 1.000 CHECK (confidence >= 0 AND confidence <= 1),
  matched_alias text,
  extraction_method text NOT NULL CHECK (extraction_method IN ('exact','alias','regex','trigram')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_posting_id, skill_id)
);
CREATE INDEX IF NOT EXISTS idx_jps_skill ON public.job_posting_skills (skill_id);
GRANT SELECT ON public.job_posting_skills TO authenticated;
GRANT ALL ON public.job_posting_skills TO service_role;
ALTER TABLE public.job_posting_skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "job_posting_skills_read_authenticated" ON public.job_posting_skills
  FOR SELECT TO authenticated USING (true);

-- ====================================================== salary_observations
CREATE TABLE IF NOT EXISTS public.salary_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_posting_id uuid REFERENCES public.job_postings(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id uuid REFERENCES public.career_tracks(id) ON DELETE SET NULL,
  seniority text CHECK (seniority IN ('junior','pleno','senior','staff')),
  market_segment text NOT NULL CHECK (market_segment IN ('br','remoto_global','outro')),
  country text,
  currency text NOT NULL CHECK (currency IN ('BRL','USD','EUR')),
  amount_min numeric(12,2),
  amount_max numeric(12,2),
  period text NOT NULL DEFAULT 'month' CHECK (period IN ('hour','month','year')),
  source text NOT NULL CHECK (source IN ('posting','user')),
  observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_so_track_seg
  ON public.salary_observations (track_id, seniority, market_segment, currency);
CREATE INDEX IF NOT EXISTS idx_so_user ON public.salary_observations (user_id);
GRANT SELECT ON public.salary_observations TO authenticated;
GRANT ALL ON public.salary_observations TO service_role;
ALTER TABLE public.salary_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "salary_observations_read_market" ON public.salary_observations
  FOR SELECT TO authenticated USING (source = 'posting' OR user_id = auth.uid());

-- ========================================================== ingestion_runs
CREATE TABLE IF NOT EXISTS public.ingestion_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.job_sources(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','partial','error')),
  jobs_found integer NOT NULL DEFAULT 0,
  jobs_new integer NOT NULL DEFAULT 0,
  jobs_updated integer NOT NULL DEFAULT 0,
  error text
);
CREATE INDEX IF NOT EXISTS idx_ir_source ON public.ingestion_runs (source_id, started_at DESC);
GRANT SELECT ON public.ingestion_runs TO authenticated;
GRANT ALL ON public.ingestion_runs TO service_role;
ALTER TABLE public.ingestion_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ingestion_runs_read_authenticated" ON public.ingestion_runs
  FOR SELECT TO authenticated USING (true);

-- ==================================================== materialized views
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_skill_demand_by_track AS
WITH base AS (
  SELECT p.id, p.track_id, COALESCE(p.seniority, 'nao_informado') AS seniority, p.market_segment
  FROM public.job_postings p
  WHERE p.is_active
    AND p.track_id IS NOT NULL
    AND p.market_segment IN ('br','remoto_global')
    AND COALESCE(p.posted_at, p.ingested_at) >= now() - interval '90 days'
), totals AS (
  SELECT track_id, seniority, market_segment, count(*)::bigint AS total_postings
  FROM base GROUP BY 1,2,3
), counted AS (
  SELECT b.track_id, b.seniority, b.market_segment, s.skill_id,
         count(DISTINCT b.id)::bigint AS postings_count
  FROM base b
  JOIN public.job_posting_skills s ON s.job_posting_id = b.id
  GROUP BY 1,2,3,4
)
SELECT c.track_id, c.seniority, c.market_segment, c.skill_id,
       c.postings_count, t.total_postings,
       round(c.postings_count::numeric / NULLIF(t.total_postings,0), 4) AS demand_ratio,
       row_number() OVER (PARTITION BY c.track_id, c.seniority, c.market_segment
                          ORDER BY c.postings_count DESC, c.skill_id)::integer AS rank
FROM counted c
JOIN totals t USING (track_id, seniority, market_segment);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_skill_demand
  ON public.mv_skill_demand_by_track (track_id, seniority, market_segment, skill_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_tool_demand AS
WITH base AS (
  SELECT p.id, p.track_id, p.market_segment, COALESCE(p.posted_at, p.ingested_at) AS ref_at
  FROM public.job_postings p
  WHERE p.is_active AND p.track_id IS NOT NULL
    AND p.market_segment IN ('br','remoto_global')
    AND COALESCE(p.posted_at, p.ingested_at) >= now() - interval '90 days'
), totals AS (
  SELECT track_id, market_segment, count(*)::bigint AS total_postings FROM base GROUP BY 1,2
), tool_skills AS (
  SELECT sk.id AS skill_id FROM public.skills sk
  JOIN public.skill_categories c ON c.id = sk.category_id
  WHERE c.key IN ('tool','cloud')
), counted AS (
  SELECT b.track_id, b.market_segment, jps.skill_id,
         count(DISTINCT b.id)::bigint AS postings_count,
         count(DISTINCT b.id) FILTER (WHERE b.ref_at >= now() - interval '30 days')::bigint AS c30,
         count(DISTINCT b.id) FILTER (WHERE b.ref_at < now() - interval '30 days'
                                        AND b.ref_at >= now() - interval '60 days')::bigint AS cprev30
  FROM base b
  JOIN public.job_posting_skills jps ON jps.job_posting_id = b.id
  JOIN tool_skills ts ON ts.skill_id = jps.skill_id
  GROUP BY 1,2,3
)
SELECT c.track_id, c.market_segment, c.skill_id, c.postings_count,
       round(c.postings_count::numeric / NULLIF(t.total_postings,0), 4) AS demand_ratio,
       CASE WHEN c.cprev30 = 0 THEN NULL
            ELSE round((c.c30 - c.cprev30)::numeric / c.cprev30, 4) END AS trend_30d_vs_prev30d
FROM counted c JOIN totals t USING (track_id, market_segment);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_tool_demand
  ON public.mv_tool_demand (track_id, market_segment, skill_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_company_hiring AS
WITH base AS (
  SELECT p.* FROM public.job_postings p
  WHERE p.is_active AND p.track_id IS NOT NULL AND p.company_id IS NOT NULL
    AND p.market_segment IN ('br','remoto_global')
    AND COALESCE(p.posted_at, p.ingested_at) >= now() - interval '90 days'
), agg AS (
  SELECT track_id, market_segment, company_id,
         count(*)::bigint AS postings_count,
         max(COALESCE(posted_at, ingested_at)) AS last_posted_at,
         round(avg(salary_min), 2) AS avg_salary_min,
         round(avg(salary_max), 2) AS avg_salary_max
  FROM base GROUP BY 1,2,3
), skills_rank AS (
  SELECT b.track_id, b.market_segment, b.company_id, jps.skill_id,
         count(*)::bigint AS n,
         row_number() OVER (PARTITION BY b.track_id, b.market_segment, b.company_id
                            ORDER BY count(*) DESC, jps.skill_id) AS rn
  FROM base b JOIN public.job_posting_skills jps ON jps.job_posting_id = b.id
  GROUP BY 1,2,3,4
), top_skills AS (
  SELECT track_id, market_segment, company_id,
         jsonb_agg(jsonb_build_object('skill_id', skill_id, 'count', n) ORDER BY n DESC) AS top_skills
  FROM skills_rank WHERE rn <= 8 GROUP BY 1,2,3
)
SELECT a.track_id, a.market_segment, a.company_id, a.postings_count, a.last_posted_at,
       a.avg_salary_min, a.avg_salary_max, COALESCE(ts.top_skills, '[]'::jsonb) AS top_skills
FROM agg a LEFT JOIN top_skills ts USING (track_id, market_segment, company_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_company_hiring
  ON public.mv_company_hiring (track_id, market_segment, company_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_salary_stats AS
SELECT o.track_id,
       COALESCE(o.seniority, 'nao_informado') AS seniority,
       o.market_segment,
       o.currency,
       round(percentile_cont(0.25) WITHIN GROUP (
         ORDER BY COALESCE((o.amount_min + o.amount_max)/2, o.amount_min, o.amount_max))::numeric, 2) AS p25,
       round(percentile_cont(0.50) WITHIN GROUP (
         ORDER BY COALESCE((o.amount_min + o.amount_max)/2, o.amount_min, o.amount_max))::numeric, 2) AS p50,
       round(percentile_cont(0.75) WITHIN GROUP (
         ORDER BY COALESCE((o.amount_min + o.amount_max)/2, o.amount_min, o.amount_max))::numeric, 2) AS p75,
       count(*)::integer AS sample_size
FROM public.salary_observations o
WHERE o.track_id IS NOT NULL
  AND o.market_segment IN ('br','remoto_global')
  AND COALESCE(o.amount_min, o.amount_max) IS NOT NULL
  AND o.observed_at >= now() - interval '365 days'
GROUP BY 1,2,3,4;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_salary_stats
  ON public.mv_salary_stats (track_id, seniority, market_segment, currency);

REVOKE ALL ON public.mv_skill_demand_by_track, public.mv_tool_demand,
              public.mv_company_hiring, public.mv_salary_stats FROM PUBLIC, anon;
GRANT SELECT ON public.mv_skill_demand_by_track, public.mv_tool_demand,
                public.mv_company_hiring, public.mv_salary_stats TO authenticated;
GRANT ALL ON public.mv_skill_demand_by_track, public.mv_tool_demand,
             public.mv_company_hiring, public.mv_salary_stats TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_market_views()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_skill_demand_by_track;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_tool_demand;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_company_hiring;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_salary_stats;
END; $$;
REVOKE ALL ON FUNCTION public.refresh_market_views() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_market_views() TO service_role;

-- ============================================== seed: fontes camadas A e B
INSERT INTO public.job_sources (key, name, adapter, config, is_active) VALUES
  ('greenhouse_boards','Greenhouse (ATS público)','greenhouse',
   '{"tier":"A","board_tokens":["nubank","stone","loft"],"country":"BR"}'::jsonb, true),
  ('lever_boards','Lever (ATS público)','lever',
   '{"tier":"A","board_tokens":["quintoandar","hotmart"],"country":"BR"}'::jsonb, true),
  ('ashby_boards','Ashby (ATS público)','ashby',
   '{"tier":"A","board_tokens":["cloudwalk"],"country":"BR"}'::jsonb, true),
  ('workable_boards','Workable (ATS público)','workable',
   '{"tier":"A","board_tokens":[],"country":"BR"}'::jsonb, true),
  ('smartrecruiters_boards','SmartRecruiters (ATS público)','smartrecruiters',
   '{"tier":"A","board_tokens":[],"country":"BR"}'::jsonb, true),
  ('recruitee_boards','Recruitee (ATS público)','recruitee',
   '{"tier":"A","board_tokens":[]}'::jsonb, true),
  ('remotive','Remotive','remotive',
   '{"tier":"B","query":"devops OR data engineer OR fullstack","market_segment":"remoto_global"}'::jsonb, true),
  ('remoteok','RemoteOK','remoteok',
   '{"tier":"B","tags":["devops","data","fullstack"],"market_segment":"remoto_global"}'::jsonb, true),
  ('himalayas','Himalayas','himalayas',
   '{"tier":"B","market_segment":"remoto_global"}'::jsonb, true),
  ('jobicy','Jobicy','jobicy',
   '{"tier":"B","market_segment":"remoto_global"}'::jsonb, true),
  ('arbeitnow','Arbeitnow','arbeitnow',
   '{"tier":"B","market_segment":"remoto_global"}'::jsonb, true),
  ('csv_manual','Importação CSV / manual','manual',
   '{"tier":"A","notes":"upload de planilha curada"}'::jsonb, true),
  ('adzuna','Adzuna (pago - desativado)','adzuna',
   '{"tier":"C","paid":true}'::jsonb, false),
  ('jsearch','JSearch / RapidAPI (pago - desativado)','jsearch',
   '{"tier":"C","paid":true}'::jsonb, false)
ON CONFLICT (key) DO NOTHING;