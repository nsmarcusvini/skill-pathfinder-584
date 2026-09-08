-- =============================================================================
-- Backend e Front-End viram trilhas de primeira classe, separadas de Fullstack.
--
-- O problema NÃO era falta de trilha: `frontend`, `backend` e `qa` existem como
-- dados desde 20260827200000. Era o critério de desempate do classificador.
--
-- `classifyTrack` (src/lib/ingest/pipeline.server.ts) escolhia o termo MAIS
-- LONGO entre os que casam com o título. Como a trilha fullstack tem termos
-- genéricos e compridos ("software engineer", 17 caracteres), eles venciam os
-- específicos e curtos ("backend", 7). Resultado medido antes desta migration:
-- 20 vagas com "Backend"/"Frontend" escrito no próprio título estavam
-- arquivadas em fullstack — por exemplo "Senior Backend Software Engineer - Go".
--
-- A correção é dar PRIORIDADE por variante, e não por tamanho de string:
--   20  fullstack_developer  -> "fullstack" no título é uma afirmação decisiva,
--                               vence até mesmo "react developer"
--   10  variantes específicas (backend, frontend, devops, data, qa...)
--    0  pega-tudo do fullstack (web_developer, product_engineer), cujos termos
--       genéricos só devem valer quando NADA mais específico casar
--
-- Isso preserva as ~89 vagas de título genérico ("Software Engineer") em
-- fullstack — elas continuam sem candidato melhor — e devolve as 20 mal
-- classificadas para as trilhas certas.
--
-- Reclassificar as vagas já ingeridas: `bun run scripts/reclassify-tracks.ts`.
-- =============================================================================

ALTER TABLE public.track_role_variants
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 10;

COMMENT ON COLUMN public.track_role_variants.priority IS
  'Desempate do classificador de título: maior prioridade vence, e só então o termo mais longo. 20 = afirmação decisiva (fullstack), 10 = variante específica, 0 = pega-tudo genérico. Trocar a precedência é UPDATE aqui, não mudança de código.';

-- Pega-tudo: termos genéricos que só valem na ausência de algo mais específico.
UPDATE public.track_role_variants v
SET priority = 0
FROM public.career_tracks t
WHERE t.id = v.track_id
  AND t.key = 'fullstack'
  AND v.key IN ('web_developer', 'product_engineer');

-- "Fullstack" dito no título é uma afirmação sobre o escopo inteiro do cargo:
-- vence variantes específicas que também casem ("Fullstack React Developer"
-- é fullstack, não frontend).
UPDATE public.track_role_variants v
SET priority = 20
FROM public.career_tracks t
WHERE t.id = v.track_id
  AND t.key = 'fullstack'
  AND v.key = 'fullstack_developer';

-- =============================================================================
-- Reativação
--
-- 20260830154619_desativa_trilhas_sem_dado desativou as três porque a ingestão
-- não as alimentava: frontend tinha 0 vagas com skills extraídas, backend 4.
-- Esse motivo caducou — hoje a extração está em 100% das vagas classificadas:
--   backend:  53 vagas, 43 no segmento br  -> acima de MIN_SAMPLE (30), gap honesto
--   frontend: 12 vagas,  2 no segmento br  -> abaixo; sai sempre marcado como
--             low_confidence ("Amostra pequena: precisão menor"), que a UI já
--             exibe em /analise e /dashboard
--
-- (Números de antes da reclassificação; depois dela: backend 70/56, frontend 15/5.)
--
-- `qa` fica desativada de propósito: não foi pedida, e a decisão é de produto.
-- =============================================================================
UPDATE public.career_tracks
SET is_active = true
WHERE key IN ('backend', 'frontend');
