-- Salário passa a ser curadoria manual do admin.
--
-- Motivo: a ingestão de vagas gravava salary_observations com track_id vindo de
-- classifyTrack(), que devolve null quando o título da vaga não bate com nenhuma
-- track_role_variants. Na prática 108 das 111 observações nasceram sem trilha, e
-- mv_salary_stats agrupa por track_id descartando nulo — sobravam 3 linhas, todas
-- de fullstack, com amostra 1. Toda trilha que não fosse fullstack via a tela
-- /salarios vazia. As 3 que passavam eram inconsistentes: uma com p50 = 0,00 e
-- outra com market_segment 'br' pagando em USD.
--
-- Decisão do produto: salário é o número que a pessoa leva para negociar, então
-- passa a ser preenchido à mão pelo admin. A ingestão para de gravar salário
-- (o bloco correspondente saiu de src/lib/ingest/pipeline.server.ts) e as
-- observações já gravadas por ela são apagadas. Contribuição de usuário continua
-- existindo e continua entrando como 'pendente' até o admin aprovar.

-- ─── 1. Entrada manual do admin ganha origem própria ─────────────────────────
-- Sem isso a entrada manual teria que se disfarçar de 'user' e a fila de
-- moderação não conseguiria separar o que o admin curou do que veio de fora.

ALTER TABLE public.salary_observations
  DROP CONSTRAINT IF EXISTS salary_observations_source_check;

ALTER TABLE public.salary_observations
  ADD CONSTRAINT salary_observations_source_check
  CHECK (source IN ('posting', 'user', 'admin'));

-- ─── 2. Fora o que a ingestão gravou ─────────────────────────────────────────

DELETE FROM public.salary_observations WHERE source = 'posting';

-- ─── 3. A estatística passa a ter uma régua só ───────────────────────────────
-- Dois defeitos corrigidos de uma vez:
--
-- (a) Período. A view antiga jogava hour, month e year no mesmo percentil sem
--     converter — um salário anual e um mensal no mesmo balde produziam um
--     número que não significa nada. E getSalaryStats não devolve o período,
--     então a tela imprimia o valor sem dizer de que período era. Agora tudo é
--     normalizado para MENSAL (a mesma conta de paraMensal() em admin.functions.ts:
--     ano/12, hora*160) e a tela rotula "/mês".
--
-- (b) Faixa achatada. A view antiga reduzia cada observação ao ponto médio de
--     (amount_min, amount_max). Com curadoria manual o normal é haver uma linha
--     por balde, e uma linha só devolvia p25 = p50 = p75 — a faixa que o admin
--     digitou desaparecia. Agora cada observação entra com os dois extremos como
--     pontos distintos, então uma única linha 12k–18k já produz uma faixa real.
--     sample_size continua contando OBSERVAÇÕES, não pontos.

DROP MATERIALIZED VIEW IF EXISTS public.mv_salary_stats;

CREATE MATERIALIZED VIEW public.mv_salary_stats AS
WITH pontos AS (
  SELECT o.id,
         o.track_id,
         COALESCE(o.seniority, 'nao_informado') AS seniority,
         o.market_segment,
         o.currency,
         -- Normaliza para mensal antes de qualquer percentil.
         CASE o.period
           WHEN 'year' THEN v.valor / 12
           WHEN 'hour' THEN v.valor * 160
           ELSE v.valor
         END AS valor_mensal
  FROM public.salary_observations o
  LEFT JOIN public.job_postings p ON p.id = o.job_posting_id
  CROSS JOIN LATERAL (
    SELECT unnest(array_remove(ARRAY[o.amount_min, o.amount_max], NULL)) AS valor
  ) v
  WHERE o.track_id IS NOT NULL
    AND o.market_segment = ANY (ARRAY['br', 'remoto_global'])
    AND COALESCE(o.amount_min, o.amount_max) IS NOT NULL
    AND o.observed_at >= now() - interval '365 days'
    AND o.status = 'aprovada'
    -- Mantido: se a ingestão de salário for religada um dia, três cópias da
    -- mesma vaga não podem estreitar os percentis.
    AND (o.job_posting_id IS NULL OR p.canonical_job_id IS NULL)
)
SELECT track_id,
       seniority,
       market_segment,
       currency,
       round((percentile_cont(0.25) WITHIN GROUP (
         ORDER BY valor_mensal::double precision))::numeric, 2) AS p25,
       round((percentile_cont(0.50) WITHIN GROUP (
         ORDER BY valor_mensal::double precision))::numeric, 2) AS p50,
       round((percentile_cont(0.75) WITHIN GROUP (
         ORDER BY valor_mensal::double precision))::numeric, 2) AS p75,
       count(DISTINCT id)::integer AS sample_size
FROM pontos
GROUP BY 1, 2, 3, 4;

-- REFRESH ... CONCURRENTLY (em refresh_market_views) exige índice único.
CREATE UNIQUE INDEX uq_mv_salary_stats
  ON public.mv_salary_stats (track_id, seniority, market_segment, currency);

REVOKE ALL ON public.mv_salary_stats FROM PUBLIC, anon;
GRANT SELECT ON public.mv_salary_stats TO authenticated;
GRANT ALL ON public.mv_salary_stats TO service_role;
