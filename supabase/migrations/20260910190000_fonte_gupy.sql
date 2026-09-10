-- Gupy como fonte de ingestão (2026-09-10).
--
-- Motivo: era a peça que faltava para estágio e trainee existirem de verdade.
-- A migration 20260910120000 criou os dois níveis em toda a cadeia (CHECKs,
-- classificador, front, baselines), mas o dado nunca veio: em 3.520 vagas havia
-- 23 títulos de estágio/trainee, 4 de tecnologia, e exatamente **1** de
-- tecnologia no segmento `br`. Com `MIN_SAMPLE = 30` isso significa que os dois
-- níveis existiam na interface e só conseguiam devolver `lowConfidence`.
--
-- As fontes que já rodavam não alcançam isso: cinco são remoto-global
-- (Arbeitnow, Jobicy, RemoteOK, Remotive, Himalayas) e o Greenhouse cobre BR
-- mas por board de empresa — sondei 169 tokens, achei 17 válidos, e os ~44
-- estágios deles são de finanças, auditoria, tesouraria e marketing, quase
-- nenhum de engenharia. A maioria das empresas brasileiras não usa Greenhouse.
--
-- O portal da Gupy tem 212 vagas de estágio/trainee acessíveis por busca, com
-- `type` ESTRUTURADO (`vacancy_type_internship` / `vacancy_type_trainee`) em vez
-- de adivinhação por título.
--
-- Sobre a regra 9 do CLAUDE.md: consumir o endpoint público do portal, com
-- `robots.txt` liberando tudo (`Disallow:` vazio, verificado nesta data) e
-- devolvendo tráfego para a página da empresa, é o mesmo padrão de Remotive e
-- Jobicy. Não é o scraping de LinkedIn/Indeed/Glassdoor que a regra proíbe —
-- aquilo envolve contornar antibot e ToS.

-- ── 1. O CHECK precisa aceitar o adapter novo ───────────────────────────────
-- Sem isto o INSERT abaixo é rejeitado inteiro (23514). Vale registrar: a regra 9
-- diz que fonte nova é "1 arquivo novo + linha em job_sources", mas na prática
-- são três passos — o CHECK é o terceiro, e é fácil esquecer dele.

ALTER TABLE public.job_sources DROP CONSTRAINT IF EXISTS job_sources_adapter_check;
ALTER TABLE public.job_sources
  ADD CONSTRAINT job_sources_adapter_check CHECK (adapter IN (
    'greenhouse','lever','ashby','workable','smartrecruiters','recruitee',
    'remotive','remoteok','himalayas','jobicy','arbeitnow','gupy',
    'adzuna','jsearch','manual',
    -- Coleta assíncrona via Bright Data (duas fases).
    'bd_linkedin_jobs','bd_indeed','bd_glassdoor','bd_jobgether','bd_linkedin_posts'
  ));

-- ── 2. A fonte ──────────────────────────────────────────────────────────────
-- `queries` é DADO (regra 1): a API da Gupy busca por termo, não por catálogo,
-- então adicionar "estagio em cibersegurança" é UPDATE aqui, sem deploy.
-- Os termos de júnior entram junto porque a mesma busca que traz estágio traz
-- a faixa de entrada, que também é rasa na base hoje (130 vagas júnior).

INSERT INTO public.job_sources (key, name, adapter, is_active, source_type, config)
VALUES (
  'gupy',
  'Gupy (portal público BR)',
  'gupy',
  true,
  'pull',
  jsonb_build_object(
    'tier', 'A',
    'country', 'BR',
    'market_segment', 'br',
    'queries', jsonb_build_array(
      'estagio desenvolvimento', 'estagio software', 'estagio ti', 'estagio dados',
      'estagio programacao', 'estagio front end', 'estagio back end', 'estagio qa',
      'estagio engenharia de software', 'estagio cloud', 'estagio infraestrutura',
      'estagio seguranca da informacao', 'estagio analista de sistemas',
      'trainee desenvolvimento', 'trainee ti', 'trainee dados', 'trainee tecnologia',
      'desenvolvedor junior', 'analista de dados junior', 'devops junior'
    )
  )
)
ON CONFLICT (key) DO NOTHING;
