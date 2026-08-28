-- Deduplicação entre fontes.
--
-- PROBLEMA: a mesma vaga sindicalizada em LinkedIn, Indeed e Glassdoor entra
-- como três linhas. Isso não é um incômodo cosmético — envenena o número que é
-- o produto. A demanda é `vagas_com_skill / total_vagas`; uma vaga contada três
-- vezes empurra as skills DELA para cima e as das outras para baixo. Com poucas
-- empresas grandes sindicalizando muito, o ranking passa a descrever quem
-- publica em mais lugares, não o que o mercado pede.
--
-- SOLUÇÃO: eleger um registro canônico por vaga real. Os demais continuam na
-- base (o apply_url de cada fonte tem valor) mas apontam para o canônico via
-- canonical_job_id e somem de TODA agregação.
--
-- A regra de "o que conta" fica em UM lugar: a view job_postings_canonical.
-- Toda matview e toda RPC de mercado passa a ler dela. É o mesmo princípio das
-- regras 3 e 4 do CLAUDE.md — divergir aqui faria duas telas discordarem.

-- Sem begin/commit explícito: tanto o supabase CLI quanto o apply_migration já
-- envolvem a migration numa transação, e abrir outra aqui dentro conflita.

-- ─────────────────────────────────────────────────────── a fonte única da regra

-- security_invoker = true é obrigatório: sem isso a view roda com os direitos
-- do dono e viraria um desvio da RLS de job_postings. Com ele, a política da
-- tabela base vale igual, e o comportamento é idêntico ao de hoje.
create or replace view public.job_postings_canonical
with (security_invoker = true) as
  select * from public.job_postings where canonical_job_id is null;

comment on view public.job_postings_canonical is
  'job_postings sem as duplicatas entre fontes. Toda agregação de mercado lê daqui.';

grant select on public.job_postings_canonical to anon, authenticated, service_role;

-- Sustenta o agrupamento da dedupe (company + título + segmento) e o filtro
-- canonical_job_id is null que agora aparece em toda leitura de mercado.
create index if not exists idx_job_postings_dedupe_grupo
  on public.job_postings (company_id, title_normalized, market_segment)
  where is_active and canonical_job_id is null;

create index if not exists idx_job_postings_canonical
  on public.job_postings (canonical_job_id)
  where canonical_job_id is not null;

-- ─────────────────────────────────────────────────────────── a eleição em si

create or replace function public.dedupe_job_postings(
  _window_days integer default 200,
  _proximity_days integer default 30
)
returns table(grupos integer, duplicatas integer, alteradas integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_alteradas integer := 0;
  v_grupos integer := 0;
  v_dup integer := 0;
begin
  -- Só agrupa quando dá para AFIRMAR que é a mesma vaga:
  --
  --   mesma empresa (company_id resolvido, não o nome cru)
  --   + mesmo título normalizado (normalizeTitle já tirou "remoto", "CLT", "(v2)")
  --   + mesmo market_segment (regra 5: br e remoto_global nunca se misturam)
  --   + publicadas a menos de _proximity_days uma da outra
  --   + vindas de FONTES DIFERENTES
  --
  -- A última condição é a que separa sindicalização de vaga repetida. Uma
  -- empresa não abre duas posições idênticas de forma independente no LinkedIn
  -- e no Indeed — ela publica uma e ela se espalha. Já duas linhas da MESMA
  -- fonte com external_id diferente podem ser duas vagas reais para o mesmo
  -- cargo, e fundi-las apagaria demanda que existe. Na dúvida, não funde.
  with escopo as (
    select
      p.id,
      p.company_id,
      p.title_normalized,
      p.market_segment,
      p.source_id,
      coalesce(p.posted_at, p.ingested_at) as ref_at,
      coalesce(length(p.description_text), 0) as desc_len,
      -- Tier da fonte: A = ATS da própria empresa (dado de primeira mão),
      -- B = agregador aberto, C = fonte paga. Quem estiver mais perto da
      -- origem ganha a eleição.
      case coalesce(s.config ->> 'tier', 'Z')
        when 'A' then 1 when 'B' then 2 when 'C' then 3 else 4
      end as tier_rank
    from public.job_postings p
    join public.job_sources s on s.id = p.source_id
    where p.is_active
      and p.company_id is not null
      and coalesce(p.title_normalized, '') <> ''
      and coalesce(p.posted_at, p.ingested_at) >= now() - make_interval(days => _window_days)
  ),
  -- Ilhas por proximidade temporal: a mesma vaga reaberta seis meses depois é
  -- uma vaga NOVA, não uma duplicata. Um intervalo maior que _proximity_days
  -- entre duas publicações consecutivas abre uma ilha nova.
  quebras as (
    select e.*,
      case
        when e.ref_at - lag(e.ref_at) over w > make_interval(days => _proximity_days)
        then 1 else 0
      end as quebra
    from escopo e
    window w as (partition by e.company_id, e.title_normalized, e.market_segment
                 order by e.ref_at)
  ),
  ilhas as (
    select q.*,
      sum(q.quebra) over (
        partition by q.company_id, q.title_normalized, q.market_segment
        order by q.ref_at
        rows unbounded preceding
      ) as ilha
    from quebras q
  ),
  marcadas as (
    select i.*,
      -- count(distinct) não existe em window function no Postgres; min <> max
      -- responde a mesma pergunta ("há mais de uma fonte nesta ilha?").
      -- O ::text é necessário: não existe min(uuid) nem max(uuid).
      (min(i.source_id::text) over g) is distinct from (max(i.source_id::text) over g) as multi_fonte,
      first_value(i.id) over (
        partition by i.company_id, i.title_normalized, i.market_segment, i.ilha
        -- Ordem determinística de propósito: rodar de novo sem dado novo tem de
        -- eleger o mesmo vencedor, senão as estatísticas oscilariam sozinhas.
        order by i.tier_rank, i.desc_len desc, i.ref_at, i.id
      ) as vencedor
    from ilhas i
    window g as (partition by i.company_id, i.title_normalized, i.market_segment, i.ilha)
  ),
  alvo as (
    select m.id,
           case when m.multi_fonte and m.id <> m.vencedor then m.vencedor end as novo
    from marcadas m
  )
  update public.job_postings p
     set canonical_job_id = a.novo
    from alvo a
   where p.id = a.id
     -- Vira NULL sozinho quando o par sai da base: a linha que sobrou fica com
     -- uma fonte só na ilha, deixa de ser duplicata e volta a contar. Sem isso,
     -- desativar o canônico apagaria a vaga das estatísticas por inteiro.
     and p.canonical_job_id is distinct from a.novo;

  get diagnostics v_alteradas = row_count;

  select count(*)::integer into v_dup
    from public.job_postings
   where is_active and canonical_job_id is not null;

  select count(distinct canonical_job_id)::integer into v_grupos
    from public.job_postings
   where is_active and canonical_job_id is not null;

  return query select v_grupos, v_dup, v_alteradas;
end;
$$;

comment on function public.dedupe_job_postings(integer, integer) is
  'Elege o registro canônico de cada vaga sindicalizada entre fontes. Idempotente.';

-- Escrita em dado de mercado é só do service_role (regra 6).
revoke all on function public.dedupe_job_postings(integer, integer)
  from public, anon, authenticated;
grant execute on function public.dedupe_job_postings(integer, integer) to service_role;

-- ────────────────────────────────────────── agregações passam a ler o canônico

drop materialized view if exists public.mv_skill_demand_by_track;
create materialized view public.mv_skill_demand_by_track as
  with base as (
    select p.id, p.track_id,
           coalesce(p.seniority, 'nao_informado') as seniority,
           p.market_segment
    from public.job_postings_canonical p
    where p.is_active
      and p.track_id is not null
      and p.market_segment = any (array['br', 'remoto_global'])
      and coalesce(p.posted_at, p.ingested_at) >= now() - interval '90 days'
  ), totals as (
    select track_id, seniority, market_segment, count(*) as total_postings
    from base group by 1, 2, 3
  ), counted as (
    select b.track_id, b.seniority, b.market_segment, s.skill_id,
           count(distinct b.id) as postings_count
    from base b join public.job_posting_skills s on s.job_posting_id = b.id
    group by 1, 2, 3, 4
  )
  select c.track_id, c.seniority, c.market_segment, c.skill_id,
         c.postings_count, t.total_postings,
         round(c.postings_count::numeric / nullif(t.total_postings, 0)::numeric, 4) as demand_ratio,
         (row_number() over (partition by c.track_id, c.seniority, c.market_segment
                             order by c.postings_count desc, c.skill_id))::integer as rank
  from counted c join totals t using (track_id, seniority, market_segment);

create unique index uq_mv_skill_demand
  on public.mv_skill_demand_by_track (track_id, seniority, market_segment, skill_id);

drop materialized view if exists public.mv_tool_demand;
create materialized view public.mv_tool_demand as
  with base as (
    select p.id, p.track_id, p.market_segment,
           coalesce(p.posted_at, p.ingested_at) as ref_at
    from public.job_postings_canonical p
    where p.is_active
      and p.track_id is not null
      and p.market_segment = any (array['br', 'remoto_global'])
      and coalesce(p.posted_at, p.ingested_at) >= now() - interval '90 days'
  ), totals as (
    select track_id, market_segment, count(*) as total_postings from base group by 1, 2
  ), tool_skills as (
    select sk.id as skill_id
    from public.skills sk join public.skill_categories c on c.id = sk.category_id
    where c.key = any (array['tool', 'cloud'])
  ), counted as (
    select b.track_id, b.market_segment, jps.skill_id,
           count(distinct b.id) as postings_count,
           count(distinct b.id) filter (where b.ref_at >= now() - interval '30 days') as c30,
           count(distinct b.id) filter (where b.ref_at < now() - interval '30 days'
                                          and b.ref_at >= now() - interval '60 days') as cprev30
    from base b
    join public.job_posting_skills jps on jps.job_posting_id = b.id
    join tool_skills ts on ts.skill_id = jps.skill_id
    group by 1, 2, 3
  )
  select c.track_id, c.market_segment, c.skill_id, c.postings_count,
         round(c.postings_count::numeric / nullif(t.total_postings, 0)::numeric, 4) as demand_ratio,
         case when c.cprev30 = 0 then null::numeric
              else round((c.c30 - c.cprev30)::numeric / c.cprev30::numeric, 4) end
           as trend_30d_vs_prev30d
  from counted c join totals t using (track_id, market_segment);

create unique index uq_mv_tool_demand
  on public.mv_tool_demand (track_id, market_segment, skill_id);

drop materialized view if exists public.mv_company_hiring;
create materialized view public.mv_company_hiring as
  with base as (
    select p.id, p.company_id, p.track_id, p.market_segment,
           p.posted_at, p.ingested_at, p.salary_min, p.salary_max
    from public.job_postings_canonical p
    where p.is_active
      and p.track_id is not null
      and p.company_id is not null
      and p.market_segment = any (array['br', 'remoto_global'])
      and coalesce(p.posted_at, p.ingested_at) >= now() - interval '90 days'
  ), agg as (
    select track_id, market_segment, company_id,
           count(*) as postings_count,
           max(coalesce(posted_at, ingested_at)) as last_posted_at,
           round(avg(salary_min), 2) as avg_salary_min,
           round(avg(salary_max), 2) as avg_salary_max
    from base group by 1, 2, 3
  ), skills_rank as (
    select b.track_id, b.market_segment, b.company_id, jps.skill_id,
           count(*) as n,
           row_number() over (partition by b.track_id, b.market_segment, b.company_id
                              order by count(*) desc, jps.skill_id) as rn
    from base b join public.job_posting_skills jps on jps.job_posting_id = b.id
    group by 1, 2, 3, 4
  ), top_skills as (
    select track_id, market_segment, company_id,
           jsonb_agg(jsonb_build_object('skill_id', skill_id, 'count', n) order by n desc) as top_skills
    from skills_rank where rn <= 8 group by 1, 2, 3
  )
  select a.track_id, a.market_segment, a.company_id, a.postings_count,
         a.last_posted_at, a.avg_salary_min, a.avg_salary_max,
         coalesce(ts.top_skills, '[]'::jsonb) as top_skills
  from agg a left join top_skills ts using (track_id, market_segment, company_id);

create unique index uq_mv_company_hiring
  on public.mv_company_hiring (track_id, market_segment, company_id);

-- Salário herda a mesma regra: três cópias da mesma vaga geraram três
-- observações salariais idênticas, o que estreitava os percentis em torno de
-- quem sindicaliza. Observação de usuário (job_posting_id nulo) não é afetada.
drop materialized view if exists public.mv_salary_stats;
create materialized view public.mv_salary_stats as
  select o.track_id,
         coalesce(o.seniority, 'nao_informado') as seniority,
         o.market_segment,
         o.currency,
         round((percentile_cont(0.25) within group (
           order by (coalesce((o.amount_min + o.amount_max) / 2, o.amount_min, o.amount_max))::double precision))::numeric, 2) as p25,
         round((percentile_cont(0.50) within group (
           order by (coalesce((o.amount_min + o.amount_max) / 2, o.amount_min, o.amount_max))::double precision))::numeric, 2) as p50,
         round((percentile_cont(0.75) within group (
           order by (coalesce((o.amount_min + o.amount_max) / 2, o.amount_min, o.amount_max))::double precision))::numeric, 2) as p75,
         count(*)::integer as sample_size
  from public.salary_observations o
  left join public.job_postings p on p.id = o.job_posting_id
  where o.track_id is not null
    and o.market_segment = any (array['br', 'remoto_global'])
    and coalesce(o.amount_min, o.amount_max) is not null
    and o.observed_at >= now() - interval '365 days'
    and o.status = 'aprovada'
    and (o.job_posting_id is null or p.canonical_job_id is null)
  group by 1, 2, 3, 4;

create unique index uq_mv_salary_stats
  on public.mv_salary_stats (track_id, seniority, market_segment, currency);

grant select on public.mv_skill_demand_by_track, public.mv_tool_demand,
                public.mv_company_hiring, public.mv_salary_stats
  to anon, authenticated, service_role;

-- ──────────────────────────────────────────── RPCs passam a ler o canônico

create or replace function public.market_demand(
  _track_id uuid, _seniorities text[], _segments text[],
  _since timestamp with time zone, _include_unranked boolean default false)
returns table(skill_id uuid, jobs bigint, total_jobs bigint)
language sql stable set search_path to 'public'
as $function$
  with scope as (
    select jp.id
    from public.job_postings_canonical jp
    where jp.is_active
      and jp.track_id = _track_id
      and (_seniorities is null or jp.seniority = any(_seniorities)
           or (_include_unranked and jp.seniority is null))
      and jp.market_segment = any(_segments)
      and coalesce(jp.posted_at, jp.ingested_at) >= _since
  ), t as (select count(*)::bigint as n from scope)
  select jps.skill_id, count(distinct jps.job_posting_id)::bigint, (select n from t)
  from public.job_posting_skills jps
  join scope s on s.id = jps.job_posting_id
  group by jps.skill_id;
$function$;

create or replace function public.market_scope_stats(
  _track_id uuid, _seniorities text[], _segments text[],
  _since timestamp with time zone, _include_unranked boolean default false)
returns table(total_jobs bigint, companies_30d bigint, salary_median numeric)
language sql stable set search_path to 'public'
as $function$
  with scope as (
    select jp.*
    from public.job_postings_canonical jp
    where jp.is_active
      and jp.track_id = _track_id
      and (_seniorities is null or jp.seniority = any(_seniorities)
           or (_include_unranked and jp.seniority is null))
      and jp.market_segment = any(_segments)
      and coalesce(jp.posted_at, jp.ingested_at) >= _since
  )
  select
    (select count(*)::bigint from scope),
    (select count(distinct coalesce(company_id::text, company_name_raw))::bigint from scope
       where coalesce(posted_at, ingested_at) >= now() - interval '30 days'),
    (select percentile_cont(0.5) within group (
       order by (coalesce(salary_min, salary_max) + coalesce(salary_max, salary_min)) / 2.0)
       from scope where coalesce(salary_min, salary_max) is not null);
$function$;

create or replace function public.tool_ranking(
  _track_id uuid, _segments text[], _since timestamp with time zone,
  _seniorities text[] default null, _categories text[] default null)
returns table(skill_id uuid, name text, slug text, website_url text, is_certifiable boolean,
              category_key text, category_name text, jobs bigint, total_jobs bigint,
              demand numeric, trend numeric)
language sql stable set search_path to 'public'
as $function$
with base as (
  select p.id, coalesce(p.posted_at, p.ingested_at) as ref_at
  from public.job_postings_canonical p
  where p.is_active
    and p.track_id = _track_id
    and p.market_segment = any(_segments)
    and (_seniorities is null or p.seniority = any(_seniorities))
    and coalesce(p.posted_at, p.ingested_at) >= _since
), tot as (select count(*)::bigint as n from base
), counted as (
  select jps.skill_id,
         count(distinct b.id)::bigint as jobs,
         count(distinct b.id) filter (where b.ref_at >= now() - interval '30 days')::bigint as j30,
         count(distinct b.id) filter (where b.ref_at < now() - interval '30 days'
                                        and b.ref_at >= now() - interval '60 days')::bigint as jprev
  from base b join public.job_posting_skills jps on jps.job_posting_id = b.id
  group by 1
)
select s.id, s.canonical_name, s.slug, s.website_url, s.is_certifiable,
       cat.key, cat.name, c.jobs, tot.n,
       round(c.jobs::numeric / nullif(tot.n, 0), 4),
       case when c.jprev = 0 then null
            else round((c.j30 - c.jprev)::numeric / c.jprev, 4) end
from counted c
join public.skills s on s.id = c.skill_id
join public.skill_categories cat on cat.id = s.category_id
cross join tot
where (_categories is null or cat.key = any(_categories))
order by c.jobs desc, s.canonical_name;
$function$;

create or replace function public.tool_detail(
  _track_id uuid, _skill_id uuid, _segments text[],
  _since timestamp with time zone, _seniorities text[] default null)
returns table(jobs bigint, total_jobs bigint, demand numeric, salary_currency text,
              salary_p25 numeric, salary_p50 numeric, salary_p75 numeric,
              salary_sample integer, companies jsonb, cooccurrence jsonb)
language sql stable set search_path to 'public'
as $function$
with base as (
  select p.*
  from public.job_postings_canonical p
  where p.is_active
    and p.track_id = _track_id
    and p.market_segment = any(_segments)
    and (_seniorities is null or p.seniority = any(_seniorities))
    and coalesce(p.posted_at, p.ingested_at) >= _since
), withskill as (
  select b.* from base b
  join public.job_posting_skills jps on jps.job_posting_id = b.id and jps.skill_id = _skill_id
), sal as (
  select w.salary_currency as cur,
         round(percentile_cont(0.25) within group (
           order by coalesce((w.salary_min + w.salary_max) / 2, w.salary_min, w.salary_max))::numeric, 2) as p25,
         round(percentile_cont(0.50) within group (
           order by coalesce((w.salary_min + w.salary_max) / 2, w.salary_min, w.salary_max))::numeric, 2) as p50,
         round(percentile_cont(0.75) within group (
           order by coalesce((w.salary_min + w.salary_max) / 2, w.salary_min, w.salary_max))::numeric, 2) as p75,
         count(*)::integer as n
  from withskill w
  where coalesce(w.salary_min, w.salary_max) is not null
  group by 1 order by count(*) desc limit 1
), comp as (
  select jsonb_agg(x order by (x->>'jobs')::int desc) as j from (
    select jsonb_build_object('company_id', c.id, 'name', c.name, 'logo_url', c.logo_url,
                              'jobs', count(*)::int) as x
    from withskill w join public.companies c on c.id = w.company_id
    group by c.id, c.name, c.logo_url order by count(*) desc limit 8
  ) q
), co as (
  select jsonb_agg(x order by (x->>'jobs')::int desc) as j from (
    select jsonb_build_object('skill_id', s.id, 'name', s.canonical_name,
                              'jobs', count(distinct w.id)::int,
                              'ratio', round(count(distinct w.id)::numeric
                                             / nullif((select count(*) from withskill), 0), 4)) as x
    from withskill w
    join public.job_posting_skills jps on jps.job_posting_id = w.id and jps.skill_id <> _skill_id
    join public.skills s on s.id = jps.skill_id
    group by s.id, s.canonical_name order by count(distinct w.id) desc limit 10
  ) q
)
select (select count(*) from withskill)::bigint,
       (select count(*) from base)::bigint,
       round((select count(*) from withskill)::numeric / nullif((select count(*) from base), 0), 4),
       (select cur from sal), (select p25 from sal), (select p50 from sal),
       (select p75 from sal), coalesce((select n from sal), 0),
       coalesce((select j from comp), '[]'::jsonb),
       coalesce((select j from co), '[]'::jsonb);
$function$;

create or replace function public.tool_monthly(
  _track_id uuid, _skill_ids uuid[], _segments text[],
  _months integer default 6, _seniorities text[] default null)
returns table(month date, skill_id uuid, jobs bigint, total_jobs bigint, demand numeric)
language sql stable set search_path to 'public'
as $function$
with base as (
  select p.id, date_trunc('month', coalesce(p.posted_at, p.ingested_at))::date as m
  from public.job_postings_canonical p
  where p.track_id = _track_id
    and p.market_segment = any(_segments)
    and (_seniorities is null or p.seniority = any(_seniorities))
    and coalesce(p.posted_at, p.ingested_at) >= date_trunc('month', now()) - make_interval(months => _months - 1)
), tot as (select m, count(*)::bigint as n from base group by 1
), counted as (
  select b.m, jps.skill_id, count(distinct b.id)::bigint as jobs
  from base b join public.job_posting_skills jps on jps.job_posting_id = b.id
  where jps.skill_id = any(_skill_ids)
  group by 1, 2
)
select t.m, c.skill_id, coalesce(c.jobs, 0), t.n,
       round(coalesce(c.jobs, 0)::numeric / nullif(t.n, 0), 4)
from tot t left join counted c on c.m = t.m
order by t.m;
$function$;

create or replace function public.company_ranking(
  _track_id uuid, _segments text[], _since timestamp with time zone,
  _seniorities text[] default null)
returns table(company_id uuid, name text, slug text, logo_url text, website text,
              industry text, jobs bigint, last_posted_at timestamp with time zone,
              avg_salary_min numeric, avg_salary_max numeric, currency text,
              remote_jobs bigint, segments text[], top_skills jsonb)
language sql stable set search_path to 'public'
as $function$
with base as (
  select p.*
  from public.job_postings_canonical p
  where p.is_active
    and p.track_id = _track_id
    and p.company_id is not null
    and p.market_segment = any(_segments)
    and (_seniorities is null or p.seniority = any(_seniorities))
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

create or replace function public.company_skill_demand(
  _company_id uuid, _track_id uuid, _segments text[], _since timestamp with time zone)
returns table(skill_id uuid, jobs bigint, total_jobs bigint)
language sql stable set search_path to 'public'
as $function$
with base as (
  select p.id from public.job_postings_canonical p
  where p.company_id = _company_id
    and p.is_active
    and (_track_id is null or p.track_id = _track_id)
    and p.market_segment = any(_segments)
    and coalesce(p.posted_at, p.ingested_at) >= _since
)
select jps.skill_id, count(distinct b.id)::bigint, (select count(*) from base)::bigint
from base b join public.job_posting_skills jps on jps.job_posting_id = b.id
group by jps.skill_id;
$function$;

create or replace function public.company_monthly(
  _company_id uuid, _track_id uuid, _segments text[], _months integer default 12)
returns table(month date, jobs bigint)
language sql stable set search_path to 'public'
as $function$
select date_trunc('month', coalesce(p.posted_at, p.ingested_at))::date as month,
       count(*)::bigint
from public.job_postings_canonical p
where p.company_id = _company_id
  and (_track_id is null or p.track_id = _track_id)
  and p.market_segment = any(_segments)
  and coalesce(p.posted_at, p.ingested_at) >= date_trunc('month', now()) - make_interval(months => _months - 1)
group by 1 order by 1;
$function$;
