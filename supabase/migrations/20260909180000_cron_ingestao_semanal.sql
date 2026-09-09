-- Reativa a ingestão automática, em cadência SEMANAL.
--
-- A coleta estava parada desde 2026-08-30: os crons de ingestão foram
-- removidos na migração para a Vercel e nunca voltaram. Nenhum alarme dispara
-- quando isso acontece — a base só envelhece em silêncio.
--
-- ─── Por que o app_base_url muda junto ──────────────────────────────────────
-- Sem isso o cron seria um no-op silencioso. `app_settings.app_base_url`
-- estava no APEX (https://rumvia.com.br), que responde 308 para o www.
-- `net.http_post` NÃO segue redirect: o POST morreria no 308 e nada seria
-- coletado, sem erro visível. Verificado em 2026-09-09:
--   POST https://rumvia.com.br/api/public/ingest-jobs      -> 308 (para o www)
--   POST https://www.rumvia.com.br/api/public/ingest-jobs  -> 401 (vivo)
UPDATE public.app_settings
SET value = jsonb_build_object('url', 'https://www.rumvia.com.br')
WHERE key = 'app_base_url';

-- ─── Fontes gratuitas (12 ATS + agregadores) ────────────────────────────────
-- Domingo 04:00 UTC (01:00 BRT). Depois dos crons de 03:00/03:30 e no vale de
-- tráfego. Não dispara Bright Data: `runIngest` resolve o adapter em ADAPTERS,
-- e as chaves bd_* só existem em ASYNC_ADAPTERS — elas saem como "skipped".
SELECT cron.unschedule('rumvia-ingest-jobs')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rumvia-ingest-jobs');

SELECT cron.schedule(
  'rumvia-ingest-jobs',
  '0 4 * * 0',
  $CRON$
  SELECT net.http_post(
    url := (SELECT value->>'url' FROM public.app_settings WHERE key = 'app_base_url') || '/api/public/ingest-jobs',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'rumvia_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  )
  WHERE COALESCE((SELECT value->>'url' FROM public.app_settings WHERE key = 'app_base_url'), '') <> '';
  $CRON$
);

-- ─── Bright Data, fase COBRADA: pede coleta nova ────────────────────────────
-- Domingo 04:30 UTC, meia hora depois das gratuitas.
-- Custo: 3 fontes ativas × 10 discover_inputs × limit_per_input 50 = teto de
-- 1.500 registros por disparo. Semanal dá ~6.500/mês contra 5.000 do plano
-- gratuito da Bright Data, ou seja ~1.500 pagos a US$ 1,50/1.000 ≈ US$ 2,25/mês.
-- Para caber inteiro no gratuito, baixar `limit_per_input` para 35 em
-- job_sources.config (3 × 10 × 35 = 1.050/disparo).
SELECT cron.unschedule('rumvia-ingest-async-disparar')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rumvia-ingest-async-disparar');

SELECT cron.schedule(
  'rumvia-ingest-async-disparar',
  '30 4 * * 0',
  $CRON$
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
  $CRON$
);

-- ─── Bright Data, fase BARATA: colhe o que ficou pronto ─────────────────────
-- Só consulta status de snapshot pendente; sem pendente é um no-op que nem
-- chega a iterar. Por isso pode ser frequente — mas NÃO precisa rodar a semana
-- inteira: limitado a domingo e segunda, cobre ~43h depois do disparo, bem
-- acima do BRIGHT_DATA_SNAPSHOT_TTL_HOURS (24h) que abandona o lote.
SELECT cron.unschedule('rumvia-ingest-async-colher')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rumvia-ingest-async-colher');

SELECT cron.schedule(
  'rumvia-ingest-async-colher',
  '*/30 * * * 0,1',
  $CRON$
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
  $CRON$
);
