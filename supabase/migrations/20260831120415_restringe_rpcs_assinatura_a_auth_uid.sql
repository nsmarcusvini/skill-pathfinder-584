-- =============================================================================
-- Fecha enumeração de assinantes: has_active_subscription/can_access_paid_features
-- tinham EXECUTE liberado para `authenticated` (necessário para uso futuro em
-- RLS, ex.: USING (auth.uid() = user_id AND has_active_subscription(auth.uid())))
-- mas aceitam `_user_id` arbitrário. Sem trava, qualquer sessão logada —
-- inclusive anônima, que é `authenticated` no JWT (CLAUDE.md regra 7) — podia
-- chamar /rest/v1/rpc/has_active_subscription com o UUID de outra pessoa e
-- descobrir se ela paga.
--
-- Achado nos advisors de segurança logo após aplicar as duas migrations
-- anteriores (20260831120000, 20260831140000). Único chamador hoje é
-- subscription-middleware.ts via supabaseAdmin.rpc (service_role) — que não
-- passa por este check. Self-service de RLS futura continua funcionando:
-- auth.uid() = _user_id ali é sempre verdadeiro.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.has_active_subscription(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (auth.role() = 'service_role' OR auth.uid() = _user_id)
    AND EXISTS (
      SELECT 1
      FROM public.subscriptions s
      WHERE s.user_id = _user_id
        AND s.status IN ('active','past_due')
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
    );
$$;

CREATE OR REPLACE FUNCTION public.can_access_paid_features(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (auth.role() = 'service_role' OR auth.uid() = _user_id)
    AND (public.has_active_subscription(_user_id) OR public.is_admin(_user_id));
$$;
