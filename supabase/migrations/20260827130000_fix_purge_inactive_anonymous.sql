-- CORREÇÃO: purge_inactive_anonymous() nunca apagava ninguém.
--
-- A versão de 20260826210000 fazia:
--   JOIN auth.identities i ON i.user_id = u.id AND i.provider = 'anonymous'
-- mas o GoTrue não cria linha em auth.identities para usuário anônimo — ele só
-- ganha identity ao converter para conta permanente (linkIdentity/updateUser).
-- O JOIN portanto nunca casava: a função rodava todo dia às 03:30, retornava 0 e
-- registrava sucesso, enquanto a retenção de 7 dias prometida em /privacidade
-- ("Currículos de visitantes sem conta são apagados em 7 dias") jamais acontecia.
--
-- Verificado em 2026-08-27 no projeto novo: sign-in anônimo real gerou
-- 1 auth.users com is_anonymous = true e 0 linhas em auth.identities.
--
-- Correções:
--   1. usa auth.users.is_anonymous — mesma fonte que handle_new_user já propaga
--      para profiles.is_anonymous;
--   2. COALESCE em last_sign_in_at: se vier NULL a comparação daria NULL e a
--      linha escaparia do purge de novo.
--
-- O guard NOT EXISTS (profiles com is_anonymous = false) fica como segunda linha
-- de defesa: conta que virou permanente nunca é apagada mesmo se is_anonymous
-- ficar dessincronizado.

CREATE OR REPLACE FUNCTION public.purge_inactive_anonymous()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  _row record;
  _count integer := 0;
BEGIN
  FOR _row IN
    SELECT u.id
    FROM auth.users u
    WHERE COALESCE(u.is_anonymous, false) = true
      AND u.created_at < now() - interval '7 days'
      AND COALESCE(u.last_sign_in_at, u.created_at) < now() - interval '7 days'
      AND NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = u.id AND p.is_anonymous = false
      )
    LIMIT 500
  LOOP
    DELETE FROM auth.users WHERE id = _row.id;
    _count := _count + 1;
  END LOOP;

  INSERT INTO public.app_settings (key, value)
  VALUES ('anon_purge_last_run', to_jsonb(now()::text))
  ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now();

  RETURN _count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_inactive_anonymous() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_inactive_anonymous() TO service_role;
