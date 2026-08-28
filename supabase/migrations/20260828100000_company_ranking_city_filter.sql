-- Adiciona filtro opcional de localidade (cidade) a company_ranking e
-- company_skill_demand, para dar suporte ao filtro de localidade em /empresas
-- (mesmo padrão de job_locations/listJobLocations já usado em /vagas).
--
-- CREATE OR REPLACE FUNCTION não permite adicionar parâmetro: muda a
-- assinatura e criaria uma sobrecarga ambígua para o PostgREST. Por isso
-- DROP explícito das assinaturas antigas antes de recriar.

DROP FUNCTION IF EXISTS public.company_ranking(uuid, text[], timestamptz, text[]);
DROP FUNCTION IF EXISTS public.company_skill_demand(uuid, uuid, text[], timestamptz);

CREATE FUNCTION public.company_ranking(
  _track_id uuid,
  _segments text[],
  _since timestamptz,
  _seniorities text[] DEFAULT NULL::text[],
  _cities text[] DEFAULT NULL::text[]
)
RETURNS TABLE(
  company_id uuid, name text, slug text, logo_url text, website text, industry text,
  jobs bigint, last_posted_at timestamptz, avg_salary_min numeric, avg_salary_max numeric,
  currency text, remote_jobs bigint, segments text[], top_skills jsonb
)
LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
with base as (
  select p.*
  from public.job_postings_canonical p
  where p.is_active
    and p.track_id = _track_id
    and p.company_id is not null
    and p.market_segment = any(_segments)
    and (_seniorities is null or p.seniority = any(_seniorities))
    and (_cities is null or p.city = any(_cities))
    and coalesce(p.posted_at, p.ingested_at) >= _since
), agg as (
  select b.company_id,
         count(*)::bigint as jobs,
         max(coalesce(b.posted_at, b.ingested_at)) as last_posted_at,
         round(avg(b.salary_min), 2) as avg_min,
         round(avg(b.salary_max), 2) as avg_max,
         (array_agg(b.salary_currency) filter (where b.salary_currency is not null))[1] as cur,
         count(*) filter (where b.is_remote)::bigint as remote_jobs,
         array_agg(distinct b.market_segment) as segments
  from base b group by 1
), sk as (
  select company_id, jsonb_agg(x order by (x->>'jobs')::int desc) as j from (
    select b.company_id,
           jsonb_build_object('skill_id', s.id, 'name', s.canonical_name,
                              'jobs', count(distinct b.id)::int) as x,
           row_number() over (partition by b.company_id
                              order by count(distinct b.id) desc, s.canonical_name) as rn
    from base b
    join public.job_posting_skills jps on jps.job_posting_id = b.id
    join public.skills s on s.id = jps.skill_id
    group by b.company_id, s.id, s.canonical_name
  ) q where rn <= 5 group by company_id
)
select c.id, c.name, c.slug, c.logo_url, c.website, c.industry,
       a.jobs, a.last_posted_at, a.avg_min, a.avg_max, a.cur,
       a.remote_jobs, a.segments, coalesce(sk.j, '[]'::jsonb)
from agg a
join public.companies c on c.id = a.company_id
left join sk on sk.company_id = a.company_id
order by a.jobs desc, a.last_posted_at desc;
$function$;

CREATE FUNCTION public.company_skill_demand(
  _company_id uuid,
  _track_id uuid,
  _segments text[],
  _since timestamptz,
  _cities text[] DEFAULT NULL::text[]
)
RETURNS TABLE(skill_id uuid, jobs bigint, total_jobs bigint)
LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
with base as (
  select p.id from public.job_postings_canonical p
  where p.company_id = _company_id
    and p.is_active
    and (_track_id is null or p.track_id = _track_id)
    and p.market_segment = any(_segments)
    and (_cities is null or p.city = any(_cities))
    and coalesce(p.posted_at, p.ingested_at) >= _since
)
select jps.skill_id, count(distinct b.id)::bigint, (select count(*) from base)::bigint
from base b join public.job_posting_skills jps on jps.job_posting_id = b.id
group by jps.skill_id;
$function$;

-- O schema public do Supabase concede EXECUTE a `anon` por padrão em função
-- nova (ALTER DEFAULT PRIVILEGES do projeto). As duas funções originais NUNCA
-- foram acessíveis por anônimo — só authenticated/service_role — então o DROP
-- + CREATE não pode herdar esse grant.
REVOKE ALL ON FUNCTION public.company_ranking(uuid, text[], timestamptz, text[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_ranking(uuid, text[], timestamptz, text[], text[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.company_skill_demand(uuid, uuid, text[], timestamptz, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_skill_demand(uuid, uuid, text[], timestamptz, text[]) TO authenticated, service_role;
