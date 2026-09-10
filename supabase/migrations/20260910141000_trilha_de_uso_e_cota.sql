-- =============================================================================
-- Trilha de uso da conta paga + cota diária.
--
-- POR QUE ISTO EXISTE
-- Duas necessidades diferentes que se resolvem com a mesma tabela:
--
-- 1. PROVA. Num chargeback o Asaas pede evidência de entrega; num Procon, de
--    que o serviço foi prestado. Hoje o RUMVIA não tem nada disso — só
--    `parse_rate_limits`, que conta a PRÉVIA grátis e some em uma hora. Sem
--    trilha, "achamos que ele abusou" é palpite; com trilha é "no dia 3 abriu
--    180 vagas e clicou em 140 links".
--
-- 2. COTA. O teto diário do item 3 precisa de um contador por dia, e seria
--    bobagem criar um segundo. `usage_daily` é a prova E o contador: uma
--    escrita serve aos dois, e o contador nunca discorda do relatório.
--
-- POR QUE DUAS TABELAS
-- `usage_events` é o detalhe (qual vaga, quando, de qual rede) e CASCATEIA com
-- a conta: quem exclui a conta leva o detalhe junto, como a LGPD espera.
-- `usage_daily` é o agregado (quantos, por dia, de que tipo) e NÃO tem FK:
-- sobrevive à exclusão. Isso não é contradição — é o art. 16, II da LGPD, que
-- permite conservar o mínimo necessário para exercício regular de direitos em
-- processo. E é justamente o que se precisa: o chargeback costuma chegar
-- semanas DEPOIS, quando a conta já não existe, e o que defende é o número por
-- dia, não o id de cada vaga aberta.
--
-- Declarar em /privacidade não é opcional — trilha não declarada é o tipo de
-- coisa que vira o problema em vez de resolver um.
-- =============================================================================

-- ============================== usage_events (detalhe, efêmero)
CREATE TABLE IF NOT EXISTS public.usage_events (
  -- bigint e não uuid: é log de alto volume, append-only, lido por intervalo de
  -- tempo. uuid v4 aqui só engordaria o índice sem dar nada em troca.
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Vocabulário (sem CHECK de propósito: evento novo não deveria exigir
  -- migration): job_list, job_detail, apply_click, company_detail, salary_view,
  -- tool_detail, learning_catalog, cv_parse.
  event_type  text NOT NULL,

  -- Id da vaga/empresa/ferramenta, quando faz sentido. text e não uuid porque
  -- nem todo assunto é uuid.
  subject_id  text,

  -- Mesma função e mesmo formato do ip_hash de parse_rate_limits: distingue
  -- automação de uso humano sem guardar o IP em claro.
  ip_hash     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_user_time
  ON public.usage_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_time
  ON public.usage_events (created_at);

COMMENT ON TABLE public.usage_events IS
  'Detalhe do uso da conta paga. Cascateia com a conta (LGPD) e é expurgado por usage_retention_days. O que sobrevive para defesa em chargeback é usage_daily.';

-- ============================== usage_daily (agregado, sobrevive)
CREATE TABLE IF NOT EXISTS public.usage_daily (
  -- SEM foreign key, pelo mesmo motivo de resubscribe_blocks.user_id: a defesa
  -- precisa continuar existindo depois que a conta foi excluída.
  user_id     uuid  NOT NULL,
  day         date  NOT NULL,
  event_type  text  NOT NULL,
  count       integer NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day, event_type)
);

COMMENT ON TABLE public.usage_daily IS
  'Uso por dia e por tipo. É a prova de entrega em chargeback/Procon E o contador da cota diária — uma escrita só, para os dois números nunca divergirem.';

-- ============================== leitura própria
-- O titular pode ver o próprio uso (LGPD, direito de acesso). Só o agregado:
-- é o que responde "o que vocês guardam sobre mim" sem transformar a tabela de
-- detalhe num endpoint de consulta. Conta permanente apenas (regra 6).
GRANT SELECT ON public.usage_daily TO authenticated;
GRANT ALL    ON public.usage_daily  TO service_role;
GRANT ALL    ON public.usage_events TO service_role;

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_daily  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usage_daily_own_select" ON public.usage_daily;
CREATE POLICY "usage_daily_own_select" ON public.usage_daily
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE);

-- Escrita só por service_role, via record_usage. Ninguém edita o próprio
-- contador — seria editar a prova e zerar a cota no mesmo gesto.

-- =============================================================================
-- record_usage — grava o detalhe, incrementa o agregado, devolve o total do dia.
--
-- Devolve o contador porque quem chama precisa dele para a cota, e assim a
-- checagem custa a MESMA ida ao banco que o registro. Ler antes e escrever
-- depois seriam duas viagens e uma corrida entre elas.
--
-- O dia da cota é o dia de Brasília, não o UTC. Com UTC, tudo que acontece
-- entre 21h e meia-noite conta para o dia seguinte, e o teto "diário" viraria
-- duas janelas parciais para quem usa à noite — que é quando programador usa.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.record_usage(
  _user_id    uuid,
  _event_type text,
  _subject_id text DEFAULT NULL,
  _ip_hash    text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _total integer;
BEGIN
  INSERT INTO public.usage_events (user_id, event_type, subject_id, ip_hash)
  VALUES (_user_id, _event_type, _subject_id, _ip_hash);

  INSERT INTO public.usage_daily (user_id, day, event_type, count, updated_at)
  VALUES (_user_id, (now() AT TIME ZONE 'America/Sao_Paulo')::date, _event_type, 1, now())
  -- No SET e no RETURNING a linha existente se referencia pelo nome da tabela
  -- sem o schema — `public.usage_daily.count` não é aceito aqui. E `count`
  -- precisa vir qualificado nos dois: sozinho, o parser hesita entre a coluna
  -- e a função de agregação de mesmo nome.
  ON CONFLICT (user_id, day, event_type) DO UPDATE
    SET count = usage_daily.count + 1,
        updated_at = now()
  RETURNING usage_daily.count INTO _total;

  RETURN _total;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.record_usage(uuid, text, text, text)
  FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION public.record_usage(uuid, text, text, text)
  TO service_role;

-- =============================================================================
-- Expurgo. Retenção diferente para cada tabela, pelo motivo de cada uma.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.purge_usage_history()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _dias_evento    integer;
  _dias_agregado  integer;
BEGIN
  SELECT COALESCE((value #>> '{}')::integer, 90)  INTO _dias_evento
    FROM public.app_settings WHERE key = 'usage_retention_days';
  SELECT COALESCE((value #>> '{}')::integer, 540) INTO _dias_agregado
    FROM public.app_settings WHERE key = 'usage_daily_retention_days';

  DELETE FROM public.usage_events
   WHERE created_at < now() - make_interval(days => COALESCE(_dias_evento, 90));

  DELETE FROM public.usage_daily
   WHERE day < (now() - make_interval(days => COALESCE(_dias_agregado, 540)))::date;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.purge_usage_history() FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION public.purge_usage_history() TO service_role;

-- 3h30: depois do expire-jobs das 3h, antes do aviso de PIX das 9h.
SELECT cron.schedule(
  'rumvia-expurga-trilha-de-uso',
  '30 3 * * *',
  $cron$ SELECT public.purge_usage_history(); $cron$
);

-- =============================================================================
-- Configuração. Tudo em app_settings: mudar teto é UPDATE, não deploy.
--
-- OS TETOS SÃO DELIBERADAMENTE ALTOS. A cota existe para impedir que alguém
-- baixe o banco inteiro em 6 dias e peça o dinheiro de volta — não para
-- racionar o produto. Se um usuário honesto encostar nesses números, o número
-- está errado, não o usuário. Calibre com `scripts/relatorio-uso.ts` depois de
-- ver uso real; até lá, errar para cima é muito mais barato que errar para
-- baixo.
--
-- 90 dias de detalhe cobrem com folga o prazo em que um chargeback aparece; o
-- agregado fica 540 para sobreviver a uma discussão que se arraste.
-- =============================================================================
INSERT INTO public.app_settings (key, value) VALUES
  ('usage_quota_job_detail',       '300'),
  ('usage_quota_apply_click',      '150'),
  ('usage_quota_job_list',         '600'),
  ('usage_quota_company_detail',   '200'),
  ('usage_quota_learning_catalog', '200'),
  ('usage_retention_days',         '90'),
  ('usage_daily_retention_days',   '540')
ON CONFLICT (key) DO NOTHING;
