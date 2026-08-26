-- 0007: segredo interno de cron guardado no Vault

DO $$
DECLARE v_exists boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'rumvia_cron_secret') INTO v_exists;
  IF NOT v_exists THEN
    PERFORM vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'rumvia_cron_secret', 'Segredo interno do cron de ingestão RUMVIA');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.verify_cron_secret(_token text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets s
    WHERE s.name = 'rumvia_cron_secret' AND s.decrypted_secret = _token
  );
$$;

REVOKE EXECUTE ON FUNCTION public.verify_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cron_secret(text) TO service_role;

SELECT cron.unschedule('rumvia-ingest-jobs') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rumvia-ingest-jobs');

SELECT cron.schedule(
  'rumvia-ingest-jobs',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--aab156fd-05de-4134-a07d-98ff09ebf0ee.lovable.app/api/public/ingest-jobs',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'rumvia_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);