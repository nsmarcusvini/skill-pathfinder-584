-- CORREÇÃO DE SEGURANÇA.
--
-- A migration da dedupe escreveu apenas `revoke all ... from public`, e isso
-- NÃO basta no Supabase: o schema public tem default privileges que concedem
-- EXECUTE a anon e authenticated em toda função nova. Revogar de PUBLIC (o
-- pseudo-papel) não alcança concessões feitas diretamente a esses papéis.
--
-- Resultado: qualquer visitante, até sem login, podia chamar
-- POST /rest/v1/rpc/dedupe_job_postings e reescrever canonical_job_id da base
-- inteira. Isso é escrita em dado de mercado (proibida fora do service_role
-- pela regra 6) e ainda é uma operação cara sobre a tabela toda — vetor de
-- negação de serviço.
--
-- refresh_market_views e expire_old_jobs já faziam certo, listando os papéis
-- explicitamente. Esta migration alinha a dedupe ao mesmo padrão.
revoke all on function public.dedupe_job_postings(integer, integer)
  from public, anon, authenticated;

grant execute on function public.dedupe_job_postings(integer, integer) to service_role;
