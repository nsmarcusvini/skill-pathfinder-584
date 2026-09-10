-- A migration anterior (20260910200000) revogou só de PUBLIC, que não remove
-- o GRANT explícito que ALTER DEFAULT PRIVILEGES deu a anon/authenticated —
-- o mesmo erro já documentado em CLAUDE.md (list_orphan_cv_objects,
-- expire_and_notify_prepaid, resubscribe_blocks/usage_*, e agora esta). O
-- advisor de segurança confirmou: anon e authenticated ainda executavam a
-- função via /rest/v1/rpc/finalize_scheduled_cancellations logo após criada.
--
-- Nomeando os papéis explicitamente, como as regras exigem. Confirmado depois
-- via `select proacl from pg_proc`: só postgres e service_role restam.
revoke execute on function public.finalize_scheduled_cancellations() from anon, authenticated, public;
grant execute on function public.finalize_scheduled_cancellations() to service_role;
