import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";

import { AccountShell } from "@/components/app/account-shell";
import { ProtectedRoute } from "@/components/auth/protected-route";

/**
 * As duas únicas rotas de `_conta` que abrem sem assinatura paga:
 *
 * - `/assinatura` é onde se paga. Exigir pagamento para chegar nela seria um laço.
 * - `/conta` guarda exportar e excluir os dados. Trancar alguém para fora do
 *   próprio direito de apagar a conta contraria a LGPD — dado é da pessoa,
 *   pagando ou não.
 *
 * Todo o resto exige assinatura ativa (admin passa sem pagar).
 */
const ROTAS_SEM_PAYWALL = ["/assinatura", "/conta"];

export const Route = createFileRoute("/_conta")({
  ssr: false,
  component: ContaLayout,
});

function ContaLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const livre = ROTAS_SEM_PAYWALL.includes(pathname);

  return (
    <ProtectedRoute requireAccount requireSubscription={!livre} requireOnboarding={!livre}>
      <AccountShell>
        <Outlet />
      </AccountShell>
    </ProtectedRoute>
  );
}
