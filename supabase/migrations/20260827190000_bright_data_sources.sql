-- Registra as fontes Bright Data no catálogo.
--
-- job_sources.adapter tem CHECK com a lista fechada de adapters. Isso significa
-- que adicionar fonte nova exige migration, apesar de o CLAUDE.md descrever
-- "fonte nova = 1 arquivo + 1 linha em job_sources". Mantive o CHECK em vez de
-- removê-lo: ele pega justamente o erro de cadastrar uma fonte cujo adapter não
-- existe no código, que viraria execução falhando em silêncio. O custo é uma
-- migration por fonte nova, e está documentado em docs/ADICIONAR_FONTE.md.

ALTER TABLE public.job_sources DROP CONSTRAINT IF EXISTS job_sources_adapter_check;
ALTER TABLE public.job_sources
  ADD CONSTRAINT job_sources_adapter_check CHECK (adapter IN (
    'greenhouse','lever','ashby','workable','smartrecruiters','recruitee',
    'remotive','remoteok','himalayas','jobicy','arbeitnow',
    'adzuna','jsearch','manual',
    -- Coleta assíncrona via Bright Data (duas fases).
    'bd_linkedin_jobs','bd_indeed','bd_glassdoor','bd_jobgether','bd_linkedin_posts'
  ));

-- As fontes entram DESATIVADAS de propósito: sem dataset_id (que sai do painel
-- da conta) e sem BRIGHT_DATA_API_KEY, disparar só gastaria chamada e falharia.
-- Ficam visíveis no admin com o motivo, em vez de simplesmente não existir.
INSERT INTO public.job_sources (key, name, adapter, source_type, config, is_active, error_message) VALUES
  ('bd_linkedin_jobs', 'Bright Data — LinkedIn Jobs', 'bd_linkedin_jobs', 'pull',
   jsonb_build_object('tier','C','paid',true,'provider','bright_data',
     'discover_inputs', jsonb_build_array(jsonb_build_object('keyword','devops','location','Brazil')),
     'limit_per_input', 50, 'country','BR'),
   false, 'Falta dataset_id (painel Bright Data) e BRIGHT_DATA_API_KEY.'),

  ('bd_indeed', 'Bright Data — Indeed', 'bd_indeed', 'pull',
   jsonb_build_object('tier','C','paid',true,'provider','bright_data',
     'discover_inputs', jsonb_build_array(jsonb_build_object('keyword','devops','location','Brazil')),
     'limit_per_input', 50, 'country','BR'),
   false, 'Falta dataset_id (painel Bright Data) e BRIGHT_DATA_API_KEY.'),

  ('bd_glassdoor', 'Bright Data — Glassdoor Jobs', 'bd_glassdoor', 'pull',
   jsonb_build_object('tier','C','paid',true,'provider','bright_data',
     'discover_inputs', jsonb_build_array(jsonb_build_object('keyword','devops','location','Brazil')),
     'limit_per_input', 50, 'country','BR'),
   false, 'Falta dataset_id (painel Bright Data) e BRIGHT_DATA_API_KEY.'),

  ('bd_jobgether', 'JobGether (indisponivel na Bright Data)', 'bd_jobgether', 'pull',
   jsonb_build_object('tier','C','provider','none'),
   false, 'A Bright Data nao oferece dataset/scraper para JobGether (verificado 2026-08-27). Requer API propria, feed ou acordo direto com a fonte.')
ON CONFLICT (key) DO NOTHING;
