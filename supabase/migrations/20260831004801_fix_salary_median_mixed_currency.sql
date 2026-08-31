-- market_scope_stats misturava BRL (segmento br) e USD (segmento remoto_global) na
-- mesma percentile_cont sempre que o degrau de ampliação "ambos_segmentos" era usado
-- (ver stepConfig em src/lib/gap.functions.ts). O resultado era formatado com a moeda
-- fixa do segmento escolhido pelo usuário (data.currency), produzindo uma "mediana
-- salarial" sem sentido — regra 5 do CLAUDE.md proíbe somar os dois segmentos no
-- mesmo número sem conversão explícita.
--
-- Fix: novo parâmetro opcional _salary_segment restringe a mediana ao segmento real
-- do usuário, independente do array _segments usado para contar vagas/empresas
-- (esse sim deve continuar ampliado, é só sinal de confiança da amostra).

drop function if exists public.market_scope_stats(uuid, text[], text[], timestamp with time zone, boolean);

create or replace function public.market_scope_stats(
  _track_id uuid, _seniorities text[], _segments text[],
  _since timestamp with time zone, _include_unranked boolean default false,
  _salary_segment text default null)
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
       from scope
       where coalesce(salary_min, salary_max) is not null
         and (_salary_segment is null or market_segment = _salary_segment));
$function$;

revoke all on function public.market_scope_stats(uuid, text[], text[], timestamp with time zone, boolean, text) from public, anon;
grant execute on function public.market_scope_stats(uuid, text[], text[], timestamp with time zone, boolean, text) to authenticated, service_role;
