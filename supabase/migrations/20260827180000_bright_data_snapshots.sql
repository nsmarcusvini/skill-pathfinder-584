-- Coleta assíncrona via Bright Data.
--
-- O contrato JobAdapter.fetchJobs() é síncrono: devolve as vagas numa chamada.
-- A Bright Data não é — dispara, devolve um snapshot_id, e os dados ficam
-- prontos minutos depois. Esperar em polling dentro do fetchJobs bloquearia a
-- execução, estouraria timeout de serverless e perderia tudo se o processo
-- caísse no meio.
--
-- Esta tabela quebra a coleta em duas fases duráveis:
--   fase 1 (disparo)  -> grava o snapshot como 'starting'
--   fase 2 (colheita) -> consulta o progresso; quando 'ready', baixa e ingere
--
-- Assim a coleta sobrevive a reinício, e o mesmo snapshot nunca é ingerido duas
-- vezes (ingested_at + unique em provider_snapshot_id).

CREATE TABLE IF NOT EXISTS public.provider_snapshots (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id            uuid NOT NULL REFERENCES public.job_sources(id) ON DELETE CASCADE,
  provider             text NOT NULL DEFAULT 'bright_data',
  -- snapshot_id devolvido pelo provedor. Unique: é a chave de idempotência.
  provider_snapshot_id text NOT NULL,
  dataset_id           text,
  -- Espelha os status da API: starting | running | ready | failed | canceled.
  -- 'ingested' é nosso, e marca que os dados já passaram pelo pipeline.
  status               text NOT NULL DEFAULT 'starting'
                         CHECK (status IN ('starting','running','ready','failed','canceled','ingested')),
  -- O que foi pedido, para auditoria e para reproduzir a coleta.
  request              jsonb NOT NULL DEFAULT '{}'::jsonb,
  records_downloaded   integer NOT NULL DEFAULT 0,
  jobs_created         integer NOT NULL DEFAULT 0,
  jobs_updated         integer NOT NULL DEFAULT 0,
  jobs_rejected        integer NOT NULL DEFAULT 0,
  error                text,
  -- Quantas vezes já consultamos o progresso: trava um snapshot preso para
  -- sempre em 'running' consumindo chamada a cada ciclo do cron.
  poll_count           integer NOT NULL DEFAULT 0,
  triggered_at         timestamptz NOT NULL DEFAULT now(),
  last_polled_at       timestamptz,
  ingested_at          timestamptz,
  UNIQUE (provider, provider_snapshot_id)
);

CREATE INDEX IF NOT EXISTS provider_snapshots_pendentes_idx
  ON public.provider_snapshots (status, triggered_at)
  WHERE status IN ('starting','running','ready');

CREATE INDEX IF NOT EXISTS provider_snapshots_source_idx
  ON public.provider_snapshots (source_id, triggered_at DESC);

-- Escrita só por service_role: é tabela de operação, como job_posting_raw.
GRANT ALL ON public.provider_snapshots TO service_role;
GRANT SELECT ON public.provider_snapshots TO authenticated;
ALTER TABLE public.provider_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "provider_snapshots_admin_read" ON public.provider_snapshots;
CREATE POLICY "provider_snapshots_admin_read"
  ON public.provider_snapshots
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- ─── Campos que a Bright Data entrega e job_postings ainda não guardava ──────
--
-- Não incluí colunas de array para linguagens/cloud/frameworks/bancos: isso já
-- é modelado por job_posting_skills + skill_categories, que tem exatamente
-- essas categorias. Duplicar quebraria o matcher único (regra 4).

ALTER TABLE public.job_postings
  -- is_remote é booleano e não distingue híbrido de presencial.
  ADD COLUMN IF NOT EXISTS work_modality text,
  ADD COLUMN IF NOT EXISTS requirements_text text,
  ADD COLUMN IF NOT EXISTS benefits_text text,
  ADD COLUMN IF NOT EXISTS qualifications_text text,
  -- apply_url é o link de candidatura; este é o anúncio em si.
  ADD COLUMN IF NOT EXISTS source_url text,
  -- id da vaga na plataforma de origem, distinto de external_id (que é nosso,
  -- escopado por source_id).
  ADD COLUMN IF NOT EXISTS source_job_id text,
  -- Quando a fonte diz que a vaga mudou.
  ADD COLUMN IF NOT EXISTS source_updated_at timestamptz,
  -- Última vez que a vaga foi VISTA na coleta. is_active vira false quando
  -- para de aparecer; last_seen_at é o que sustenta essa decisão.
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  -- Ciclo de vida explícito, em vez de só is_active.
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'ativa',
  -- Aponta para o registro canônico quando a MESMA vaga vem de duas fontes
  -- (LinkedIn e Indeed). NULL = este é o canônico.
  ADD COLUMN IF NOT EXISTS canonical_job_id uuid REFERENCES public.job_postings(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE public.job_postings
    ADD CONSTRAINT job_postings_work_modality_chk
    CHECK (work_modality IS NULL OR work_modality IN ('remoto','hibrido','presencial'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.job_postings
    ADD CONSTRAINT job_postings_lifecycle_chk
    CHECK (lifecycle_status IN ('ativa','expirada','removida','preenchida'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill coerente com o que já existe.
UPDATE public.job_postings
SET last_seen_at = COALESCE(last_seen_at, ingested_at),
    lifecycle_status = CASE WHEN is_active THEN 'ativa' ELSE 'expirada' END,
    work_modality = COALESCE(work_modality, CASE WHEN is_remote THEN 'remoto' ELSE NULL END)
WHERE last_seen_at IS NULL OR work_modality IS NULL;

CREATE INDEX IF NOT EXISTS job_postings_canonical_idx
  ON public.job_postings (canonical_job_id) WHERE canonical_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS job_postings_last_seen_idx
  ON public.job_postings (last_seen_at) WHERE is_active;
