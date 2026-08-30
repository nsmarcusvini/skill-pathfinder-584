-- expire_old_jobs() falhava em 3 de 3 execuções do cron: referenciava
-- created_at, coluna que não existe em job_postings (a tabela usa
-- last_seen_at, ingested_at, posted_at). Provavelmente sobrou de uma versão
-- anterior — a mesma função já foi corrigida uma vez (comentário no código
-- fala em "passou a olhar last_seen_at"), mas a definição em produção nunca
-- acompanhou. Sem correção, em ~90 dias vagas removidas das fontes
-- continuariam is_active=true para sempre.

CREATE OR REPLACE FUNCTION public.expire_old_jobs()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _count integer;
BEGIN
  UPDATE public.job_postings
  SET is_active = false
  WHERE is_active = true
    AND last_seen_at < now() - interval '45 days';

  GET DIAGNOSTICS _count = ROW_COUNT;

  INSERT INTO public.app_settings (key, value)
  VALUES ('jobs_expired_last_run', to_jsonb(now()::text))
  ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now();

  RETURN _count;
END;
$function$;

-- is_admin() era chamável por anon via RPC — permite sondar, sem login, se um
-- UUID arbitrário é administrador. Toda leitura interna já usa is_admin()
-- diretamente em SQL (SECURITY DEFINER resolve dentro das policies), nenhum
-- código do app chama a RPC pelo client anônimo — revogar não quebra nada.
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon;

-- As três materialized views de mercado eram legíveis com a chave publishable
-- (anon) — todo o dataset de skill/ferramenta/empresa por trilha saía sem
-- login. As únicas leituras do produto passam por market.functions.ts, que
-- exige requireSupabaseAuth (regra: toda server function valida auth); nada
-- no client anônimo lê estas views diretamente.
REVOKE ALL ON public.mv_skill_demand_by_track FROM anon;
REVOKE ALL ON public.mv_tool_demand FROM anon;
REVOKE ALL ON public.mv_company_hiring FROM anon;
