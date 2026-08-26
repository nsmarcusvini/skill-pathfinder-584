import * as React from "react";
import { useNavigate } from "@tanstack/react-router";

import { useAuth } from "@/hooks/use-auth";
import { LoadingState } from "@/components/rumvia/states";

export interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Exige conta permanente (visitante anônimo é mandado para /login). */
  requireAccount?: boolean;
  /** Exige onboarding concluído (senão manda para /onboarding). */
  requireOnboarding?: boolean;
}

export function ProtectedRoute({
  children,
  requireAccount = true,
  requireOnboarding = false,
}: ProtectedRouteProps) {
  const { loading, isAuthenticated, isOnboarded } = useAuth();
  const navigate = useNavigate();

  const blockedByAccount = requireAccount && !isAuthenticated;
  const blockedByOnboarding = requireOnboarding && isAuthenticated && !isOnboarded;

  React.useEffect(() => {
    if (loading) return;
    if (blockedByAccount) {
      void navigate({
        to: "/login",
        search: { redirect: window.location.pathname + window.location.search },
        replace: true,
      });
      return;
    }
    if (blockedByOnboarding) {
      void navigate({ to: "/onboarding", replace: true });
    }
  }, [loading, blockedByAccount, blockedByOnboarding, navigate]);

  if (loading || blockedByAccount || blockedByOnboarding) {
    return <LoadingState label="Verificando sua sessão…" />;
  }

  return <>{children}</>;
}
