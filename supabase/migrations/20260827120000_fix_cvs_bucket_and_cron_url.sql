-- Correções encontradas na migração para projeto Supabase próprio (2026-08-27).
--
-- 1. O bucket 'cvs' nunca foi criado por migration. No projeto original ele foi
--    criado pela UI do Lovable, então as policies de 20260826165101 apontavam
--    para um bucket que não existe num projeto novo — upload de CV quebrava.
--
-- 2. A URL do app estava hardcoded no corpo do cron de ingestão, apontando para
--    o preview do Lovable (project--aab156fd-...lovable.app). Passa a ser lida de
--    app_settings.app_base_url em tempo de execução; enquanto estiver vazia o job
--    não dispara requisição nenhuma.

-- ─── bucket de currículos ─────────────────────────────────────────────────────
-- Privado. Limites espelham os CHECKs de public.cvs (10 MB, PDF ou DOCX).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cvs',
  'cvs',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ─── URL base do app, configurável ────────────────────────────────────────────
INSERT INTO public.app_settings (key, value)
VALUES ('app_base_url', jsonb_build_object('url', ''))
ON CONFLICT (key) DO NOTHING;

-- ─── re-agenda a ingestão sem URL hardcoded ───────────────────────────────────
SELECT cron.unschedule('rumvia-ingest-jobs')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rumvia-ingest-jobs');

SELECT cron.schedule(
  'rumvia-ingest-jobs',
  '0 */6 * * *',
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
