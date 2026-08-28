-- Separa as duas fases da coleta assíncrona em crons próprios.
--
-- Estavam juntas numa chamada a cada 30 min. As duas fases têm custo muito
-- diferente: colher só consulta o status de um snapshot (barato, e queremos que
-- seja frequente para o lote entrar rápido); disparar pede uma coleta nova à
-- Bright Data, que é cobrada por registro.
--
-- Juntas a cada 30 min, assim que um lote era ingerido o ciclo seguinte
-- disparava outro: até ~28.800 registros/dia com a config atual
-- (3 fontes × 4 keywords × 50). Separadas, o disparo roda 2x/dia
-- (~1.200 registros/dia) e a colheita continua de meia em meia hora.
--
-- Vaga de emprego não muda de hora em hora; duas coletas por dia cobrem o
-- mercado com folga.

select cron.unschedule('rumvia-ingest-async');

-- Fase barata: recolhe o que ficou pronto. A cada 30 min.
select cron.schedule(
  'rumvia-ingest-async-colher',
  '*/30 * * * *',
  $cron$
  SELECT net.http_post(
    url := (SELECT value->>'url' FROM public.app_settings WHERE key = 'app_base_url') || '/api/public/ingest-async?fase=colher',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'rumvia_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  )
  WHERE COALESCE((SELECT value->>'url' FROM public.app_settings WHERE key = 'app_base_url'), '') <> '';
  $cron$
);

-- Fase cobrada: pede coleta nova. 06:10 e 18:10 UTC.
-- Os 10 minutos de offset deixam a colheita das 06:00/18:00 terminar antes,
-- liberando a trava de "lote em andamento" para o disparo.
select cron.schedule(
  'rumvia-ingest-async-disparar',
  '10 6,18 * * *',
  $cron$
  SELECT net.http_post(
    url := (SELECT value->>'url' FROM public.app_settings WHERE key = 'app_base_url') || '/api/public/ingest-async?fase=disparar',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'rumvia_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  )
  WHERE COALESCE((SELECT value->>'url' FROM public.app_settings WHERE key = 'app_base_url'), '') <> '';
  $cron$
);
