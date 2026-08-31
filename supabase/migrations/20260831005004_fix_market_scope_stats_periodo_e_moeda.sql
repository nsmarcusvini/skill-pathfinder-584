-- Dois defeitos descobertos ao testar fix_salary_median_mixed_currency (que só
-- resolveu a mistura ENTRE segmentos br/remoto_global, não os dois problemas
-- abaixo, presentes mesmo dentro de um único segmento):
--
-- (a) Período. O pipeline de ingestão SEMPRE anualiza salário antes de gravar
--     (ver toAnnual()/PERIOD_FACTOR em normalize.ts — o comentário lá é
--     explícito: "Fatores para anualizar"). Ou seja, job_postings.salary_period
--     só tem 'year' ou null hoje — nunca 'month'. market_scope_stats pegava
--     (salary_min+salary_max)/2 direto, sem dividir por 12, e o dashboard
--     rotulava o resultado como "Mediana salarial da trilha" (lido como
--     mensal). Um cargo de R$120.000/ano aparecia como R$120.000 — a mesma
--     classe de bug já corrigida ontem em mv_salary_stats (ver
--     20260828120000_salarios_manuais.sql), só que nesta RPC, que o dashboard
--     usa, ninguém tinha corrigido ainda.
--
-- (b) Moeda x segmento. Existe vaga com market_segment='br' e
--     salary_currency='USD' (mesma inconsistência de origem que motivou a
--     curadoria manual de salário). A função não filtrava por moeda — a
--     mediana de "Brasil" podia incluir um valor em dólar sem conversão,
--     violando a regra 5 do CLAUDE.md. Fix: quando _salary_segment vem
--     preenchido, exige a moeda esperada do segmento (br→BRL,
--     remoto_global→USD); moeda nula ou divergente fica de fora — 128 vagas
--     remoto_global têm salary_currency null (fonte não informou; não é
--     seguro presumir USD, regra "nunca invente dado").

drop function if exists public.market_scope_stats(uuid, text[], text[], timestamp with time zone, boolean, text);

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
  ),
  moeda_esperada as (
    select case _salary_segment when 'br' then 'BRL' when 'remoto_global' then 'USD' else null end as c
  )
  select
    (select count(*)::bigint from scope),
    (select count(distinct coalesce(company_id::text, company_name_raw))::bigint from scope
       where coalesce(posted_at, ingested_at) >= now() - interval '30 days'),
    (select percentile_cont(0.5) within group (
       order by (
         case scope.salary_period
           when 'year' then (coalesce(salary_min, salary_max) + coalesce(salary_max, salary_min)) / 2.0 / 12
           when 'hour' then (coalesce(salary_min, salary_max) + coalesce(salary_max, salary_min)) / 2.0 * 160
           else (coalesce(salary_min, salary_max) + coalesce(salary_max, salary_min)) / 2.0
         end
       ))
       from scope, moeda_esperada
       where coalesce(salary_min, salary_max) is not null
         and (_salary_segment is null or market_segment = _salary_segment)
         and (moeda_esperada.c is null or scope.salary_currency = moeda_esperada.c));
$function$;

revoke all on function public.market_scope_stats(uuid, text[], text[], timestamp with time zone, boolean, text) from public, anon;
grant execute on function public.market_scope_stats(uuid, text[], text[], timestamp with time zone, boolean, text) to authenticated, service_role;
