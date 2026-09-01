-- "Gerar das minhas lacunas" precisa achar de volta o plano que ele mesmo criou,
-- pra não duplicar plano a cada clique (era exatamente isso que acontecia antes:
-- generatePlanFromGap sempre fazia INSERT de um study_plans novo). Um plano
-- criado manualmente pelo usuário na mesma trilha não pode ser confundido com
-- o plano gerado — daí o marcador explícito em vez de inferir pelo título.
ALTER TABLE public.study_plans
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'gap_generated'));

CREATE INDEX IF NOT EXISTS idx_sp_user_track_source
  ON public.study_plans (user_id, track_id, source);
