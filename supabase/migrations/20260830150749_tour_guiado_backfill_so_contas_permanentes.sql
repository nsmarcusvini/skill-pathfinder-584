-- Corrige o backfill do tour: a migration 20260830145344_tour_guiado.sql marcou
-- TODOS os perfis como 'concluido', inclusive os anônimos que ainda não criaram
-- conta. O requisito é "tour só após o cadastro" — então visitante anônimo que
-- ainda vai se cadastrar precisa continuar 'pendente' para ver o tour quando
-- converter a sessão em conta permanente (regra 7: o user.id é preservado, então
-- é a MESMA linha de profiles que sobrevive à conversão).
-- Só quem já tem conta permanente (e portanto já usa o produto) fica 'concluido'.
--
-- O filtro tour_updated_at IS NULL garante que ninguém que já interagiu com o
-- tour seja reaberto: só linhas nunca tocadas pelo hook são revertidas.

UPDATE public.profiles
SET tour_status = 'pendente'
WHERE is_anonymous = true
  AND tour_status = 'concluido'
  AND tour_updated_at IS NULL;
