-- Correção da migration anterior (restringe_grants_materialized_views):
-- tool_ranking, tool_detail, tool_monthly, company_ranking,
-- company_skill_demand e company_monthly são SECURITY INVOKER (não DEFINER
-- como eu tinha assumido — conferido em pg_proc.prosecdef = false). Rodam com
-- o privilégio do chamador, então authenticated PRECISA de SELECT direto nas
-- três materialized views para essas RPCs funcionarem. REVOKE ALL zerou isso
-- e quebrou /ferramentas e /empresas.
--
-- O achado de segurança continua válido e corrigido: o problema nunca foi
-- SELECT (isso o produto sempre precisou), era INSERT/UPDATE/DELETE/TRUNCATE
-- também estarem concedidos — e esses continuam revogados. Devolvendo só
-- leitura.
--
-- Verificado com SET LOCAL ROLE authenticated: tool_ranking e company_ranking
-- voltam a funcionar; DELETE FROM mv_tool_demand agora dá
-- "permission denied for materialized view" — a brecha real (qualquer sessão
-- autenticada, inclusive anônima, podia apagar as views de mercado) segue
-- fechada.

GRANT SELECT ON public.mv_skill_demand_by_track TO authenticated;
GRANT SELECT ON public.mv_tool_demand TO authenticated;
GRANT SELECT ON public.mv_company_hiring TO authenticated;
