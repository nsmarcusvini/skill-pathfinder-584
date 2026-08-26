-- ============================== empresas seguidas
CREATE TABLE IF NOT EXISTS public.user_followed_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id)
);
GRANT SELECT, INSERT, DELETE ON public.user_followed_companies TO authenticated;
GRANT ALL ON public.user_followed_companies TO service_role;
ALTER TABLE public.user_followed_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ufc_select_own" ON public.user_followed_companies
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "ufc_insert_own" ON public.user_followed_companies
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "ufc_delete_own" ON public.user_followed_companies
  FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_ufc_user ON public.user_followed_companies (user_id);

-- ============================== ranking de ferramentas
CREATE OR REPLACE FUNCTION public.tool_ranking(
  _track_id uuid,
  _segments text[],
  _since timestamptz,
  _seniorities text[] DEFAULT NULL,
  _categories text[] DEFAULT NULL
)
RETURNS TABLE (
  skill_id uuid, name text, slug text, website_url text, is_certifiable boolean,
  category_key text, category_name text,
  jobs bigint, total_jobs bigint, demand numeric, trend numeric
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH base AS (
  SELECT p.id, COALESCE(p.posted_at, p.ingested_at) AS ref_at
  FROM public.job_postings p
  WHERE p.is_active
    AND p.track_id = _track_id
    AND p.market_segment = ANY(_segments)
    AND (_seniorities IS NULL OR p.seniority = ANY(_seniorities))
    AND COALESCE(p.posted_at, p.ingested_at) >= _since
), tot AS (
  SELECT count(*)::bigint AS n FROM base
), counted AS (
  SELECT jps.skill_id,
         count(DISTINCT b.id)::bigint AS jobs,
         count(DISTINCT b.id) FILTER (WHERE b.ref_at >= now() - interval '30 days')::bigint AS j30,
         count(DISTINCT b.id) FILTER (WHERE b.ref_at < now() - interval '30 days'
                                        AND b.ref_at >= now() - interval '60 days')::bigint AS jprev
  FROM base b
  JOIN public.job_posting_skills jps ON jps.job_posting_id = b.id
  GROUP BY 1
)
SELECT s.id, s.canonical_name, s.slug, s.website_url, s.is_certifiable,
       cat.key, cat.name,
       c.jobs, tot.n,
       round(c.jobs::numeric / NULLIF(tot.n, 0), 4),
       CASE WHEN c.jprev = 0 THEN NULL
            ELSE round((c.j30 - c.jprev)::numeric / c.jprev, 4) END
FROM counted c
JOIN public.skills s ON s.id = c.skill_id
JOIN public.skill_categories cat ON cat.id = s.category_id
CROSS JOIN tot
WHERE (_categories IS NULL OR cat.key = ANY(_categories))
ORDER BY c.jobs DESC, s.canonical_name;
$$;
REVOKE ALL ON FUNCTION public.tool_ranking(uuid, text[], timestamptz, text[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tool_ranking(uuid, text[], timestamptz, text[], text[]) TO authenticated, service_role;

-- ============================== evolução mensal
CREATE OR REPLACE FUNCTION public.tool_monthly(
  _track_id uuid,
  _skill_ids uuid[],
  _segments text[],
  _months integer DEFAULT 6,
  _seniorities text[] DEFAULT NULL
)
RETURNS TABLE (month date, skill_id uuid, jobs bigint, total_jobs bigint, demand numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH base AS (
  SELECT p.id, date_trunc('month', COALESCE(p.posted_at, p.ingested_at))::date AS m
  FROM public.job_postings p
  WHERE p.track_id = _track_id
    AND p.market_segment = ANY(_segments)
    AND (_seniorities IS NULL OR p.seniority = ANY(_seniorities))
    AND COALESCE(p.posted_at, p.ingested_at) >= date_trunc('month', now()) - make_interval(months => _months - 1)
), tot AS (
  SELECT m, count(*)::bigint AS n FROM base GROUP BY 1
), counted AS (
  SELECT b.m, jps.skill_id, count(DISTINCT b.id)::bigint AS jobs
  FROM base b
  JOIN public.job_posting_skills jps ON jps.job_posting_id = b.id
  WHERE jps.skill_id = ANY(_skill_ids)
  GROUP BY 1, 2
)
SELECT t.m, c.skill_id, COALESCE(c.jobs, 0), t.n,
       round(COALESCE(c.jobs, 0)::numeric / NULLIF(t.n, 0), 4)
FROM tot t
LEFT JOIN counted c ON c.m = t.m
ORDER BY t.m;
$$;
REVOKE ALL ON FUNCTION public.tool_monthly(uuid, uuid[], text[], integer, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tool_monthly(uuid, uuid[], text[], integer, text[]) TO authenticated, service_role;

-- ============================== detalhe de uma ferramenta
CREATE OR REPLACE FUNCTION public.tool_detail(
  _track_id uuid,
  _skill_id uuid,
  _segments text[],
  _since timestamptz,
  _seniorities text[] DEFAULT NULL
)
RETURNS TABLE (
  jobs bigint, total_jobs bigint, demand numeric,
  salary_currency text, salary_p25 numeric, salary_p50 numeric, salary_p75 numeric, salary_sample integer,
  companies jsonb, cooccurrence jsonb
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH base AS (
  SELECT p.*
  FROM public.job_postings p
  WHERE p.is_active
    AND p.track_id = _track_id
    AND p.market_segment = ANY(_segments)
    AND (_seniorities IS NULL OR p.seniority = ANY(_seniorities))
    AND COALESCE(p.posted_at, p.ingested_at) >= _since
), withskill AS (
  SELECT b.* FROM base b
  JOIN public.job_posting_skills jps ON jps.job_posting_id = b.id AND jps.skill_id = _skill_id
), sal AS (
  SELECT w.salary_currency AS cur,
         round(percentile_cont(0.25) WITHIN GROUP (
           ORDER BY COALESCE((w.salary_min + w.salary_max) / 2, w.salary_min, w.salary_max))::numeric, 2) AS p25,
         round(percentile_cont(0.50) WITHIN GROUP (
           ORDER BY COALESCE((w.salary_min + w.salary_max) / 2, w.salary_min, w.salary_max))::numeric, 2) AS p50,
         round(percentile_cont(0.75) WITHIN GROUP (
           ORDER BY COALESCE((w.salary_min + w.salary_max) / 2, w.salary_min, w.salary_max))::numeric, 2) AS p75,
         count(*)::integer AS n
  FROM withskill w
  WHERE COALESCE(w.salary_min, w.salary_max) IS NOT NULL
  GROUP BY 1
  ORDER BY count(*) DESC
  LIMIT 1
), comp AS (
  SELECT jsonb_agg(x ORDER BY (x->>'jobs')::int DESC) AS j FROM (
    SELECT jsonb_build_object('company_id', c.id, 'name', c.name, 'logo_url', c.logo_url,
                              'jobs', count(*)::int) AS x
    FROM withskill w
    JOIN public.companies c ON c.id = w.company_id
    GROUP BY c.id, c.name, c.logo_url
    ORDER BY count(*) DESC
    LIMIT 8
  ) q
), co AS (
  SELECT jsonb_agg(x ORDER BY (x->>'jobs')::int DESC) AS j FROM (
    SELECT jsonb_build_object('skill_id', s.id, 'name', s.canonical_name,
                              'jobs', count(DISTINCT w.id)::int,
                              'ratio', round(count(DISTINCT w.id)::numeric
                                             / NULLIF((SELECT count(*) FROM withskill), 0), 4)) AS x
    FROM withskill w
    JOIN public.job_posting_skills jps ON jps.job_posting_id = w.id AND jps.skill_id <> _skill_id
    JOIN public.skills s ON s.id = jps.skill_id
    GROUP BY s.id, s.canonical_name
    ORDER BY count(DISTINCT w.id) DESC
    LIMIT 10
  ) q
)
SELECT (SELECT count(*) FROM withskill)::bigint,
       (SELECT count(*) FROM base)::bigint,
       round((SELECT count(*) FROM withskill)::numeric / NULLIF((SELECT count(*) FROM base), 0), 4),
       (SELECT cur FROM sal), (SELECT p25 FROM sal), (SELECT p50 FROM sal),
       (SELECT p75 FROM sal), COALESCE((SELECT n FROM sal), 0),
       COALESCE((SELECT j FROM comp), '[]'::jsonb),
       COALESCE((SELECT j FROM co), '[]'::jsonb);
$$;
REVOKE ALL ON FUNCTION public.tool_detail(uuid, uuid, text[], timestamptz, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tool_detail(uuid, uuid, text[], timestamptz, text[]) TO authenticated, service_role;

-- ============================== ranking de empresas
CREATE OR REPLACE FUNCTION public.company_ranking(
  _track_id uuid,
  _segments text[],
  _since timestamptz,
  _seniorities text[] DEFAULT NULL
)
RETURNS TABLE (
  company_id uuid, name text, slug text, logo_url text, website text, industry text,
  jobs bigint, last_posted_at timestamptz,
  avg_salary_min numeric, avg_salary_max numeric, currency text,
  remote_jobs bigint, segments text[], top_skills jsonb
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH base AS (
  SELECT p.*
  FROM public.job_postings p
  WHERE p.is_active
    AND p.track_id = _track_id
    AND p.company_id IS NOT NULL
    AND p.market_segment = ANY(_segments)
    AND (_seniorities IS NULL OR p.seniority = ANY(_seniorities))
    AND COALESCE(p.posted_at, p.ingested_at) >= _since
), agg AS (
  SELECT b.company_id,
         count(*)::bigint AS jobs,
         max(COALESCE(b.posted_at, b.ingested_at)) AS last_posted_at,
         round(avg(b.salary_min), 2) AS avg_min,
         round(avg(b.salary_max), 2) AS avg_max,
         (array_agg(b.salary_currency) FILTER (WHERE b.salary_currency IS NOT NULL))[1] AS cur,
         count(*) FILTER (WHERE b.is_remote)::bigint AS remote_jobs,
         array_agg(DISTINCT b.market_segment) AS segments
  FROM base b GROUP BY 1
), sk AS (
  SELECT company_id, jsonb_agg(x ORDER BY (x->>'jobs')::int DESC) AS j FROM (
    SELECT b.company_id,
           jsonb_build_object('skill_id', s.id, 'name', s.canonical_name,
                              'jobs', count(DISTINCT b.id)::int) AS x,
           row_number() OVER (PARTITION BY b.company_id ORDER BY count(DISTINCT b.id) DESC, s.canonical_name) AS rn
    FROM base b
    JOIN public.job_posting_skills jps ON jps.job_posting_id = b.id
    JOIN public.skills s ON s.id = jps.skill_id
    GROUP BY b.company_id, s.id, s.canonical_name
  ) q WHERE rn <= 5 GROUP BY company_id
)
SELECT c.id, c.name, c.slug, c.logo_url, c.website, c.industry,
       a.jobs, a.last_posted_at, a.avg_min, a.avg_max, a.cur,
       a.remote_jobs, a.segments, COALESCE(sk.j, '[]'::jsonb)
FROM agg a
JOIN public.companies c ON c.id = a.company_id
LEFT JOIN sk ON sk.company_id = a.company_id
ORDER BY a.jobs DESC, a.last_posted_at DESC;
$$;
REVOKE ALL ON FUNCTION public.company_ranking(uuid, text[], timestamptz, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_ranking(uuid, text[], timestamptz, text[]) TO authenticated, service_role;

-- ============================== histórico mensal de uma empresa
CREATE OR REPLACE FUNCTION public.company_monthly(
  _company_id uuid,
  _track_id uuid,
  _segments text[],
  _months integer DEFAULT 12
)
RETURNS TABLE (month date, jobs bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
SELECT date_trunc('month', COALESCE(p.posted_at, p.ingested_at))::date AS month,
       count(*)::bigint
FROM public.job_postings p
WHERE p.company_id = _company_id
  AND (_track_id IS NULL OR p.track_id = _track_id)
  AND p.market_segment = ANY(_segments)
  AND COALESCE(p.posted_at, p.ingested_at) >= date_trunc('month', now()) - make_interval(months => _months - 1)
GROUP BY 1 ORDER BY 1;
$$;
REVOKE ALL ON FUNCTION public.company_monthly(uuid, uuid, text[], integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_monthly(uuid, uuid, text[], integer) TO authenticated, service_role;

-- ============================== demanda de skills dentro de uma empresa
CREATE OR REPLACE FUNCTION public.company_skill_demand(
  _company_id uuid,
  _track_id uuid,
  _segments text[],
  _since timestamptz
)
RETURNS TABLE (skill_id uuid, jobs bigint, total_jobs bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH base AS (
  SELECT p.id FROM public.job_postings p
  WHERE p.company_id = _company_id
    AND p.is_active
    AND (_track_id IS NULL OR p.track_id = _track_id)
    AND p.market_segment = ANY(_segments)
    AND COALESCE(p.posted_at, p.ingested_at) >= _since
)
SELECT jps.skill_id, count(DISTINCT b.id)::bigint, (SELECT count(*) FROM base)::bigint
FROM base b JOIN public.job_posting_skills jps ON jps.job_posting_id = b.id
GROUP BY jps.skill_id;
$$;
REVOKE ALL ON FUNCTION public.company_skill_demand(uuid, uuid, text[], timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_skill_demand(uuid, uuid, text[], timestamptz) TO authenticated, service_role;