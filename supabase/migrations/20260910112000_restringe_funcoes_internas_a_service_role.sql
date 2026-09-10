-- Duas funções internas estavam chamáveis por `anon` e `authenticated`.
--
-- POR QUE O REVOKE ORIGINAL NÃO BASTOU
-- Eu tinha escrito `revoke execute ... from public`. No Supabase isso não
-- resolve: o schema `public` tem ALTER DEFAULT PRIVILEGES concedendo EXECUTE
-- explicitamente para `anon` e `authenticated` em toda função nova. Revogar de
-- PUBLIC não remove grant explícito de papel — são coisas diferentes, e o ACL
-- continuava `anon=X/postgres`. A revogação precisa nomear os papéis.
--
-- Mesma classe do que aconteceu com `is_admin` (migration 20260903160000): lá
-- o problema era o oposto, PUBLIC implícito; aqui é grant explícito. As duas
-- formas coexistem e só o ACL real diz qual está valendo — conferir com
-- `select proacl from pg_proc`, nunca supor pelo texto do REVOKE.
--
-- O QUE CADA UMA EXPUNHA
-- `list_orphan_cv_objects` (SECURITY DEFINER) devolvia o caminho de cada CV
-- órfão no Storage — `<uuid_do_usuario>/<uuid_do_arquivo>.pdf` — com tamanho e
-- data. Não dá para BAIXAR o arquivo só com o caminho (o bucket é privado e a
-- policy exige `auth.uid()` igual à pasta), e por definição são arquivos de
-- usuários que não existem mais. Ainda assim é metadado interno de auditoria
-- vazando para visitante anônimo, sem nenhuma razão para estar aberto.
--
-- `expire_and_notify_prepaid` não recebe parâmetro e é idempotente: chamá-la só
-- adianta a faxina diária. Não expira nada que já não estivesse vencido nem
-- duplica aviso (a dedupe de 7 dias segura). Impacto praticamente nulo — mas
-- é rotina de manutenção, não tem por que ser alcançável de fora.

revoke execute on function public.list_orphan_cv_objects()    from anon, authenticated, public;
revoke execute on function public.expire_and_notify_prepaid() from anon, authenticated, public;

grant execute on function public.list_orphan_cv_objects()    to service_role;
grant execute on function public.expire_and_notify_prepaid() to service_role;
