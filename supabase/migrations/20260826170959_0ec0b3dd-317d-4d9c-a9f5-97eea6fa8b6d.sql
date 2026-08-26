-- 0006: match de empresa por similaridade + agendamentos

CREATE OR REPLACE FUNCTION public.match_company(_name text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id
  FROM public.companies c
  WHERE similarity(lower(unaccent(c.name)), lower(unaccent(_name))) > 0.9
  ORDER BY similarity(lower(unaccent(c.name)), lower(unaccent(_name))) DESC
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.match_company(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_company(text) TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('rumvia-ingest-jobs') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rumvia-ingest-jobs');
SELECT cron.unschedule('rumvia-refresh-market-views') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rumvia-refresh-market-views');

SELECT cron.schedule(
  'rumvia-ingest-jobs',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--aab156fd-05de-4134-a07d-98ff09ebf0ee.lovable.app/api/public/ingest-jobs',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', current_setting('app.settings.cron_secret', true)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

SELECT cron.schedule(
  'rumvia-refresh-market-views',
  '30 */6 * * *',
  $$ SELECT public.refresh_market_views(); $$
);