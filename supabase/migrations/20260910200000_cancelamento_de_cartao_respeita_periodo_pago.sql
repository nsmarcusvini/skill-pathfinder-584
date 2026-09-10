-- Cancelamento de cartão passa a respeitar o período já pago.
--
-- Antes: cancelar fora do prazo de arrependimento marcava `status = 'cancelled'`
-- na mesma hora — mesmo que o mês (ou trimestre, ou ano) já estivesse pago
-- integralmente. A pessoa perdia dias que já eram dela, sem devolução nenhuma
-- (cancelamento comum não estorna, só o de arrependimento estorna). Card
-- recorrente não devia se comportar assim: se não vai renovar, o certo é
-- terminar quando o período pago acaba, não no clique.
--
-- `cancel_at_period_end` marca a intenção. `status` só vira 'cancelled' quando
-- o período efetivamente termina (função abaixo, via cron) — mesmo padrão que
-- o PIX pré-pago já usa em `expire_and_notify_prepaid`
-- (20260908180000_pix_avulso_aviso_e_expiracao.sql). Enquanto isso,
-- `has_active_subscription` continua respondendo certo sem nenhuma mudança
-- nela: ela já olha status + current_period_end juntos.
--
-- Estorno por arrependimento (CDC art. 49) não muda: dinheiro voltou, acesso
-- cai na hora, como já era.

alter table public.subscriptions
  add column if not exists cancel_at_period_end boolean not null default false;

comment on column public.subscriptions.cancel_at_period_end is
  'Cancelamento pedido fora do prazo de arrependimento: mantém acesso até current_period_end, sem renovar (a recorrência já foi cancelada no Asaas). Status só vira cancelled quando o período passa — ver finalize_scheduled_cancellations().';

create or replace function public.finalize_scheduled_cancellations()
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.subscriptions
     set status = 'cancelled',
         updated_at = now()
   where cancel_at_period_end = true
     and status in ('active', 'past_due')
     and current_period_end is not null
     and current_period_end <= now();
$$;

comment on function public.finalize_scheduled_cancellations() is
  'Diário: fecha (status=cancelled) as assinaturas com cancelamento agendado cujo período pago já terminou. Não muda acesso nenhum (has_active_subscription já cortava pela data) — só destrava o índice de assinatura viva para uma nova compra. Espelha expire_and_notify_prepaid, para o caminho de cartão.';

revoke execute on function public.finalize_scheduled_cancellations() from public;
grant execute on function public.finalize_scheduled_cancellations() to service_role;

-- Mesmo horário do job de PIX: depois do expire-jobs de mercado, junto do
-- aviso de certificação — não precisa ser mais frequente porque o acesso já
-- cai sozinho pela data; isto só mantém o status honesto.
select cron.schedule(
  'rumvia-finaliza-cancelamentos',
  '0 9 * * *',
  $$ SELECT public.finalize_scheduled_cancellations(); $$
);
