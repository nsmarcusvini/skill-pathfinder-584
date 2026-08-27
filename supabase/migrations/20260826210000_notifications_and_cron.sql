-- Prompt 14: notifications table + pg_cron for anon purge + job expiry

-- ─── Notifications ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        text NOT NULL,                            -- 'gap_updated', 'plan_due', 'cert_expiring', 'system'
  title       text NOT NULL,
  body        text,
  action_url  text,
  is_read     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_notifications"
  ON public.notifications
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Only service_role can insert on behalf of other users
REVOKE INSERT ON public.notifications FROM authenticated;
GRANT INSERT ON public.notifications TO service_role;
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_id, is_read, created_at DESC)
  WHERE is_read = false;

-- ─── Function: expire old job postings ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.expire_old_jobs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer;
BEGIN
  UPDATE public.job_postings
  SET is_active = false
  WHERE is_active = true
    AND created_at < now() - interval '90 days';

  GET DIAGNOSTICS _count = ROW_COUNT;

  -- Record run time
  INSERT INTO public.app_settings (key, value)
  VALUES ('jobs_expired_last_run', to_jsonb(now()::text))
  ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now();

  RETURN _count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_old_jobs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_old_jobs() TO service_role;

-- ─── Function: purge inactive anonymous users (7 days) ───────────────────────
-- Deletes from auth.users via service_role; cascades to profiles, cv_uploads, gap_analyses.

CREATE OR REPLACE FUNCTION public.purge_inactive_anonymous()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  _row record;
  _count integer := 0;
BEGIN
  FOR _row IN
    SELECT u.id
    FROM auth.users u
    JOIN auth.identities i ON i.user_id = u.id AND i.provider = 'anonymous'
    WHERE u.created_at < now() - interval '7 days'
      AND u.last_sign_in_at < now() - interval '7 days'
      AND NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = u.id AND p.is_anonymous = false
      )
    LIMIT 500
  LOOP
    DELETE FROM auth.users WHERE id = _row.id;
    _count := _count + 1;
  END LOOP;

  INSERT INTO public.app_settings (key, value)
  VALUES ('anon_purge_last_run', to_jsonb(now()::text))
  ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now();

  RETURN _count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_inactive_anonymous() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_inactive_anonymous() TO service_role;

-- ─── Function: notify expiring certifications ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_expiring_certs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, action_url)
  SELECT DISTINCT ON (uc.user_id, uc.certification_id)
    uc.user_id,
    'cert_expiring',
    'Certificação expirando em breve',
    cc.name || ' expira em ' || to_char(uc.expires_at::date, 'DD/MM/YYYY'),
    '/certificacoes'
  FROM public.user_certifications uc
  JOIN public.certifications_catalog cc ON cc.id = uc.certification_id
  WHERE uc.expires_at BETWEEN now() AND now() + interval '90 days'
    AND uc.status != 'expirada'
    -- don't re-notify if already notified this week
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = uc.user_id
        AND n.type = 'cert_expiring'
        AND n.created_at > now() - interval '7 days'
    )
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_expiring_certs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_expiring_certs() TO service_role;

-- ─── Schedule cron jobs ───────────────────────────────────────────────────────

SELECT cron.unschedule('rumvia-expire-jobs')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rumvia-expire-jobs');

SELECT cron.schedule(
  'rumvia-expire-jobs',
  '0 3 * * *',
  $$ SELECT public.expire_old_jobs(); $$
);

SELECT cron.unschedule('rumvia-purge-anon')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rumvia-purge-anon');

SELECT cron.schedule(
  'rumvia-purge-anon',
  '30 3 * * *',
  $$ SELECT public.purge_inactive_anonymous(); $$
);

SELECT cron.unschedule('rumvia-notify-certs')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rumvia-notify-certs');

SELECT cron.schedule(
  'rumvia-notify-certs',
  '0 9 * * 1',
  $$ SELECT public.notify_expiring_certs(); $$
);
