-- Vagas sem senioridade declarada passam a contar no degrau mais amplo do gap.
--
-- O filtro era `jp.seniority = ANY(_seniorities)`. Como NULL nunca casa com
-- nada, toda vaga cujo título não revelava o nível ficava fora de TODO recorte —
-- 10 das 64 utilizáveis, 16% da base, descartadas silenciosamente de qualquer
-- análise de aderência.
--
-- Elas não são vagas de nível errado: são de nível desconhecido. Excluí-las
-- encolhe uma amostra que já é pequena.
--
-- O parâmetro é explícito (e não um "OR seniority IS NULL" solto) porque só o
-- último degrau da ampliação deve relaxar isso. Nos degraus iniciais, quando
-- ainda há amostra suficiente no recorte exato, misturar nível desconhecido
-- pioraria a precisão sem necessidade. Quando o degrau final é usado, o
-- resultado já vem marcado como low_confidence.

DROP FUNCTION IF EXISTS public.market_demand(uuid, text[], text[], timestamptz);
DROP FUNCTION IF EXISTS public.market_scope_stats(uuid, text[], text[], timestamptz);

CREATE FUNCTION public.market_demand(
  _track_id uuid,
  _seniorities text[],
  _segments text[],
  _since timestamptz,
  _include_unranked boolean DEFAULT false
)
RETURNS TABLE (skill_id uuid, jobs bigint, total_jobs bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH scope AS (
    SELECT jp.id
    FROM public.job_postings jp
    WHERE jp.is_active
      AND jp.track_id = _track_id
      AND (
        _seniorities IS NULL
        OR jp.seniority = ANY(_seniorities)
        OR (_include_unranked AND jp.seniority IS NULL)
      )
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

REVOKE ALL ON FUNCTION public.market_demand(uuid, text[], text[], timestamptz, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.market_demand(uuid, text[], text[], timestamptz, boolean) TO authenticated, service_role;

CREATE FUNCTION public.market_scope_stats(
  _track_id uuid,
  _seniorities text[],
  _segments text[],
  _since timestamptz,
  _include_unranked boolean DEFAULT false
)
RETURNS TABLE (total_jobs bigint, companies_30d bigint, salary_median numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH scope AS (
    SELECT jp.*
    FROM public.job_postings jp
    WHERE jp.is_active
      AND jp.track_id = _track_id
      AND (
        _seniorities IS NULL
        OR jp.seniority = ANY(_seniorities)
        OR (_include_unranked AND jp.seniority IS NULL)
      )
      AND jp.market_segment = ANY(_segments)
      AND COALESCE(jp.posted_at, jp.ingested_at) >= _since
  )
  SELECT
    (SELECT count(*)::bigint FROM scope),
    (SELECT count(DISTINCT COALESCE(company_id::text, company_name_raw))::bigint FROM scope
       WHERE COALESCE(posted_at, ingested_at) >= now() - interval '30 days'),
    (SELECT percentile_cont(0.5) WITHIN GROUP (
       ORDER BY (COALESCE(salary_min, salary_max) + COALESCE(salary_max, salary_min)) / 2.0)
       FROM scope WHERE COALESCE(salary_min, salary_max) IS NOT NULL);
$$;

REVOKE ALL ON FUNCTION public.market_scope_stats(uuid, text[], text[], timestamptz, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.market_scope_stats(uuid, text[], text[], timestamptz, boolean) TO authenticated, service_role;
