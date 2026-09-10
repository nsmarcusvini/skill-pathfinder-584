-- Estagiário e Trainee viram níveis de senioridade próprios (2026-09-10).
--
-- Antes, os dois existiam nos dados mas eram ACHATADOS dentro de 'junior', de
-- propósito: tanto a regra do parser de CV quanto a da ingestão casavam
-- /trainee|estagio|intern/ e gravavam 'junior', porque o CHECK abaixo só
-- aceitava quatro valores. Quem procurava vaga de estágio via "Júnior".
--
-- A escala passa a ser, do menor para o maior:
--   estagiario < trainee < junior < pleno < senior < staff
--
-- A ORDEM desta migration importa: o CHECK tem de aceitar os valores novos
-- ANTES de o classificador começar a emiti-los. Emitir um valor fora do CHECK
-- não degrada — faz o INSERT da vaga ser rejeitado inteiro.

-- ── 1. CHECKs de senioridade ────────────────────────────────────────────────
-- Mantida a forma original de cada um (inclusive o `IS NULL OR` de cv_versions):
-- aqui só entram os dois valores novos.

alter table public.profiles drop constraint profiles_seniority_check;
alter table public.profiles add constraint profiles_seniority_check
  check (seniority = any (array['estagiario'::text, 'trainee'::text, 'junior'::text, 'pleno'::text, 'senior'::text, 'staff'::text]));

alter table public.job_postings drop constraint job_postings_seniority_check;
alter table public.job_postings add constraint job_postings_seniority_check
  check (seniority = any (array['estagiario'::text, 'trainee'::text, 'junior'::text, 'pleno'::text, 'senior'::text, 'staff'::text]));

alter table public.salary_observations drop constraint salary_observations_seniority_check;
alter table public.salary_observations add constraint salary_observations_seniority_check
  check (seniority = any (array['estagiario'::text, 'trainee'::text, 'junior'::text, 'pleno'::text, 'senior'::text, 'staff'::text]));

alter table public.track_skill_baselines drop constraint track_skill_baselines_seniority_check;
alter table public.track_skill_baselines add constraint track_skill_baselines_seniority_check
  check (seniority = any (array['estagiario'::text, 'trainee'::text, 'junior'::text, 'pleno'::text, 'senior'::text, 'staff'::text]));

alter table public.user_track_preferences drop constraint user_track_preferences_seniority_target_check;
alter table public.user_track_preferences add constraint user_track_preferences_seniority_target_check
  check (seniority_target = any (array['estagiario'::text, 'trainee'::text, 'junior'::text, 'pleno'::text, 'senior'::text, 'staff'::text]));

alter table public.cv_versions drop constraint cv_versions_seniority_check;
alter table public.cv_versions add constraint cv_versions_seniority_check
  check ((detected_seniority is null) or (detected_seniority = any (array['estagiario'::text, 'trainee'::text, 'junior'::text, 'pleno'::text, 'senior'::text, 'staff'::text])));

-- ── 2. Marca de baseline provisório ─────────────────────────────────────────
-- Os baselines dos dois níveis novos são DERIVADOS, não curados: ninguém
-- decidiu skill a skill o que se espera de um estagiário de Front-End. A
-- coluna existe para que isso seja consultável (e revisável) em vez de virar
-- folclore — não para mudar o cálculo, que ignora o campo.

alter table public.track_skill_baselines
  add column if not exists is_provisional boolean not null default false;

comment on column public.track_skill_baselines.is_provisional is
  'true = valor derivado automaticamente, ainda sem curadoria humana. Ver migration 20260910120000.';

-- ── 3. Baselines derivados de junior ────────────────────────────────────────
-- O fator vai em `importance` — que é o que a fórmula do gap chama de
-- baseline_importance (peso = 0.7*demanda + 0.3*(importance/100)) e a única
-- coluna com resolução para isso: importance vai de 8 a 84, enquanto
-- required_level só assume 0, 1 ou 2. Escalar required_level por 0.5/0.75
-- devolveria praticamente os mesmos números do júnior.
--
-- `required_level` e `is_core` são COPIADOS: as skills que importam para a
-- trilha são as mesmas: o que muda é o quanto se cobra delas.

insert into public.track_skill_baselines
  (track_id, skill_id, seniority, importance, required_level, is_core, is_provisional)
select
  b.track_id,
  b.skill_id,
  n.seniority,
  round(b.importance * n.fator)::smallint,
  b.required_level,
  b.is_core,
  true
from public.track_skill_baselines b
cross join (values ('estagiario', 0.50), ('trainee', 0.75)) as n(seniority, fator)
where b.seniority = 'junior'
on conflict (track_id, skill_id, seniority) do nothing;
