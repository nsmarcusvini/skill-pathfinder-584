-- Para TODOS os cron jobs. Decisão de custo, 2026-09-13.
--
-- Faz parte de uma parada total do produto (ingestão + site). O runbook com a
-- ordem correta e o caminho de volta está em `docs/PARADA-TOTAL.md`.
--
-- ─── Por que desagendar, se o projeto vai ser pausado de qualquer jeito ─────
-- Projeto pausado no Supabase não roda cron nenhum — mas o dia em que ele for
-- despausado, o `pg_cron` volta com TUDO armado. Se o domingo seguinte pegar
-- o projeto no ar, a Bright Data é cobrada antes de alguém decidir que a
-- coleta devia voltar. Desagendar aqui é o que garante que religar seja um
-- ato deliberado, e não um efeito colateral de despausar.

-- ─── Ingestão: é onde estava o dinheiro ─────────────────────────────────────
-- `disparar` é a fase COBRADA da Bright Data (~US$ 2,25/mês de excedente pela
-- conta da migration que o criou). Os outros dois não pagam API, mas acordam
-- função na Vercel a cada execução.
SELECT cron.unschedule('rumvia-ingest-jobs')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rumvia-ingest-jobs');

SELECT cron.unschedule('rumvia-ingest-async-disparar')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rumvia-ingest-async-disparar');

SELECT cron.unschedule('rumvia-ingest-async-colher')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rumvia-ingest-async-colher');

-- ─── Cobrança ──────────────────────────────────────────────────────────────
-- ATENÇÃO: estes dois só podem ficar parados ENQUANTO não houver assinante.
-- Em 2026-09-13 são 0 ativos e o site sai do ar junto, então ninguém assina,
-- cancela ou vence durante a parada. Com o produto no ar, parar estes CUSTA
-- dinheiro em vez de economizar:
--
--   finaliza-cancelamentos  quem pediu cancelamento não é efetivado, a
--                           assinatura segue viva no gateway e o cliente é
--                           cobrado de novo — reembolso, ou chargeback.
--   expira-avisa-pix        acesso pré-pago vencido nunca expira: produto
--                           pago entregue de graça.
--
-- São os PRIMEIROS a voltar quando o site voltar. Antes de qualquer venda.
SELECT cron.unschedule('rumvia-finaliza-cancelamentos')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rumvia-finaliza-cancelamentos');

SELECT cron.unschedule('rumvia-expira-avisa-pix')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rumvia-expira-avisa-pix');

-- ─── LGPD ──────────────────────────────────────────────────────────────────
-- `purge-anon` apaga o CV de quem não criou conta em 7 dias — a landing
-- promete isso por escrito, e a promessa não cai junto com o site.
--
-- Fica parado só porque a landing também sai do ar: sem tela no ar, nenhum CV
-- novo entra, e o passivo é finito e conhecido. Se o site voltar, este volta
-- JUNTO. Se a parada for longa, o certo não é deixá-lo parado: é rodar
-- `SELECT public.purge_inactive_anonymous();` uma vez, na mão, e zerar o que
-- ficou para trás. (É a mesma função que este cron chamava.)
SELECT cron.unschedule('rumvia-purge-anon')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rumvia-purge-anon');

-- ─── Manutenção: compute do próprio Postgres, sem chamada externa ──────────
SELECT cron.unschedule('rumvia-expire-jobs')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rumvia-expire-jobs');

SELECT cron.unschedule('rumvia-refresh-market-views')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rumvia-refresh-market-views');

SELECT cron.unschedule('rumvia-notify-certs')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rumvia-notify-certs');

SELECT cron.unschedule('rumvia-expurga-trilha-de-uso')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rumvia-expurga-trilha-de-uso');

-- ─── Rede de segurança ─────────────────────────────────────────────────────
-- A lista acima foi montada lendo as migrations, e migration não é o estado:
-- é o histórico. Um job criado à mão no painel, ou um nome antigo que sobreviveu
-- a uma renomeação (`rumvia-ingest-async` virou `disparar`/`colher` em
-- 2026-08-27), não aparece em lugar nenhum que dê para enumerar daqui.
--
-- Este bloco varre o que REALMENTE está agendado. Filtra por `rumvia-%` de
-- propósito: derrubar cron que não é nosso seria estragar coisa alheia para
-- resolver problema nosso.
DO $$
DECLARE
  j record;
BEGIN
  FOR j IN SELECT jobname FROM cron.job WHERE jobname LIKE 'rumvia-%' LOOP
    PERFORM cron.unschedule(j.jobname);
    RAISE NOTICE 'cron desagendado: %', j.jobname;
  END LOOP;
END $$;

-- ─── Conferência ───────────────────────────────────────────────────────────
-- Depois de aplicar, isto tem que voltar VAZIO:
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'rumvia-%';
-- Não confie no texto acima: confie no que a tabela responde.
