-- =============================================================================
-- Três ciclos de assinatura: mensal, trimestral e anual.
--
-- Preço é DADO, não código (CLAUDE.md, regra 1). Esta migration não muda uma
-- linha de lógica de cobrança: ela troca a premissa de "existe UM plano" por
-- "existem N planos ativos", que é o que o resto do código passa a ler.
--
-- Preço base mensal sobe de R$ 24,90 para R$ 29,90. Os ciclos longos ganham
-- desconto progressivo, expresso como equivalente mensal redondo:
--
--   mensal      R$  29,90 / mês       = R$ 29,90/mês   (referência, 0%)
--   trimestral  R$  80,70 / trimestre = R$ 26,90/mês   (-10%)
--   anual       R$ 286,80 / ano       = R$ 23,90/mês   (-20%)
--
-- O desconto NÃO é gravado: `months` é coluna gerada e a % sai da divisão
-- price_cents/months contra o maior equivalente mensal. Guardar o número
-- pronto criaria uma segunda fonte de verdade que envelhece sozinha no dia
-- em que alguém mexer só no preço.
--
-- Assinatura viva não é afetada: `subscriptions.amount_cents` é copiado no
-- checkout, então quem já paga R$ 24,90 continua pagando R$ 24,90 até trocar
-- de plano. Grandfathering sai de graça, sem coluna nova.
-- =============================================================================

-- ============================== ciclo: vocabulário do Asaas
-- O `cycle` vai CRU para o Asaas (`subscription.cycle` no POST /checkouts), e
-- lá o ciclo anual chama-se `YEARLY` — `ANNUALLY`, que estava no CHECK antigo,
-- seria recusado pela API. Trocamos pelo vocabulário deles e restringimos aos
-- ciclos que são múltiplos inteiros de mês: WEEKLY/BIWEEKLY nunca foram
-- vendáveis aqui e quebrariam o equivalente mensal.
ALTER TABLE public.billing_plans DROP CONSTRAINT IF EXISTS billing_plans_cycle_check;
ALTER TABLE public.billing_plans
  ADD CONSTRAINT billing_plans_cycle_check
  CHECK (cycle IN ('MONTHLY','BIMONTHLY','QUARTERLY','SEMIANNUALLY','YEARLY'));

COMMENT ON COLUMN public.billing_plans.cycle IS
  'Ciclo no vocabulário do Asaas — vai cru no POST /checkouts. Anual é YEARLY, não ANNUALLY.';

-- ============================== months: quantos meses o ciclo cobre
-- Gerada, não digitada: é propriedade do ciclo, não decisão de produto. Coluna
-- comum aceitaria linha com QUARTERLY/months=1 e o desconto exibido sairia
-- errado sem nada reclamar.
ALTER TABLE public.billing_plans
  ADD COLUMN IF NOT EXISTS months integer
    GENERATED ALWAYS AS (
      CASE cycle
        WHEN 'MONTHLY'      THEN 1
        WHEN 'BIMONTHLY'    THEN 2
        WHEN 'QUARTERLY'    THEN 3
        WHEN 'SEMIANNUALLY' THEN 6
        WHEN 'YEARLY'       THEN 12
      END
    ) STORED;

COMMENT ON COLUMN public.billing_plans.months IS
  'Meses cobertos por uma cobrança. Base do equivalente mensal e do % de desconto.';

-- ============================== sort_order: ordem na vitrine
ALTER TABLE public.billing_plans
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.billing_plans.sort_order IS
  'Ordem de exibição na landing e em /assinatura. Menor primeiro.';

-- ============================== os três planos
INSERT INTO public.billing_plans (key, name, description, price_cents, cycle, sort_order)
VALUES
  ('pro_mensal',     'RUMVIA Pro Mensal',
   'Acesso completo ao RUMVIA. Cobrança mensal, cancele quando quiser.',
   2990,  'MONTHLY',   1),
  ('pro_trimestral', 'RUMVIA Pro Trimestral',
   'Acesso completo ao RUMVIA. Cobrança a cada 3 meses, com desconto sobre o mensal.',
   8070,  'QUARTERLY', 2),
  ('pro_anual',      'RUMVIA Pro Anual',
   'Acesso completo ao RUMVIA. Cobrança anual, o menor preço por mês.',
   28680, 'YEARLY',    3)
ON CONFLICT (key) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      price_cents = EXCLUDED.price_cents,
      cycle       = EXCLUDED.cycle,
      sort_order  = EXCLUDED.sort_order,
      is_active   = true;
