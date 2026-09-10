-- =============================================================================
-- Corrige os GRANTs de `resubscribe_blocks`, `usage_events` e `usage_daily`.
--
-- O ERRO, E É O MESMO DA MIGRATION 20260910112613
-- Nas duas migrations anteriores (20260910140000 e 20260910141000) eu concedi
-- só o que queria conceder — `GRANT ALL ... TO service_role`, mais `SELECT` em
-- `usage_daily` para `authenticated` — e assumi que "não conceder" bastasse
-- para o resto. Não basta. O schema `public` deste projeto tem
-- ALTER DEFAULT PRIVILEGES concedendo TUDO a `anon` e `authenticated` em toda
-- tabela nova. Conferido logo após aplicar:
--
--   resubscribe_blocks  anon=arwdDxtm | authenticated=arwdDxtm
--   usage_events        anon=arwdDxtm | authenticated=arwdDxtm
--   usage_daily         anon=arwdDxtm | authenticated=arwdDxtm
--
-- Ou seja: SELECT, INSERT, UPDATE, DELETE e TRUNCATE para qualquer sessão,
-- incluindo a anônima (que é `authenticated` no JWT, regra 7). O texto do
-- GRANT não diz o que está valendo — só `relacl` diz. É exatamente a lição
-- que a 20260910112613 registrou para FUNÇÕES; ela vale igual para TABELAS, e
-- eu não a apliquei aqui.
--
-- POR QUE NÃO HOUVE EXPOSIÇÃO, E POR QUE ISSO NÃO É DESCULPA
-- As três nasceram com RLS ligada. `resubscribe_blocks` e `usage_events` têm
-- ZERO policies, e RLS sem policy nega tudo; `usage_daily` tem uma policy só
-- de SELECT da própria linha, então INSERT/UPDATE/DELETE também caem. Na
-- prática o dado não vazou nem foi editável.
--
-- Mas deixar assim é uma armadilha armada: no dia em que alguém acrescentar
-- uma policy permissiva — um `FOR ALL USING (auth.uid() = user_id)` distraído
-- em `usage_daily`, por exemplo — o usuário passa a poder ZERAR o próprio
-- contador, que é editar a prova e a cota no mesmo gesto. A regra 12 do
-- CLAUDE.md manda os três: middleware, revoke e leitura por supabaseAdmin.
-- Faltava o revoke.
-- =============================================================================

-- Nomear os papéis é obrigatório: `REVOKE ... FROM PUBLIC` não remove grant
-- explícito de papel — são coisas diferentes, e foi grant explícito que o
-- ALTER DEFAULT PRIVILEGES criou.
REVOKE ALL ON public.resubscribe_blocks FROM anon, authenticated;
REVOKE ALL ON public.usage_events       FROM anon, authenticated;
REVOKE ALL ON public.usage_daily        FROM anon, authenticated;

-- Devolve APENAS o que é intencional: o titular lê o próprio uso agregado
-- (LGPD, direito de acesso — é o que a exportação em /conta consome, e o que
-- a policy `usage_daily_own_select` filtra). Nada de INSERT ou UPDATE: quem
-- escreve é `record_usage`, como service_role.
GRANT SELECT ON public.usage_daily TO authenticated;

-- `resubscribe_blocks` e `usage_events` ficam sem nenhum grant para os papéis
-- de cliente. Quem está bloqueado descobre pela mensagem do checkout, que sai
-- de uma server function rodando como service_role — não lendo a tabela pelo
-- PostgREST. Dar SELECT ali entregaria a lista de bloqueados e o motivo de
-- cada um para qualquer sessão autenticada.
