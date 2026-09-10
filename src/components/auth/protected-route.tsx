import * as React from "react";
import { useNavigate } from "@tanstack/react-router";

import { useAuth } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/use-subscription";
import { useCurrentCv, hasExtractedCv } from "@/hooks/use-current-cv";
import { LoadingState } from "@/components/rumvia/states";

export interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Exige conta permanente (visitante anônimo é mandado para /login). */
  requireAccount?: boolean;
  /** Exige currículo já extraído (senão manda para /analise). */
  requireCv?: boolean;
  /**
   * Exige assinatura ativa (senão manda para /assinatura). Admin passa sem
   * pagar — o gate lê `canAccess`, espelho de `can_access_paid_features`.
   */
  requireSubscription?: boolean;
  /** Exige onboarding concluído (senão manda para /onboarding). */
  requireOnboarding?: boolean;
}

/**
 * Ordem dos portões, e ela importa: conta → CV → assinatura → onboarding.
 *
 * O CV vem antes de pagar e antes de configurar trilha porque ele é o insumo
 * de tudo: sem currículo extraído não há aderência para calcular, nada para
 * confirmar no onboarding e nenhum motivo para cobrar. Quem cai aqui sem CV
 * volta para /analise, que é onde se envia.
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
  requireCv = false,
  requireSubscription = false,
  requireOnboarding = false,
}: ProtectedRouteProps) {
  const { loading, isAuthenticated, isOnboarded, user } = useAuth();
  const { canAccess, resolvendo } = useSubscription();
  const cvQuery = useCurrentCv({ enabled: requireCv });
  const navigate = useNavigate();

  const blockedByAccount = requireAccount && !isAuthenticated;
  // Sem usuário a query nem roda (`enabled`), e query desabilitada devolve
  // isLoading=false — decidir nesse estado mandaria para /analise quem só
  // estava esperando a sessão resolver.
  const aguardandoCv = requireCv && !blockedByAccount && (!user || cvQuery.isLoading);
  const blockedByCv =
    requireCv && !blockedByAccount && !aguardandoCv && !hasExtractedCv(cvQuery.data);
  // Enquanto `resolvendo`, ninguém decide nada: redirecionar antes da resposta
  // chegar jogaria assinante pago para a tela de pagamento a cada F5.
  const aguardandoAssinatura =
    requireSubscription && !blockedByAccount && !blockedByCv && resolvendo;
  const blockedBySubscription =
    requireSubscription && !blockedByAccount && !blockedByCv && !resolvendo && !canAccess;
  const blockedByOnboarding =
    requireOnboarding && isAuthenticated && !blockedByCv && !blockedBySubscription && !isOnboarded;

  React.useEffect(() => {
    if (loading || aguardandoCv || aguardandoAssinatura) return;
    if (blockedByAccount) {
      void navigate({
        to: "/login",
        search: { redirect: window.location.pathname + window.location.search },
        replace: true,
      });
      return;
    }
    if (blockedByCv) {
      void navigate({ to: "/analise", search: { cv: undefined }, replace: true });
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
    aguardandoCv,
    aguardandoAssinatura,
    blockedByAccount,
    blockedByCv,
    blockedBySubscription,
    blockedByOnboarding,
    navigate,
  ]);

  if (
    loading ||
    aguardandoCv ||
    aguardandoAssinatura ||
    blockedByAccount ||
    blockedByCv ||
    blockedBySubscription ||
    blockedByOnboarding
  ) {
    return <LoadingState label="Verificando sua sessão…" />;
  }

  return <>{children}</>;
}
