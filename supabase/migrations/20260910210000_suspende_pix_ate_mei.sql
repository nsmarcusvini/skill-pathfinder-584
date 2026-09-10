-- Suspende o PIX como método de pagamento — só cartão até existir MEI/CNPJ.
--
-- Decisão de produto (2026-09-10). Motivo: PIX aqui é PRÉ-PAGO (cobrança
-- DETACHED, um período por compra, sem renovação), porque PIX Automático exige
-- recebedor pessoa jurídica — regra do Banco Central, não do Asaas. Enquanto o
-- RUMVIA for pessoa física, PIX nunca vira assinatura de verdade: o cliente
-- tem que lembrar de pagar de novo todo mês, e cada compra é um funil novo.
-- Cartão faz recorrência de verdade e tem estorno imediato, que é o que o
-- direito de arrependimento (CDC art. 49) precisa para funcionar sem fricção.
--
-- Isto é DADO, não código (CLAUDE.md, regra 1). Nenhuma linha de PIX foi
-- removida do app: `startSubscriptionCheckout` continua sabendo abrir checkout
-- PIX, a tela continua sabendo desenhar o botão, e o cron
-- `rumvia-expira-avisa-pix` continua avisando e expirando período pré-pago —
-- o que muda é só o catálogo dizer que o método não está à venda.
--
-- Dois efeitos imediatos, sem deploy:
--   1. A vitrine para de mostrar o botão "Pagar com PIX" (lê plano.methods).
--   2. `startSubscriptionCheckout` recusa method='PIX' no servidor, porque
--      valida `plan.methods.includes(method)` — esconder botão não é proteção.
--
-- QUEM JÁ PAGOU NÃO É AFETADO. `has_active_subscription` olha status +
-- current_period_end da linha em `subscriptions`; não consulta o catálogo. O
-- assinante PIX ativo hoje segue com acesso até o fim do período que comprou,
-- recebe o aviso de 3 dias antes normalmente, e ao renovar encontra só cartão.
--
-- PARA RELIGAR quando o MEI existir (e só depois de cadastrar a chave PIX na
-- conta de PRODUÇÃO do Asaas — sandbox e produção são contas separadas):
--   UPDATE public.billing_plans SET methods = ARRAY['CARD','PIX']::text[]
--    WHERE is_active = true;
-- Isso devolve o PIX PRÉ-PAGO, que é o que existe hoje. PIX Automático é outra
-- API (/v3/pix/automatic/*) e continua sendo projeto, não configuração.

UPDATE public.billing_plans
   SET methods = ARRAY['CARD']::text[]
 WHERE methods @> ARRAY['PIX']::text[];
