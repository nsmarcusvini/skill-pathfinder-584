-- Achado 4 de docs/SEGURANCA.md: `user_followed_companies` aceitava sessão
-- anônima, contrariando a regra 6 do CLAUDE.md, que lista a tabela entre as
-- exclusivas de conta permanente.
--
-- O QUE ESTAVA ABERTO
-- As três policies (`ufc_select_own`, `ufc_insert_own`, `ufc_delete_own`)
-- checavam só a posse — `user_id = auth.uid()` — sem a cláusula de
-- `is_anonymous`. Como sessão anônima é `authenticated` no JWT (regra 7), um
-- visitante descartável podia seguir empresa.
--
-- Impacto era pequeno e vale ser preciso: a pessoa só populava a própria
-- lista, não lia a de ninguém (confirmado: sessão anônima recebe `[]`) e não
-- gerava custo. É desvio de regra escrita, não brecha de dados. A regra existe
-- para que recurso de conta permanente não fique alcançável por sessão que o
-- expurgo diário apaga.
--
-- UMA DIVERGÊNCIA ENCONTRADA AO APLICAR, QUE VALE REGISTRAR
-- A regra 6 escreve a cláusula no `USING`. As tabelas irmãs que a auditoria
-- cita como conformes (`user_certifications`, `user_courses`) na verdade a
-- põem só no `WITH CHECK`, com `FOR ALL` e `USING (user_id = auth.uid())` —
-- ou seja, guardam a ESCRITA e deixam a leitura livre para o dono.
--
-- Segui a constituição, não o precedente: a cláusula entra nos três comandos.
-- Custa nada e fecha mais. Uma sessão anônima que não pode inserir não terá
-- linha para ler, e conta permanente tem `is_anonymous` falso — ninguém perde
-- acesso. Conferido antes de aplicar: a tabela tem 1 linha, de conta
-- permanente. Se um dia a divergência incomodar, o lugar de resolver é a
-- regra 6, não esta migration.

drop policy if exists ufc_select_own on public.user_followed_companies;
drop policy if exists ufc_insert_own on public.user_followed_companies;
drop policy if exists ufc_delete_own on public.user_followed_companies;

create policy ufc_select_own
  on public.user_followed_companies
  for select
  to authenticated
  using (
    user_id = auth.uid()
    AND ((auth.jwt() ->> 'is_anonymous')::boolean) IS NOT TRUE
  );

create policy ufc_insert_own
  on public.user_followed_companies
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    AND ((auth.jwt() ->> 'is_anonymous')::boolean) IS NOT TRUE
  );

create policy ufc_delete_own
  on public.user_followed_companies
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    AND ((auth.jwt() ->> 'is_anonymous')::boolean) IS NOT TRUE
  );
