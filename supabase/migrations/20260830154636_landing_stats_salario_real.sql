-- O bloco "Faixa salarial real" da landing exibia R$ 9.200 / US$ 4.800 fixos no
-- código (index.tsx:331-337) enquanto salary_observations estava em zero — a
-- própria seção que promete "não um score inventado" mentia sobre o produto.
--
-- Segue o padrão já usado pelo bloco de ferramentas ao lado (devops_top_tools):
-- landing_stats() devolve o dado real de mv_salary_stats para devops/pleno nos
-- dois segmentos, e o front decide o fallback (EmptyState) quando vier vazio —
-- não landing_stats() inventar um número para não ficar vazio.
--
-- Fixo em devops/pleno de propósito: é a trilha com mais amostra hoje e a
-- landing já usa devops como demo em devops_top_tools; manter os dois no
-- mesmo recorte evita a vitrine comparar trilhas diferentes lado a lado.
--
-- NOTA: esta versão usa piso de amostra >= 3 (limiar de detecção de outlier).
-- Corrigido para >= 5 na migration seguinte, landing_stats_salario_piso_5 —
-- mantida aqui intacta porque foi o que rodou em produção.

CREATE OR REPLACE FUNCTION public.landing_stats()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'jobs', (SELECT count(*) FROM public.job_postings WHERE is_active),
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
      WHERE ct.key = 'devops' AND m.seniority = 'pleno' AND m.sample_size >= 3
    ), '[]'::jsonb)
  );
$function$;
