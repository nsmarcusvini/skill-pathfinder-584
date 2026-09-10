-- Front-End sai da vitrine outra vez, agora às vésperas do lançamento.
--
-- HISTÓRICO CURTO
-- `20260830154619_desativa_trilhas_sem_dado.sql` desativou frontend, backend e
-- qa por amostra insuficiente. Em 2026-09-08 o desempate do classificador foi
-- corrigido (`track_role_variants.priority`) e backend e frontend voltaram —
-- backend com folga, frontend não.
--
-- O NÚMERO DE HOJE (vagas ativas, por segmento)
--   devops ......... 134 br / 11 remoto_global
--   fullstack ...... 106 br / 50 remoto_global
--   backend ......... 57 br / 13 remoto_global
--   data_engineer ... 57 br / 10 remoto_global
--   frontend .......... 6 br /  3 remoto_global   ← aqui
--
-- `MIN_SAMPLE` em src/lib/gap.functions.ts é 30. Com 6 vagas, todo cálculo de
-- Front-End nasce em `lowConfidence` e já sobe com o aviso de amostra pequena.
-- A app é honesta sobre isso — mas honestidade não sustenta cobrar R$ 29,90 de
-- alguém e entregar um aviso de que o número não é confiável. Enquanto a
-- ingestão não adensar, é melhor não oferecer do que oferecer com ressalva.
--
-- NÃO AFETA NINGUÉM (conferido em produção antes de aplicar)
--   profiles.current_track_id → frontend: 0
--   user_track_preferences    → frontend: 0
--   study_plans               → frontend: 0
--   assinantes ativos na trilha: 0
-- Sobram 2 gap_analyses históricas, de gente que não está mais na trilha.
--
-- Reversível: quando frontend passar dos 30 no segmento br, um UPDATE devolve.
-- É dado, não código (regra 1) — a interface filtra por is_active e some sozinha.

UPDATE public.career_tracks
SET is_active = false
WHERE key = 'frontend';
