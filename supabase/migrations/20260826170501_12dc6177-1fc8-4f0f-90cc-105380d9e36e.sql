-- 0005: portas de entrada de ingestão (pull/push) + admin

ALTER TABLE public.job_sources
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'pull',
  ADD COLUMN IF NOT EXISTS ingest_token_hash text;

DO $$ BEGIN
  ALTER TABLE public.job_sources
    ADD CONSTRAINT job_sources_source_type_chk CHECK (source_type IN ('pull','push'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _user_id AND p.is_admin = true);
$$;

DROP POLICY IF EXISTS "job_sources_admin_select" ON public.job_sources;
CREATE POLICY "job_sources_admin_select" ON public.job_sources
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "ingestion_runs_admin_select" ON public.ingestion_runs;
CREATE POLICY "ingestion_runs_admin_select" ON public.ingestion_runs
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

GRANT SELECT ON public.job_sources TO authenticated;
GRANT SELECT ON public.ingestion_runs TO authenticated;
GRANT ALL ON public.job_sources TO service_role;
GRANT ALL ON public.ingestion_runs TO service_role;

CREATE INDEX IF NOT EXISTS job_postings_source_external_idx
  ON public.job_postings (source_id, external_id);
CREATE INDEX IF NOT EXISTS job_postings_ingested_at_idx
  ON public.job_postings (ingested_at);