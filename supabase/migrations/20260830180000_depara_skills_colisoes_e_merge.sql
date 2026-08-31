-- De-para de skills: colisões de alias, aliases-ruído e fusão de duplicata.
--
-- Contexto (tudo medido na base, não suposto):
--
-- 1) COLISÃO nome-canônico × alias. Cinco skills tinham o próprio nome canônico
--    cadastrado como alias de OUTRA skill. Como o matcher resolve o termo para as
--    duas, o MESMO termo gerava DOIS vínculos e cada um levava peso próprio para o
--    denominador do gap. Sobreposição medida:
--      Serverless + AWS Lambda ............ 30 de 30 vagas (100%)
--      Ruby on Rails + Ruby ...............  5 de  5 vagas (100%)
--      Mensageria + Kafka ................. 35 de 36 vagas ( 97%)
--      Design Patterns + Arquitetura ...... 31 de 32 vagas ( 97%)
--      Great Expectations + Data Quality ..  2 de  3 vagas
--    O termo geral pertence à skill geral; o alias sai da skill específica que o
--    tinha herdado de antes de a skill geral existir.
--
-- 2) ALIASES-RUÍDO, confirmados vendo a vaga que casou:
--      'orm' -> Prisma ......... 5 vagas, todas .NET/Laravel/Vue. ORM é conceito
--                                genérico; Prisma é um ORM específico de TypeScript.
--      'ha'  -> Escalabilidade . casou em "Gardener NUSC" (vaga de jardineiro).
--                                Sem acento, o "há" do português vira "ha".
--      'ge'  -> Great Expect. .. casou em "Head of Sales". Alias de 2 letras já
--                                tinha causado 1.038 falsos antes da correção do
--                                regex; não há motivo para mantê-lo.
--
-- 3) DUPLICATA REAL: 'Bash' e 'Shell Linux' são a mesma competência e estavam
--    ambas no baseline sênior de DevOps (importância 95 e 88, nível exigido 5 e 5)
--    — as duas entradas mais pesadas da trilha, contando a mesma coisa duas vezes.
--    Os 3 usuários que tinham Shell Linux tinham Bash também (100%). Fica 'Bash',
--    que absorve os aliases de linha de comando.
--
-- Depois desta migration é OBRIGATÓRIO reprocessar a extração:
--   UPDATE public.job_postings SET skills_extracted_at = NULL;
--   bun run scripts/extract-skills.ts
--   SELECT public.refresh_market_views();

BEGIN;

-- ---------------------------------------------------------------- 1) colisões
DELETE FROM public.skill_aliases a
USING public.skills dono
WHERE a.skill_id = dono.id
  AND (dono.canonical_name, lower(a.alias)) IN (
    ('Arquitetura de Software', 'design patterns'),
    ('Data Quality',            'great expectations'),
    ('Kafka',                   'mensageria'),
    ('Ruby',                    'ruby on rails')
  );

DELETE FROM public.skill_aliases a
USING public.skills dono
WHERE a.skill_id = dono.id
  AND dono.canonical_name = 'AWS Lambda'
  AND lower(a.alias) IN ('serverless', 'funções serverless', 'computação sem servidor');

-- 'rails' apontava para a linguagem; pertence ao framework.
UPDATE public.skill_aliases
SET skill_id = (SELECT id FROM public.skills WHERE canonical_name = 'Ruby on Rails')
WHERE lower(alias) = 'rails'
  AND skill_id = (SELECT id FROM public.skills WHERE canonical_name = 'Ruby');

-- --------------------------------------------------------- 2) aliases-ruído
DELETE FROM public.skill_aliases a
USING public.skills dono
WHERE a.skill_id = dono.id
  AND (dono.canonical_name, lower(a.alias)) IN (
    ('Prisma',             'orm'),
    ('Escalabilidade',     'ha'),
    ('Great Expectations', 'ge')
  );

-- ------------------------------------------- 3) Shell Linux -> Bash (fusão)
DO $$
DECLARE
  v_bash  uuid := (SELECT id FROM public.skills WHERE canonical_name = 'Bash');
  v_shell uuid := (SELECT id FROM public.skills WHERE canonical_name = 'Shell Linux');
BEGIN
  IF v_bash IS NULL OR v_shell IS NULL THEN
    RAISE NOTICE 'Bash ou Shell Linux não encontrada; fusão ignorada.';
    RETURN;
  END IF;

  -- user_skills: fica o MAIOR nível — o usuário demonstrou aquele nível em algum
  -- lugar, e rebaixá-lo por causa de uma duplicata do catálogo seria injusto.
  UPDATE public.user_skills b
  SET level = GREATEST(b.level, s.level),
      years = GREATEST(COALESCE(b.years, 0), COALESCE(s.years, 0)),
      updated_at = now()
  FROM public.user_skills s
  WHERE s.skill_id = v_shell AND b.skill_id = v_bash AND b.user_id = s.user_id;

  UPDATE public.user_skills SET skill_id = v_bash, updated_at = now()
  WHERE skill_id = v_shell
    AND NOT EXISTS (SELECT 1 FROM public.user_skills b
                    WHERE b.user_id = user_skills.user_id AND b.skill_id = v_bash);
  DELETE FROM public.user_skills WHERE skill_id = v_shell;

  -- job_posting_skills: soma as menções quando a vaga já tinha as duas.
  UPDATE public.job_posting_skills b
  SET mention_count = COALESCE(b.mention_count, 0) + COALESCE(s.mention_count, 0),
      is_required = b.is_required OR s.is_required
  FROM public.job_posting_skills s
  WHERE s.skill_id = v_shell AND b.skill_id = v_bash
    AND b.job_posting_id = s.job_posting_id;

  UPDATE public.job_posting_skills SET skill_id = v_bash
  WHERE skill_id = v_shell
    AND NOT EXISTS (SELECT 1 FROM public.job_posting_skills b
                    WHERE b.job_posting_id = job_posting_skills.job_posting_id
                      AND b.skill_id = v_bash);
  DELETE FROM public.job_posting_skills WHERE skill_id = v_shell;

  -- baselines: onde as duas existem fica a maior exigência; onde só Shell existe,
  -- a linha é repontada para Bash.
  UPDATE public.track_skill_baselines b
  SET importance = GREATEST(b.importance, s.importance),
      required_level = GREATEST(b.required_level, s.required_level),
      is_core = b.is_core OR s.is_core
  FROM public.track_skill_baselines s
  WHERE s.skill_id = v_shell AND b.skill_id = v_bash
    AND b.track_id = s.track_id AND b.seniority = s.seniority;

  UPDATE public.track_skill_baselines SET skill_id = v_bash
  WHERE skill_id = v_shell
    AND NOT EXISTS (SELECT 1 FROM public.track_skill_baselines b
                    WHERE b.track_id = track_skill_baselines.track_id
                      AND b.seniority = track_skill_baselines.seniority
                      AND b.skill_id = v_bash);
  DELETE FROM public.track_skill_baselines WHERE skill_id = v_shell;

  -- aliases da Shell Linux passam para Bash (o alias é UNIQUE global, então só
  -- migra o que Bash ainda não tem).
  UPDATE public.skill_aliases SET skill_id = v_bash
  WHERE skill_id = v_shell
    AND lower(alias) NOT IN (SELECT lower(alias) FROM public.skill_aliases WHERE skill_id = v_bash);
  DELETE FROM public.skill_aliases WHERE skill_id = v_shell;

  -- gap_analysis_items é fotografia de análise antiga e será recalculada; a linha
  -- da skill que deixa de existir simplesmente sai.
  DELETE FROM public.gap_analysis_items WHERE skill_id = v_shell;

  DELETE FROM public.skills WHERE id = v_shell;
END $$;

COMMIT;
