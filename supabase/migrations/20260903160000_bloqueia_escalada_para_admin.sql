-- Fecha a escalada de privilégio em `profiles.is_admin`.
--
-- O QUE ESTAVA ABERTO
-- A policy `profiles_update_own` é `USING (auth.uid() = id)` — correta para
-- linha, mas RLS no Postgres não filtra COLUNA. Como `authenticated` tinha
-- GRANT UPDATE na tabela inteira, qualquer sessão logada — inclusive anônima,
-- que é `authenticated` no JWT (CLAUDE.md, regra 7) — virava admin com uma
-- linha no console do navegador:
--
--   supabase.from('profiles').update({is_admin:true}).eq('id', <meu uid>)
--
-- E `is_admin` não abre só o painel: `can_access_paid_features` é
-- `has_active_subscription(...) OR is_admin(...)`, então virar admin também
-- derruba o paywall inteiro (regra 12). Seis tabelas de RLS admin-only
-- (ingestion_runs, job_sources, pending_skill_terms, provider_snapshots,
-- skill_term_blocklist, view_refresh_log) caem junto.
--
-- SEGUNDO CAMINHO, MENOS ÓBVIO
-- `profiles_delete_own` + `profiles_insert_own` permitem apagar o próprio
-- perfil e inserir outro no lugar — com `is_admin = true`. Fechar só o UPDATE
-- deixaria essa porta aberta, por isso o trigger cobre INSERT também.
--
-- COMO FECHA (duas camadas independentes)
-- 1. GRANT por coluna: `authenticated` perde UPDATE em `is_admin` (e em `id` e
--    `created_at`, que nunca deveriam ser escritos pelo cliente).
-- 2. Trigger BEFORE INSERT OR UPDATE: mesmo que um GRANT volte a ser amplo por
--    acidente numa migration futura (ou pelo tooling do Lovable/Supabase), a
--    escalada continua bloqueada.
--
-- `is_anonymous` continua gravável de propósito: `markPermanent()` em
-- `use-auth.tsx` escreve nela do cliente, e ela é DADO DE EXIBIÇÃO. Nenhuma
-- decisão de segurança lê essa coluna — RLS e server functions usam a claim
-- `auth.jwt() ->> 'is_anonymous'`, que o cliente não forja.

-- ─── 1. Trigger: is_admin é imutável para quem vem pelo PostgREST ────────────
--
-- SECURITY INVOKER de propósito (sem SECURITY DEFINER): precisamos que
-- `current_user` seja o papel efetivo da requisição. O PostgREST faz
-- `SET LOCAL ROLE authenticated` (ou `anon`); a service_role key entra como
-- `service_role`; migration/psql entra como `postgres`. Com SECURITY DEFINER,
-- `current_user` viraria o dono da função e o teste passaria a valer nada.

create or replace function public.profiles_protege_colunas_privilegiadas()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- service_role (webhooks, admin.functions.ts) e postgres (migrations) passam.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- Recriar o próprio perfil não é caminho para virar admin.
  if tg_op = 'INSERT' then
    new.is_admin := false;
    return new;
  end if;

  if new.is_admin is distinct from old.is_admin then
    raise exception 'is_admin nao pode ser alterado por esta conta'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.profiles_protege_colunas_privilegiadas() is
  'Impede auto-promoção a admin via PostgREST. Segunda camada: o GRANT por coluna já bloqueia o UPDATE, este trigger sobrevive a um GRANT amplo acidental e cobre o caminho DELETE+INSERT.';

drop trigger if exists profiles_protege_colunas_privilegiadas on public.profiles;

create trigger profiles_protege_colunas_privilegiadas
  before insert or update on public.profiles
  for each row execute function public.profiles_protege_colunas_privilegiadas();

-- ─── 2. GRANT por coluna ────────────────────────────────────────────────────
--
-- ATENÇÃO PARA O FUTURO: a partir daqui a lista é fail-closed. Coluna nova em
-- `profiles` que o cliente precise escrever tem que ser adicionada neste GRANT,
-- senão o UPDATE volta 403. É o comportamento desejado — o padrão passa a ser
-- "não gravável" em vez de "gravável".

revoke update on public.profiles from anon;
revoke update on public.profiles from authenticated;

grant update (
  full_name,
  headline,
  avatar_url,
  country,
  state,
  city,
  current_track_id,
  seniority,
  years_experience,
  target_currency,
  target_region,
  onboarding_completed,
  is_anonymous,
  tour_status,
  tour_step,
  tour_updated_at,
  updated_at
) on public.profiles to authenticated;

-- ─── 3. is_admin() para de responder sobre terceiros ────────────────────────
--
-- Mesma classe de vazamento já corrigida em
-- `20260831120415_restringe_rpcs_assinatura_a_auth_uid.sql` para
-- has_active_subscription/can_access_paid_features — `is_admin` ficou de fora
-- na época. Como é SECURITY DEFINER e exposta em /rest/v1/rpc/is_admin,
-- qualquer sessão podia perguntar "fulano é admin?" passando o uuid dele.
--
-- Não quebra as 6 policies que chamam `is_admin(auth.uid())`: ali _user_id é
-- sempre o próprio chamador. E `can_access_paid_features` chega via
-- service_role no `requireActiveSubscription`.

create or replace function public.is_admin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  SELECT (auth.role() = 'service_role' OR auth.uid() = _user_id)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = _user_id AND p.is_admin = true
    );
$$;

-- REVOKE de `anon` sozinho não resolve: no Postgres toda função nasce com
-- EXECUTE para PUBLIC, e o ACL de `is_admin` ainda mostrava `=X/postgres`
-- (o grantee vazio é PUBLIC). As outras duas funções de billing já tinham sido
-- limpas assim; esta ficou para trás. Agora o ACL das três é idêntico.
revoke execute on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated, service_role;
