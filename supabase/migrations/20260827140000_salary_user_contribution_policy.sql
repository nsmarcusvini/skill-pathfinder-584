-- CORREÇÃO: salary_observations tinha apenas policy de SELECT.
--
-- A função submitSalaryObservation (market.functions.ts) e o formulário de
-- contribuição em salarios.tsx existem desde o Prompt 10, mas todo envio morria
-- com "new row violates row-level security policy for table
-- salary_observations". Ninguém nunca conseguiu contribuir com salário — nem
-- administrador, já que essa função usa o cliente do usuário, sujeito a RLS.
--
-- A policy abaixo é a que o CLAUDE.md (regra 6) já especificava para as tabelas
-- exclusivas de conta permanente, citando nominalmente
-- "salary_observations com source='user'".
--
-- Limites deliberados:
--   * só a própria linha (user_id = auth.uid());
--   * só source = 'user'. 'posting' segue exclusivo do service_role — sem isso
--     um usuário poderia injetar salário como se tivesse vindo de vaga real e
--     envenenar mv_salary_stats, que alimenta a tela de Salários;
--   * conta anônima não contribui: é descartada em 7 dias pelo purge e o dado
--     ficaria órfão.
--
-- Verificado no banco após aplicar, simulando o papel authenticated:
--   permanente + source=user      -> passa no RLS
--   anônimo    + source=user      -> bloqueado
--   permanente + source=posting   -> bloqueado

DROP POLICY IF EXISTS "salary_observations_insert_own" ON public.salary_observations;
CREATE POLICY "salary_observations_insert_own"
  ON public.salary_observations
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND source = 'user'
    AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE
  );

-- Poder retirar a própria contribuição é parte de poder contribuir.
DROP POLICY IF EXISTS "salary_observations_delete_own" ON public.salary_observations;
CREATE POLICY "salary_observations_delete_own"
  ON public.salary_observations
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND source = 'user');
