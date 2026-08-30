-- Pausa temporária de toda ingestão automática de vagas (a pedido do usuário,
-- 2026-08-30) — inclui o disparo de coletas na Bright Data, que cobra por
-- registro coletado (ver docs/BRIGHT_DATA.md, seção "Custo").
--
-- Desliga os três crons de vagas:
--   rumvia-ingest-jobs           fontes síncronas grátis (ATS + agregadores), a cada 6h
--   rumvia-ingest-async-colher   fase barata (só baixa snapshot já pronto), a cada 30min
--   rumvia-ingest-async-disparar fase paga (pede coleta nova à Bright Data), 2x/dia
--
-- Reversível: para religar, rode de novo os cron.schedule(...) originais em
-- 20260826170959_0ec0b3dd-317d-4d9c-a9f5-97eea6fa8b6d.sql (rumvia-ingest-jobs) e
-- 20260827220000_split_ingest_async_cron.sql (as duas fases async).

SELECT cron.unschedule('rumvia-ingest-jobs')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rumvia-ingest-jobs');

SELECT cron.unschedule('rumvia-ingest-async-colher')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rumvia-ingest-async-colher');

SELECT cron.unschedule('rumvia-ingest-async-disparar')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rumvia-ingest-async-disparar');
