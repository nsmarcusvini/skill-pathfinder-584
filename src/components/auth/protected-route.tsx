import * as React from "react";
import { useNavigate } from "@tanstack/react-router";

import { useAuth } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/use-subscription";
import { LoadingState } from "@/components/rumvia/states";

export interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Exige conta permanente (visitante anônimo é mandado para /login). */
  requireAccount?: boolean;
  /**
   * Exige assinatura ativa (senão manda para /assinatura). Admin passa sem
   * pagar — o gate lê `canAccess`, espelho de `can_access_paid_features`.
   */
  requireSubscription?: boolean;
  /** Exige onboarding concluído (senão manda para /onboarding). */
  requireOnboarding?: boolean;
}

/**
 * Ordem dos portões, e ela importa: conta → assinatura → onboarding.
 *
 * Pagar vem ANTES de escolher trilha porque o produto inteiro é pago: mandar
 * alguém preencher o onboarding para só depois descobrir que não entra é o
 * pior momento possível para apresentar o preço.
 *
 * Isto é UX. A proteção real do dado está no servidor
 * (`requireActiveSubscription` em subscription-middleware.ts).
 */
export function ProtectedRoute({
  children,
  requireAccount = true,
  requireSubscription = false,
  requireOnboarding = false,
}: ProtectedRouteProps) {
  const { loading, isAuthenticated, isOnboarded } = useAuth();
  const { canAccess, resolvendo } = useSubscription();
  const navigate = useNavigate();

  const blockedByAccount = requireAccount && !isAuthenticated;
  // Enquanto `resolvendo`, ninguém decide nada: redirecionar antes da resposta
  // chegar jogaria assinante pago para a tela de pagamento a cada F5.
  const aguardandoAssinatura = requireSubscription && !blockedByAccount && resolvendo;
  const blockedBySubscription =
    requireSubscription && !blockedByAccount && !resolvendo && !canAccess;
  const blockedByOnboarding =
    requireOnboarding && isAuthenticated && !blockedBySubscription && !isOnboarded;

  React.useEffect(() => {
    if (loading || aguardandoAssinatura) return;
    if (blockedByAccount) {
      void navigate({
        to: "/login",
        search: { redirect: window.location.pathname + window.location.search },
        replace: true,
      });
      return;
    }
    if (blockedBySubscription) {
      void navigate({ to: "/assinatura", search: { bloqueado: "1" }, replace: true });
      return;
    }
    if (blockedByOnboarding) {
      void navigate({ to: "/onboarding", replace: true });
    }
  }, [
    loading,
    aguardandoAssinatura,
    blockedByAccount,
    blockedBySubscription,
    blockedByOnboarding,
    navigate,
  ]);

  if (
    loading ||
    aguardandoAssinatura ||
    blockedByAccount ||
    blockedBySubscription ||
    blockedByOnboarding
  ) {
    return <LoadingState label="Verificando sua sessão…" />;
  }

  return <>{children}</>;
}
