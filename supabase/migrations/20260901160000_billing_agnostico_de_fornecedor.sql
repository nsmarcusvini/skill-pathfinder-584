-- =============================================================================
-- Billing agnóstico de fornecedor — AbacatePay → Asaas
--
-- A AbacatePay não faz cobrança recorrente para contas novas (suporte, 2026-09-01):
-- cartão descontinuado e PIX Automático indisponível. Migramos para o Asaas.
--
-- As colunas nasceram com o nome do fornecedor (`abacate_*`), o que foi um erro
-- meu: amarrou o schema a uma escolha que mudou em uma semana. Agora são
-- `provider_*` + uma coluna `provider`, para a próxima troca não tocar no schema.
--
-- Seguro rodar: `subscriptions` e `billing_events` estão VAZIAS (nenhum pagamento
-- real chegou a acontecer na AbacatePay), então não há dado para converter.
-- =============================================================================

-- ============================== subscriptions
ALTER TABLE public.subscriptions
  RENAME COLUMN abacate_customer_id TO provider_customer_id;

ALTER TABLE public.subscriptions
  RENAME COLUMN abacate_bill_id TO provider_checkout_id;

ALTER TABLE public.subscriptions
  RENAME COLUMN abacate_subscription_id TO provider_subscription_id;

-- Qual gateway originou esta linha. Default 'asaas' porque é para onde vamos;
-- linhas antigas não existem (tabela vazia).
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'asaas'
    CHECK (provider IN ('asaas', 'abacatepay', 'stripe'));

COMMENT ON COLUMN public.subscriptions.provider_checkout_id IS
  'Id da sessão de checkout no gateway. Asaas: uuid da checkoutSession.';
COMMENT ON COLUMN public.subscriptions.provider_subscription_id IS
  'Id da assinatura no gateway, conhecido só após o primeiro pagamento. Asaas: sub_...';
COMMENT ON COLUMN public.subscriptions.external_id IS
  'NOSSO id, enviado como externalReference. É o elo confiável de volta nos webhooks.';

-- Índices seguem os nomes antigos após o rename de coluna; renomeia para não
-- deixar `idx_subscriptions_bill` apontando para algo que não se chama mais bill.
ALTER INDEX IF EXISTS idx_subscriptions_bill RENAME TO idx_subscriptions_provider_checkout;
ALTER INDEX IF EXISTS idx_subscriptions_subs RENAME TO idx_subscriptions_provider_subscription;

-- ============================== billing_plans
ALTER TABLE public.billing_plans
  RENAME COLUMN abacate_product_id TO provider_plan_ref;

COMMENT ON COLUMN public.billing_plans.provider_plan_ref IS
  'Referência do plano no gateway, quando ele exige catálogo próprio. O Asaas '
  'não exige (o preço vai no checkout), então fica NULL — a coluna existe para '
  'gateways que exigem, como AbacatePay (prod_...) e Stripe (price_...).';

-- ============================== limpa o vínculo com a AbacatePay
-- O produto prod_... da AbacatePay não vale nada no Asaas.
UPDATE public.billing_plans
   SET provider_plan_ref = NULL
 WHERE key = 'pro_mensal';

-- ============================== métodos disponíveis
-- Pessoa física não pode receber PIX Automático (regra do Banco Central: o
-- recebedor precisa ser PJ). Enquanto o RUMVIA for CPF, é cartão e ponto.
-- Quando houver CNPJ ativo há 6+ meses, isto vira ARRAY['CARD','PIX'].
UPDATE public.billing_plans
   SET methods = ARRAY['CARD']::text[]
 WHERE key = 'pro_mensal';
