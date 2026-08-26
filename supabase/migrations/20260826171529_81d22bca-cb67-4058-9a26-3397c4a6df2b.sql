-- 0008: extração determinística de skills de vagas + curadoria de termos

ALTER TABLE public.job_postings
  ADD COLUMN IF NOT EXISTS skills_extracted_at timestamptz;
CREATE INDEX IF NOT EXISTS job_postings_skills_extracted_idx
  ON public.job_postings (skills_extracted_at NULLS FIRST) WHERE is_active;

-- is_required pode ser desconhecido (fora de seção reconhecida)
ALTER TABLE public.job_posting_skills ALTER COLUMN is_required DROP NOT NULL;
ALTER TABLE public.job_posting_skills ALTER COLUMN is_required DROP DEFAULT;

-- fila de curadoria
ALTER TABLE public.pending_skill_terms
  ADD COLUMN IF NOT EXISTS lang text NOT NULL DEFAULT 'pt',
  ADD COLUMN IF NOT EXISTS first_seen timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_seen timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS example_snippet text,
  ADD COLUMN IF NOT EXISTS distinct_jobs integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suggested_skill_id uuid REFERENCES public.skills(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid;

ALTER TABLE public.pending_skill_terms DROP CONSTRAINT IF EXISTS pending_skill_terms_status_check;
UPDATE public.pending_skill_terms SET status = CASE status
  WHEN 'pending' THEN 'novo' WHEN 'approved' THEN 'aprovado' WHEN 'rejected' THEN 'rejeitado' ELSE status END;
ALTER TABLE public.pending_skill_terms
  ALTER COLUMN status SET DEFAULT 'novo',
  ADD CONSTRAINT pending_skill_terms_status_check
    CHECK (status IN ('novo','aprovado','rejeitado'));
ALTER TABLE public.pending_skill_terms
  ADD CONSTRAINT pending_skill_terms_lang_check CHECK (lang IN ('pt','en','other'));

DELETE FROM public.pending_skill_terms a
  USING public.pending_skill_terms b
  WHERE a.ctid < b.ctid AND lower(a.term) = lower(b.term);
CREATE UNIQUE INDEX IF NOT EXISTS pending_skill_terms_term_key
  ON public.pending_skill_terms (lower(term));

-- blocklist de termos rejeitados
CREATE TABLE IF NOT EXISTS public.skill_term_blocklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term text NOT NULL,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS skill_term_blocklist_term_key
  ON public.skill_term_blocklist (lower(term));
GRANT SELECT ON public.skill_term_blocklist TO authenticated;
GRANT ALL ON public.skill_term_blocklist TO service_role;
ALTER TABLE public.skill_term_blocklist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "blocklist_admin_read" ON public.skill_term_blocklist;
CREATE POLICY "blocklist_admin_read" ON public.skill_term_blocklist
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- log de refresh das views materializadas
CREATE TABLE IF NOT EXISTS public.view_refresh_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  duration_ms integer,
  views_refreshed integer NOT NULL DEFAULT 0,
  error text,
  CONSTRAINT view_refresh_log_status_check CHECK (status IN ('running','success','error'))
);
GRANT SELECT ON public.view_refresh_log TO authenticated;
GRANT ALL ON public.view_refresh_log TO service_role;
ALTER TABLE public.view_refresh_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "view_refresh_log_admin_read" ON public.view_refresh_log;
CREATE POLICY "view_refresh_log_admin_read" ON public.view_refresh_log
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- admins curam a fila
DROP POLICY IF EXISTS "pending_terms_admin_read" ON public.pending_skill_terms;
CREATE POLICY "pending_terms_admin_read" ON public.pending_skill_terms
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));