-- =============================================================================
-- Paywall obrigatório: conta só abre com assinatura paga.
--
-- `has_active_subscription` responde "essa pessoa PAGA?".
-- `can_access_paid_features` responde "essa pessoa PODE ENTRAR?" — que é a
-- pergunta que o app faz. São diferentes por um caso só: admin entra sem pagar,
-- senão o dono do produto se tranca para fora do próprio painel.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.can_access_paid_features(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_active_subscription(_user_id) OR public.is_admin(_user_id);
$$;

REVOKE ALL     ON FUNCTION public.can_access_paid_features(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_access_paid_features(uuid) TO authenticated, service_role;
