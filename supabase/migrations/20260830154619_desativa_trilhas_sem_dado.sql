-- Frontend, Backend e QA entraram em 20260827200000_tracks_frontend_backend_qa.sql
-- só como dados (regra 1), mas a ingestão nunca alimentou nenhuma das três o
-- suficiente para gerar um gap honesto:
--   frontend: 0 vagas com skills extraídas
--   backend:  4 vagas com skills extraídas
--   qa:       3 vagas com skills extraídas, 0 no segmento br (o padrão da app)
-- A landing oferece as seis como equivalentes; quem escolhesse uma dessas três
-- receberia um score de aderência calculado sobre amostra insuficiente ou zero,
-- apresentado com a mesma confiança de devops (109 vagas).
--
-- Desativar aqui é reversível e não afeta ninguém: nenhum profiles.current_track_id
-- nem user_track_preferences aponta para as três (conferido antes de aplicar).
-- use-market.tsx e analise.tsx já filtram is_active=true, então isso basta para
-- sumirem de toda a interface sem mudança de código.

UPDATE public.career_tracks
SET is_active = false
WHERE key IN ('frontend', 'backend', 'qa');
