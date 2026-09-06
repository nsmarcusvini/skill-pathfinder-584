-- =============================================================================
-- Conformidade da cobrança: arrependimento (CDC art. 49) + registro de aceite
-- dos Termos de uso. Plano em docs/roadmap/conformidade-cobranca.md.
-- =============================================================================

-- ============================== subscriptions: rastro para o estorno
-- `current_period_start` é sobrescrito a cada renovação (webhook.server.ts),
-- então não serve para calcular o prazo de 7 dias depois do primeiro ciclo.
-- `first_activated_at` é gravado UMA VEZ, no primeiro PAYMENT_CONFIRMED/
-- RECEIVED, e nunca mais tocado — é a data de referência do art. 49.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS first_activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_payment_id text;

COMMENT ON COLUMN public.subscriptions.first_activated_at IS
  'Gravado uma única vez, no primeiro PAYMENT_CONFIRMED/RECEIVED. Base do prazo de arrependimento do CDC art. 49 (7 dias). Nunca sobrescrito em renovação.';
COMMENT ON COLUMN public.subscriptions.provider_payment_id IS
  'pay_... da cobrança mais recente, aprendido em qualquer webhook PAYMENT_*. Usado para estornar (POST /payments/{id}/refund) sem precisar consultar a API do Asaas na hora do pedido.';

-- ============================== terms_acceptances
-- Página publicada não prova aceite (docs/roadmap/conformidade-cobranca.md,
-- item 2). Uma linha por (usuário, versão do texto) — histórico imutável, não
-- uma coluna em profiles, porque quando o texto mudar é o histórico que prova
-- qual versão cada pessoa aceitou.
CREATE TABLE IF NOT EXISTS public.terms_acceptances (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version      text NOT NULL,
  accepted_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, version)
);

CREATE INDEX IF NOT EXISTS idx_terms_acceptances_user ON public.terms_acceptances (user_id);

GRANT SELECT, INSERT ON public.terms_acceptances TO authenticated;
GRANT ALL ON public.terms_acceptances TO service_role;
ALTER TABLE public.terms_acceptances ENABLE ROW LEVEL SECURITY;

-- Exclusiva de conta permanente (CLAUDE.md, regra 6): sessão anônima não é
-- cliente ainda, não faz sentido "aceitar termos" antes de virar conta.
DROP POLICY IF EXISTS "terms_acceptances_own_select" ON public.terms_acceptances;
CREATE POLICY "terms_acceptances_own_select" ON public.terms_acceptances
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE);

-- Só INSERT — é um log de aceite, ninguém edita ou apaga a própria aceitação
-- (nem o dono). Alteração e expurgo (se necessário por LGPD) são service_role.
DROP POLICY IF EXISTS "terms_acceptances_own_insert" ON public.terms_acceptances;
CREATE POLICY "terms_acceptances_own_insert" ON public.terms_acceptances
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE);
