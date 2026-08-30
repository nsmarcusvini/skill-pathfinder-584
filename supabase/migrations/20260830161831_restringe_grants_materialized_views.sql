-- Achado sério ao investigar o advisor "materialized_view_in_api": não era só
-- leitura exposta. `authenticated` tinha INSERT/UPDATE/DELETE/TRUNCATE nas
-- quatro materialized views de mercado, não só SELECT — herdado do
-- `GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated` padrão do
-- Supabase, que pressupõe RLS como o portão real de acesso.
--
-- Isso é seguro em tabela normal (RLS barra a linha mesmo com GRANT ALL na
-- tabela) mas Postgres NÃO permite RLS em materialized view. Resultado: até
-- hoje, qualquer sessão autenticada — inclusive anônima, que carrega o papel
-- 'authenticated' no JWT — podia rodar TRUNCATE ou DELETE direto via
-- PostgREST em mv_tool_demand, mv_company_hiring, mv_skill_demand_by_track e
-- mv_salary_stats, corrompendo o mercado para todo mundo até o próximo
-- refresh. Contraria regra 5/6 do CLAUDE.md: escrita em tabela de mercado é
-- só de service_role.
--
-- Nenhum código do app precisa de acesso direto a estas quatro: tool_ranking,
-- tool_detail, tool_monthly, company_ranking, company_skill_demand e
-- company_monthly são RPCs SECURITY DEFINER (rodam com o dono da função, não
-- precisam de GRANT do chamador). A única exceção é mv_salary_stats, lida
-- direto por getSalaryStats/getSalarySkillImpact em market.functions.ts com o
-- client de sessão do usuário — essa mantém SELECT para authenticated,
-- só isso.

REVOKE ALL ON public.mv_skill_demand_by_track FROM authenticated;
REVOKE ALL ON public.mv_tool_demand FROM authenticated;
REVOKE ALL ON public.mv_company_hiring FROM authenticated;

REVOKE ALL ON public.mv_salary_stats FROM authenticated;
GRANT SELECT ON public.mv_salary_stats TO authenticated;
