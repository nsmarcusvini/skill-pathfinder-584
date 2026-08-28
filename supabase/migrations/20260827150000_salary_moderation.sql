-- Moderação de contribuições de salário.
--
-- Qualquer conta permanente pode contribuir, mas o dado só entra na estatística
-- depois que um administrador aprova. Sem isso, uma contribuição errada (ou
-- maliciosa) desloca a mediana da trilha e o produto passa a mentir para todo
-- mundo — e a mediana salarial é justamente o número que as pessoas usam para
-- negociar.
--
-- Observação vinda de vaga (source='posting') nasce aprovada: tem origem
-- rastreável, o payload bruto fica em job_posting_raw.

ALTER TABLE public.salary_observations
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pendente';

DO $$ BEGIN
  ALTER TABLE public.salary_observations
    ADD CONSTRAINT salary_observations_status_check
    CHECK (status IN ('pendente', 'aprovada', 'rejeitada'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.salary_observations
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_note text;

-- Tudo que existe hoje veio de vaga.
UPDATE public.salary_observations SET status = 'aprovada' WHERE source = 'posting';

CREATE INDEX IF NOT EXISTS salary_observations_pendentes_idx
  ON public.salary_observations (status, observed_at DESC)
  WHERE status = 'pendente';

-- ─── A estatística passa a olhar só o aprovado ────────────────────────────────
-- getSalaryStats e getSalarySkillImpact leem exclusivamente desta view, então
-- filtrar aqui basta para o pendente não aparecer em nenhuma tela.

DROP MATERIALIZED VIEW IF EXISTS public.mv_salary_stats;

CREATE MATERIALIZED VIEW public.mv_salary_stats AS
SELECT o.track_id,
       COALESCE(o.seniority, 'nao_informado') AS seniority,
       o.market_segment,
       o.currency,
       round(percentile_cont(0.25) WITHIN GROUP (
         ORDER BY COALESCE((o.amount_min + o.amount_max)/2, o.amount_min, o.amount_max))::numeric, 2) AS p25,
       round(percentile_cont(0.50) WITHIN GROUP (
         ORDER BY COALESCE((o.amount_min + o.amount_max)/2, o.amount_min, o.amount_max))::numeric, 2) AS p50,
       round(percentile_cont(0.75) WITHIN GROUP (
         ORDER BY COALESCE((o.amount_min + o.amount_max)/2, o.amount_min, o.amount_max))::numeric, 2) AS p75,
       count(*)::integer AS sample_size
FROM public.salary_observations o
WHERE o.track_id IS NOT NULL
  AND o.market_segment IN ('br','remoto_global')
  AND COALESCE(o.amount_min, o.amount_max) IS NOT NULL
  AND o.observed_at >= now() - interval '365 days'
  AND o.status = 'aprovada'
GROUP BY 1,2,3,4;

CREATE UNIQUE INDEX uq_mv_salary_stats
  ON public.mv_salary_stats (track_id, seniority, market_segment, currency);

REVOKE ALL ON public.mv_salary_stats FROM PUBLIC, anon;
GRANT SELECT ON public.mv_salary_stats TO authenticated;
GRANT ALL ON public.mv_salary_stats TO service_role;

-- ─── RLS ──────────────────────────────────────────────────────────────────────

-- Leitura: mercado aprovado + as próprias contribuições, em qualquer status
-- (quem contribuiu precisa ver que está pendente).
DROP POLICY IF EXISTS "salary_observations_read_market" ON public.salary_observations;
CREATE POLICY "salary_observations_read_market"
  ON public.salary_observations
  FOR SELECT TO authenticated
  USING (
    (source = 'posting' AND status = 'aprovada')
    OR user_id = auth.uid()
  );

-- Escrita: só a própria linha, só source='user', só conta permanente, e
-- OBRIGATORIAMENTE como 'pendente' — ninguém aprova a própria contribuição.
DROP POLICY IF EXISTS "salary_observations_insert_own" ON public.salary_observations;
CREATE POLICY "salary_observations_insert_own"
  ON public.salary_observations
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND source = 'user'
    AND status = 'pendente'
    AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE
  );

-- Retirar a própria contribuição continua permitido.
DROP POLICY IF EXISTS "salary_observations_delete_own" ON public.salary_observations;
CREATE POLICY "salary_observations_delete_own"
  ON public.salary_observations
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND source = 'user');

-- Moderação (aprovar, corrigir, excluir de terceiros) é feita pelas server
-- functions de admin com service_role, que ignora RLS — mesmo padrão do resto
-- do admin. Por isso não há policy de UPDATE para authenticated: o usuário não
-- pode editar a própria contribuição depois de enviada, só retirá-la.
