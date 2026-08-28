-- Rede de segurança: nenhuma matview pode ser recalculada sobre dado
-- duplicado. O fluxo pull e a colheita da Bright Data já chamam
-- dedupe_job_postings() no fim de cada ingestão, mas o webhook push e um
-- eventual refresh manual pelo admin não passavam por ali. Deixar a garantia
-- aqui cobre todos os caminhos, inclusive os que ainda não existem.
create or replace function public.refresh_market_views()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.dedupe_job_postings();

  refresh materialized view concurrently public.mv_skill_demand_by_track;
  refresh materialized view concurrently public.mv_tool_demand;
  refresh materialized view concurrently public.mv_company_hiring;
  refresh materialized view concurrently public.mv_salary_stats;
end;
$$;

revoke all on function public.refresh_market_views() from public, anon, authenticated;
grant execute on function public.refresh_market_views() to service_role;
