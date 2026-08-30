-- Prompt 15: estado do tour guiado pós-cadastro (coach marks no menu lateral).
-- Não confundir com profiles.onboarding_completed (wizard de trilha/senioridade/
-- segmento, já existente): o tour roda DEPOIS dele, uma única vez.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tour_status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS tour_step smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tour_updated_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_tour_status_chk
    CHECK (tour_status IN ('pendente','em_andamento','concluido','pulado'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_tour_step_chk
    CHECK (tour_step >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill: quem já é usuário do produto não deve receber o tour no próximo
-- login. Sem isso a base inteira "pendente" veria os 14 passos de uma vez.
UPDATE public.profiles SET tour_status = 'concluido' WHERE tour_status = 'pendente';

-- Nenhuma policy nova: profiles_update_own (auth.uid() = id) já cobre as
-- colunas novas, e o GRANT UPDATE em public.profiles já existe para
-- authenticated (migration 20260826145125_*.sql).
