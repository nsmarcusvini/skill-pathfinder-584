-- =============================================================================
-- AbacatePay — assinatura mensal do RUMVIA (Plano Pro, R$ 24,90/mês)
--
-- Plano é DADO, não código (CLAUDE.md, regra 1). Trocar preço, ciclo, método de
-- pagamento ou política de retentativa = UPDATE em billing_plans, zero deploy.
--
-- Fluxo AbacatePay v2:
--   POST /subscriptions/create  → devolve um CHECKOUT (bill_...), status PENDING
--   cliente paga na url         → webhook subscription.completed traz subs_...
--   a cada ciclo                → webhook subscription.renewed
--   cancelamento / max retries  → webhook subscription.cancelled
-- A assinatura (subs_...) só existe DEPOIS do primeiro pagamento — por isso
-- guardamos bill_id no create e subs_id só quando o webhook chega.
-- =============================================================================

-- ============================== billing_plans
CREATE TABLE IF NOT EXISTS public.billing_plans (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key                text NOT NULL UNIQUE,
  name               text NOT NULL,
  description        text,
  price_cents        integer NOT NULL CHECK (price_cents > 0),
  currency           text NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL'),
  -- ciclo vive no PRODUTO da AbacatePay; guardamos aqui só para exibir e para
  -- o script de setup criar o produto com o ciclo certo.
  cycle              text NOT NULL DEFAULT 'MONTHLY'
                       CHECK (cycle IN ('WEEKLY','MONTHLY','QUARTERLY','SEMIANNUALLY','ANNUALLY')),
  trial_days         integer CHECK (trial_days IS NULL OR trial_days BETWEEN 1 AND 90),
  -- PIX em assinatura exige "PIX Automático" habilitado no dashboard da
  -- AbacatePay. Enquanto não estiver, o padrão documentado é só CARD.
  methods            text[] NOT NULL DEFAULT ARRAY['CARD']::text[]
                       CHECK (methods <@ ARRAY['PIX','CARD']::text[] AND array_length(methods, 1) >= 1),
  max_retry          integer NOT NULL DEFAULT 3 CHECK (max_retry BETWEEN 1 AND 10),
  retry_every_days   integer NOT NULL DEFAULT 3 CHECK (retry_every_days BETWEEN 1 AND 30),
  -- prod_... — preenchido por `bun scripts/abacatepay-setup.ts`
  abacate_product_id text,
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Catálogo de preço é legível por quem está logado (a tela de assinatura lê).
GRANT SELECT ON public.billing_plans TO authenticated;
GRANT ALL    ON public.billing_plans TO service_role;
ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "billing_plans_read_active" ON public.billing_plans;
CREATE POLICY "billing_plans_read_active" ON public.billing_plans
  FOR SELECT TO authenticated USING (is_active = true);

DROP TRIGGER IF EXISTS billing_plans_updated_at ON public.billing_plans;
CREATE TRIGGER billing_plans_updated_at BEFORE UPDATE ON public.billing_plans
  FOR EACH ROW EXECUTE FUNCTION public.rumvia_set_updated_at();

-- ============================== subscriptions
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id                 uuid NOT NULL REFERENCES public.billing_plans(id) ON DELETE RESTRICT,

  -- pending    → checkout criado, cliente ainda não pagou
  -- active     → subscription.completed ou .renewed
  -- past_due   → uma cobrança de ciclo falhou (ainda dentro do retryPolicy)
  -- cancelled  → cancelada pelo usuário ou por max_payment_retries_exceeded
  -- refunded   → pagamento estornado / chargeback
  -- expired    → checkout expirou sem pagamento
  status                  text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','active','past_due','cancelled','refunded','expired')),

  -- nosso identificador, enviado como externalId no checkout. É o elo mais
  -- confiável de volta: chega em data.checkout.externalId nos webhooks.
  external_id             text NOT NULL UNIQUE,

  abacate_customer_id     text,   -- cust_...
  abacate_bill_id         text,   -- bill_... (checkout que originou a assinatura)
  abacate_subscription_id text,   -- subs_... (só existe após o 1º pagamento)
  checkout_url            text,

  amount_cents            integer NOT NULL CHECK (amount_cents > 0),
  currency                text NOT NULL DEFAULT 'BRL',
  method                  text,   -- CARD | PIX (o que o cliente escolheu)
  dev_mode                boolean NOT NULL DEFAULT false,

  current_period_start    timestamptz,
  current_period_end      timestamptz,
  trial_ends_at           timestamptz,
  last_payment_at         timestamptz,
  last_receipt_url        text,
  cancelled_at            timestamptz,
  cancelled_due_to        text,

  metadata                jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user   ON public.subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_bill   ON public.subscriptions (abacate_bill_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_subs   ON public.subscriptions (abacate_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions (status);

-- No máximo uma assinatura viva por usuário. Canceladas/expiradas podem
-- acumular (histórico), mas pending/active/past_due é uma só.
CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_user_viva
  ON public.subscriptions (user_id)
  WHERE status IN ('pending','active','past_due');

-- Leitura própria via RLS; ESCRITA só service_role (CLAUDE.md, regra 6 —
-- estado de pagamento nunca sai do webhook / server function).
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL    ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions_own_select" ON public.subscriptions;
CREATE POLICY "subscriptions_own_select" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE);

DROP TRIGGER IF EXISTS subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.rumvia_set_updated_at();

-- ============================== billing_events
-- Log cru de webhook. A UNIQUE em event_id é a idempotência exigida pela
-- AbacatePay: reentrega do mesmo log_... não reprocessa.
CREATE TABLE IF NOT EXISTS public.billing_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        text NOT NULL UNIQUE,          -- log_...
  event_type      text NOT NULL,                 -- subscription.completed, ...
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  dev_mode        boolean NOT NULL DEFAULT false,
  payload         jsonb NOT NULL,
  handled         boolean NOT NULL DEFAULT false,
  handle_error    text,
  received_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_events_sub  ON public.billing_events (subscription_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_type ON public.billing_events (event_type, received_at DESC);

-- Nenhum acesso de authenticated: o payload traz dados de pagamento.
GRANT ALL ON public.billing_events TO service_role;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_events FROM anon, authenticated;

-- ============================== has_active_subscription
-- Fonte ÚNICA da pergunta "esse usuário é pagante?". Usada pelas server
-- functions e disponível para RLS de features pagas futuras.
CREATE OR REPLACE FUNCTION public.has_active_subscription(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.user_id = _user_id
      AND s.status IN ('active','past_due')
      AND (s.current_period_end IS NULL OR s.current_period_end > now())
  );
$$;

REVOKE ALL     ON FUNCTION public.has_active_subscription(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_active_subscription(uuid) TO authenticated, service_role;

-- ============================== seed do plano
-- abacate_product_id fica NULL de propósito: quem preenche é
-- `bun scripts/abacatepay-setup.ts`, que cria o produto na loja AbacatePay.
INSERT INTO public.billing_plans (key, name, description, price_cents, cycle)
VALUES (
  'pro_mensal',
  'RUMVIA Pro',
  'Acesso completo ao RUMVIA. Cobrança mensal, cancele quando quiser.',
  2490,
  'MONTHLY'
)
ON CONFLICT (key) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      price_cents = EXCLUDED.price_cents,
      cycle       = EXCLUDED.cycle;
