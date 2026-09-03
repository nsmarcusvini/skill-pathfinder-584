-- Fecha o acesso direto ao dado de mercado. Ele é PAGO (CLAUDE.md, regra 12).
--
-- O QUE ESTAVA ABERTO
-- Testado como sessão ANÔNIMA (sem conta, sem pagar), direto no PostgREST:
--
--   mv_salary_stats ............ 24 linhas
--   mv_tool_demand ............ 304 linhas
--   mv_company_hiring ......... 360 linhas
--   mv_skill_demand_by_track .. 2.042 linhas
--
-- Isso é exatamente o conteúdo das telas pagas (Ferramentas, Empresas,
-- Salários). E não dava para resolver com RLS: **materialized view não suporta
-- RLS**. A única proteção possível é o GRANT — e ele estava aberto para `anon`
-- e `authenticated`. Como sessão anônima é `authenticated` no JWT (regra 7),
-- qualquer visitante lia o dataset inteiro sem passar por lugar nenhum.
--
-- As tabelas-base tinham o mesmo problema por outro caminho: `job_postings`,
-- `job_posting_skills` e `companies` são legíveis por policy `USING (true)`
-- para `authenticated`. Fechar só as MVs seria proteção pela metade — bastaria
-- reagregar a partir da base.
--
-- A DECISÃO DE PRODUTO (do dono, 2026-09-03)
-- Dado de mercado é pago. O que continua grátis é o **número agregado** da
-- prévia: a aderência em % que `/` e `/analise` mostram sem cadastro. O
-- visitante vê o score dele; não vê a lista de vagas, ferramentas, empresas ou
-- salários que produz o score.
--
-- COMO ISSO SE SUSTENTA NO CÓDIGO
-- A partir daqui não existe caminho paralelo: nenhuma credencial de cliente
-- alcança dado de mercado. Todo acesso passa por server function, que decide
-- quem paga.
--
--   market.functions.ts  → requireActiveSubscription + supabaseAdmin
--   jobs.functions.ts    → requireActiveSubscription + supabaseAdmin
--   gap.functions.ts     → supabaseAdmin, SEM paywall (alimenta a prévia grátis;
--                          só os agregados market_demand/market_scope_stats)
--
-- Nenhuma rota do cliente lia essas tabelas direto — conferido antes de aplicar,
-- arquivo por arquivo. O cliente só toca dicionário (skills, trilhas, aliases) e
-- os dados dele. Por isso este revoke não quebra tela nenhuma.

-- ─── 1. Materialized views ──────────────────────────────────────────────────
-- Sem RLS possível: o GRANT é a única trava.

revoke select on public.mv_skill_demand_by_track from anon, authenticated;
revoke select on public.mv_tool_demand           from anon, authenticated;
revoke select on public.mv_company_hiring        from anon, authenticated;
revoke select on public.mv_salary_stats          from anon, authenticated;

-- ─── 2. Tabelas-base de mercado ─────────────────────────────────────────────
-- As policies `USING (true)` continuam existindo, mas viram inócuas sem o
-- GRANT. Mantidas de propósito: se um dia parte disso voltar a ser público,
-- basta devolver o SELECT, sem reescrever policy.

revoke select on public.job_postings       from anon, authenticated;
revoke select on public.job_posting_skills from anon, authenticated;
revoke select on public.companies          from anon, authenticated;

-- ─── 3. RPCs de mercado ─────────────────────────────────────────────────────
-- São SECURITY INVOKER e leem `job_postings` por dentro: sem o SELECT acima
-- elas já falhariam. Revogar deixa o erro limpo (403) em vez de estourar
-- permissão lá no meio da função.
--
-- `market_demand` e `market_scope_stats` NÃO são revogadas de `service_role`,
-- porque é por elas que a prévia grátis calcula a aderência via gap.functions.

revoke execute on function public.tool_ranking          from anon, authenticated;
revoke execute on function public.tool_detail           from anon, authenticated;
revoke execute on function public.tool_monthly          from anon, authenticated;
revoke execute on function public.company_ranking       from anon, authenticated;
revoke execute on function public.company_skill_demand  from anon, authenticated;
revoke execute on function public.company_monthly       from anon, authenticated;
revoke execute on function public.job_locations         from anon, authenticated;
revoke execute on function public.market_demand         from anon, authenticated;
revoke execute on function public.market_scope_stats    from anon, authenticated;

-- ─── 4. salary_observations: tabela mista ───────────────────────────────────
-- Aqui não dá para revogar o SELECT inteiro: a mesma tabela guarda as linhas de
-- mercado (`source='posting'`) E as submissões do próprio usuário. Tirar o
-- SELECT tiraria do usuário o acesso ao que ele mesmo mandou.
--
-- Então a separação vai para dentro da policy: linha de mercado exige
-- assinatura; linha própria continua sempre visível para o dono (é dado dele,
-- e há direito LGPD de acesso em jogo).

drop policy if exists salary_observations_read_market on public.salary_observations;

create policy salary_observations_read_market
  on public.salary_observations
  for select
  to authenticated
  using (
    (
      source = 'posting'
      AND status = 'aprovada'
      AND public.can_access_paid_features(auth.uid())
    )
    OR user_id = auth.uid()
  );
