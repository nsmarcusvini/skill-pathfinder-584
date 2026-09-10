-- Fecha o acesso direto ao catálogo de certificações e cursos. Ele é PAGO
-- (CLAUDE.md, regra 12). Este é o achado 1 de `docs/SEGURANCA.md`.
--
-- O QUE ESTAVA ABERTO
-- Reproduzido em produção antes de aplicar, como um visitante qualquer: basta
-- um `signInAnonymously` (que todo mundo recebe no primeiro acesso, regra 7) e
-- as duas tabelas saem inteiras pelo PostgREST:
--
--   certifications_catalog ... 37 linhas
--   courses_catalog ......... 41 linhas
--
-- É exatamente o que `PLANO_INCLUI` (src/lib/plan-copy.ts) vende como benefício
-- pago: "Certificações e cursos recomendados pelo seu gap".
--
-- POR QUE A RLS NÃO PEGAVA
-- As policies são `FOR SELECT TO authenticated USING (is_active)` — sem dono e
-- sem checagem de assinatura. E sessão anônima é `authenticated` no JWT. Ou
-- seja, a policy estava fazendo o que foi escrita para fazer; o problema é que
-- o que foi escrito não corresponde mais à decisão de produto.
--
-- A DECISÃO DE PRODUTO (do dono, 2026-09-10)
-- Catálogo é **totalmente pago**. Não entra amostra na prévia grátis. O que
-- continua livre em `/` e `/analise` é só o agregado: a aderência em %.
--
-- MESMO REMÉDIO DE 20260903170000_dado_de_mercado_e_pago.sql
-- Lá a lição foi que policy não adianta quando o GRANT está aberto. Aqui vale
-- igual: o `requireActiveSubscription` que learning.functions.ts acabou de
-- ganhar seria decorativo enquanto desse para ler a tabela por fora. Então o
-- acesso passa a ser só por server function, com service_role.
--
-- As policies ficam de pé de propósito, inócuas sem o GRANT: se um dia o
-- catálogo virar isca de marketing, devolve-se o SELECT sem reescrever nada.

revoke select on public.certifications_catalog from anon, authenticated;
revoke select on public.courses_catalog        from anon, authenticated;

-- NÃO se revoga de service_role: é por ele que learning.functions.ts lê, depois
-- de o middleware decidir quem paga. `user_certifications` e `user_courses`
-- continuam intocadas — são dado do usuário, seguem na RLS, e há direito LGPD
-- de acesso em jogo.
