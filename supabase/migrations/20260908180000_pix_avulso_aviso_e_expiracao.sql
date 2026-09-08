-- PIX avulso: aviso de vencimento e expiração do período pré-pago.
--
-- PIX no RUMVIA é PRÉ-PAGO, não assinatura: cada pagamento compra UM período
-- (cobrança DETACHED no Asaas, sem contrato que renove). Isso cria duas
-- necessidades que o cartão não tem, porque no cartão o Asaas renova sozinho e
-- avisa por webhook.
--
-- 1. AVISAR ANTES DE VENCER
--    Sem aviso, o modelo pré-pago perde gente por esquecimento — que é
--    exatamente o motivo pelo qual PIX manual foi descartado na época da
--    AbacatePay ("PIX manual tem retenção ruim num ticket de R$ 24,90",
--    docs/PROGRESS.md). O aviso é o que torna o pré-pago defensável.
--
-- 2. EXPIRAR A LINHA VENCIDA
--    Quando `current_period_end` passa, o acesso já cai sozinho: quem decide é
--    `has_active_subscription`, que compara a data. Mas o `status` continua
--    'active' para sempre, e aí o índice `uq_subscriptions_user_viva` (uma
--    assinatura viva por usuário) impede a MESMA pessoa de comprar o próximo
--    período. Marcar como 'expired' libera a recompra.
--
--    Só linha de PIX é expirada aqui. Cartão vencido é outra história: a
--    renovação pode estar em curso, e quem trata disso é o webhook
--    (PAYMENT_OVERDUE -> past_due, e o Asaas retenta). Expirar cartão por data
--    cortaria acesso de quem está em retentativa legítima.

create or replace function public.expire_and_notify_prepaid()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
BEGIN
  -- ─── 1. Avisa quem está a 3 dias de perder o acesso ───────────────────────
  -- A dedupe de 7 dias garante UM aviso por período: o job roda diário, entra
  -- no dia 3 e os dias 2 e 1 caem fora por já existir aviso recente.
  INSERT INTO public.notifications (user_id, type, title, body, action_url)
  SELECT
    s.user_id,
    'pix_expiring',
    'Seu acesso vence em breve',
    'Seu período pago via PIX termina em '
      || to_char(s.current_period_end::date, 'DD/MM/YYYY')
      || '. Pagamento por PIX não renova sozinho — garanta o próximo período para não perder o acesso.',
    '/assinatura'
  FROM public.subscriptions s
  WHERE s.method = 'PIX'
    AND s.status = 'active'
    AND s.current_period_end IS NOT NULL
    AND s.current_period_end BETWEEN now() AND now() + interval '3 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = s.user_id
        AND n.type = 'pix_expiring'
        AND n.created_at > now() - interval '7 days'
    );

  -- ─── 2. Expira período pré-pago que já passou ─────────────────────────────
  -- Não muda acesso nenhum (já tinha caído pela data). Serve para o status
  -- refletir a verdade e para destravar a recompra.
  UPDATE public.subscriptions
     SET status = 'expired',
         updated_at = now()
   WHERE method = 'PIX'
     AND status = 'active'
     AND current_period_end IS NOT NULL
     AND current_period_end <= now();
END;
$$;

comment on function public.expire_and_notify_prepaid() is
  'Diário: avisa 3 dias antes do fim do período pago por PIX e expira os períodos já vencidos. Só mexe em linhas method = PIX — cartão em retentativa é tratado pelo webhook.';

revoke execute on function public.expire_and_notify_prepaid() from public;
grant execute on function public.expire_and_notify_prepaid() to service_role;

-- Roda às 9h (horário do servidor), depois do expire-jobs das 3h e junto do
-- horário em que o aviso de certificação já é enviado — concentra notificação
-- num horário em que a pessoa tende a ver.
select cron.schedule(
  'rumvia-expira-avisa-pix',
  '0 9 * * *',
  $$ SELECT public.expire_and_notify_prepaid(); $$
);
