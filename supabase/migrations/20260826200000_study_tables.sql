-- ============================== study_plans
CREATE TABLE IF NOT EXISTS public.study_plans (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id     uuid REFERENCES public.career_tracks(id) ON DELETE SET NULL,
  title        text NOT NULL,
  description  text,
  target_date  date,
  status       text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','pausado','concluido')),
  created_at   timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_plans TO authenticated;
GRANT ALL ON public.study_plans TO service_role;
ALTER TABLE public.study_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sp_own" ON public.study_plans USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE);
CREATE INDEX IF NOT EXISTS idx_sp_user ON public.study_plans (user_id);

-- ============================== study_items
CREATE TABLE IF NOT EXISTS public.study_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id            uuid NOT NULL REFERENCES public.study_plans(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id           uuid REFERENCES public.skills(id) ON DELETE SET NULL,
  title              text NOT NULL,
  type               text NOT NULL DEFAULT 'outro'
                       CHECK (type IN ('curso','certificacao','projeto','leitura','lab','outro')),
  resource_url       text,
  status             text NOT NULL DEFAULT 'backlog'
                       CHECK (status IN ('backlog','em_andamento','concluido')),
  priority           integer NOT NULL DEFAULT 0,
  estimated_hours    numeric(6,1),
  spent_hours        numeric(6,1) NOT NULL DEFAULT 0,
  progress_percent   integer NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  start_date         date,
  due_date           date,
  completed_at       timestamptz,
  notes              text,
  source_gap_item_id uuid,
  created_at         timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_items TO authenticated;
GRANT ALL ON public.study_items TO service_role;
ALTER TABLE public.study_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "si_own" ON public.study_items USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE);
CREATE INDEX IF NOT EXISTS idx_si_plan ON public.study_items (plan_id);
CREATE INDEX IF NOT EXISTS idx_si_user ON public.study_items (user_id);

-- ============================== study_logs
CREATE TABLE IF NOT EXISTS public.study_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    uuid NOT NULL REFERENCES public.study_items(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  logged_at  date NOT NULL DEFAULT CURRENT_DATE,
  hours      numeric(5,2) NOT NULL DEFAULT 0,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_logs TO authenticated;
GRANT ALL ON public.study_logs TO service_role;
ALTER TABLE public.study_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sl_own" ON public.study_logs USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE);
CREATE INDEX IF NOT EXISTS idx_sl_item ON public.study_logs (item_id);
CREATE INDEX IF NOT EXISTS idx_sl_user_date ON public.study_logs (user_id, logged_at);
