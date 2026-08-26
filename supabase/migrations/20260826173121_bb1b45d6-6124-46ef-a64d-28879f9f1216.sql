CREATE TABLE IF NOT EXISTS public.gap_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id uuid REFERENCES public.career_tracks(id),
  role_variant_id uuid REFERENCES public.track_role_variants(id),
  seniority text,
  market_segment text NOT NULL DEFAULT 'br',
  currency text NOT NULL DEFAULT 'BRL',
  overall_score numeric NOT NULL DEFAULT 0,
  category_scores jsonb NOT NULL DEFAULT '[]'::jsonb,
  postings_sample integer NOT NULL DEFAULT 0,
  low_confidence boolean NOT NULL DEFAULT false,
  widening_step text NOT NULL DEFAULT 'base',
  params_hash text NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gap_analyses_user_hash_idx ON public.gap_analyses (user_id, params_hash, computed_at DESC);

CREATE TABLE IF NOT EXISTS public.gap_analysis_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gap_analysis_id uuid NOT NULL REFERENCES public.gap_analyses(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES public.skills(id),
  market_demand numeric NOT NULL DEFAULT 0,
  baseline_importance smallint NOT NULL DEFAULT 0,
  weight numeric NOT NULL DEFAULT 0,
  user_level smallint NOT NULL DEFAULT 0,
  required_level smallint NOT NULL DEFAULT 0,
  coverage numeric NOT NULL DEFAULT 0,
  gap_score numeric NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('dominada','parcial','faltante','extra'))
);

CREATE INDEX IF NOT EXISTS gap_analysis_items_analysis_idx ON public.gap_analysis_items (gap_analysis_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gap_analyses TO authenticated;
GRANT ALL ON public.gap_analyses TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gap_analysis_items TO authenticated;
GRANT ALL ON public.gap_analysis_items TO service_role;

ALTER TABLE public.gap_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gap_analysis_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gap_analyses_owner" ON public.gap_analyses;
CREATE POLICY "gap_analyses_owner" ON public.gap_analyses FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "gap_analysis_items_owner" ON public.gap_analysis_items;
CREATE POLICY "gap_analysis_items_owner" ON public.gap_analysis_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.gap_analyses a WHERE a.id = gap_analysis_id AND a.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.gap_analyses a WHERE a.id = gap_analysis_id AND a.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.market_demand(
  _track_id uuid,
  _seniorities text[],
  _segments text[],
  _since timestamptz
)
RETURNS TABLE (skill_id uuid, jobs bigint, total_jobs bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH scope AS (
    SELECT jp.id
    FROM public.job_postings jp
    WHERE jp.is_active
      AND jp.track_id = _track_id
      AND (_seniorities IS NULL OR jp.seniority = ANY(_seniorities))
      AND jp.market_segment = ANY(_segments)
      AND COALESCE(jp.posted_at, jp.ingested_at) >= _since
  ), t AS (SELECT count(*)::bigint AS n FROM scope)
  SELECT jps.skill_id,
         count(DISTINCT jps.job_posting_id)::bigint,
         (SELECT n FROM t)
  FROM public.job_posting_skills jps
  JOIN scope s ON s.id = jps.job_posting_id
  GROUP BY jps.skill_id;
$$;

REVOKE ALL ON FUNCTION public.market_demand(uuid, text[], text[], timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.market_demand(uuid, text[], text[], timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.market_scope_stats(
  _track_id uuid,
  _seniorities text[],
  _segments text[],
  _since timestamptz
)
RETURNS TABLE (total_jobs bigint, companies_30d bigint, salary_median numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH scope AS (
    SELECT jp.*
    FROM public.job_postings jp
    WHERE jp.is_active
      AND jp.track_id = _track_id
      AND (_seniorities IS NULL OR jp.seniority = ANY(_seniorities))
      AND jp.market_segment = ANY(_segments)
      AND COALESCE(jp.posted_at, jp.ingested_at) >= _since
  )
  SELECT
    (SELECT count(*)::bigint FROM scope),
    (SELECT count(DISTINCT COALESCE(company_id::text, company_name_raw)) ::bigint FROM scope
       WHERE COALESCE(posted_at, ingested_at) >= now() - interval '30 days'),
    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY (COALESCE(salary_min, salary_max) + COALESCE(salary_max, salary_min)) / 2.0)
       FROM scope WHERE COALESCE(salary_min, salary_max) IS NOT NULL);
$$;

REVOKE ALL ON FUNCTION public.market_scope_stats(uuid, text[], text[], timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.market_scope_stats(uuid, text[], text[], timestamptz) TO authenticated, service_role;