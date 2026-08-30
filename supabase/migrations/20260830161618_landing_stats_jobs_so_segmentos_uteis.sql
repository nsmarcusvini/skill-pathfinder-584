-- "2.138+ Vagas ativas na base" na landing contava TODA job_postings ativa,
-- incluindo as 384 em market_segment='outro' — vagas presenciais fora do
-- Brasil (majoritariamente Arbeitnow/Alemanha: Cost Optimization Manager,
-- Sales Director, Working Student, nem sempre cargos de tecnologia) que
-- nenhuma tela do produto jamais mostra a ninguém. listJobs() já filtra
-- por market_segment (regra 5); só a vitrine pública contava errado.
--
-- 'outro' não é bug do classificador — classifyMarketSegment() (normalize.ts)
-- corretamente separa presencial-fora-do-Brasil de br/remoto_global, que são
-- os dois segmentos que o produto de fato compara. O número da landing deve
-- refletir só o que é navegável.

CREATE OR REPLACE FUNCTION public.landing_stats()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'jobs', (SELECT count(*) FROM public.job_postings
             WHERE is_active AND market_segment IN ('br', 'remoto_global')),
    'skills', (SELECT count(*) FROM public.skills),
    'tracks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key', t.key, 'name', t.name, 'description', t.description)
                       ORDER BY t.sort_order)
      FROM public.career_tracks t WHERE t.is_active
    ), '[]'::jsonb),
    'devops_top_tools', COALESCE((
      SELECT jsonb_agg(x ORDER BY (x->>'share')::numeric DESC)
      FROM (
        SELECT jsonb_build_object(
                 'name', s.canonical_name,
                 'share', round(count(DISTINCT jp.id)::numeric
                          / NULLIF((SELECT count(*) FROM public.job_postings j
                                    JOIN public.career_tracks ct ON ct.id = j.track_id
                                    WHERE ct.key = 'devops' AND j.is_active
                                      AND j.posted_at > now() - interval '90 days'), 0), 3)
               ) AS x
        FROM public.job_posting_skills jps
        JOIN public.job_postings jp ON jp.id = jps.job_posting_id
        JOIN public.career_tracks ct ON ct.id = jp.track_id
        JOIN public.skills s ON s.id = jps.skill_id
        WHERE ct.key = 'devops' AND jp.is_active
          AND jp.posted_at > now() - interval '90 days'
          AND s.is_tool
        GROUP BY s.canonical_name
        ORDER BY count(DISTINCT jp.id) DESC
        LIMIT 5
      ) q
    ), '[]'::jsonb),
    'devops_salary', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'segment', m.market_segment,
               'currency', m.currency,
               'p25', m.p25,
               'p50', m.p50,
               'p75', m.p75,
               'sampleSize', m.sample_size
             ))
      FROM public.mv_salary_stats m
      JOIN public.career_tracks ct ON ct.id = m.track_id
      WHERE ct.key = 'devops' AND m.seniority = 'pleno' AND m.sample_size >= 5
    ), '[]'::jsonb)
  );
$function$;
