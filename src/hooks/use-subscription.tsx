import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
  cancelMySubscription,
  getBillingOverview,
  getPublicPlan,
  startSubscriptionCheckout,
  type BillingOverview,
} from "@/lib/billing.functions";
import { useAuth } from "@/hooks/use-auth";

export const BILLING_QUERY_KEY = ["billing"] as const;

/**
 * Estado de assinatura do usuário logado. Única fonte de `isPro` no front —
 * nenhuma tela deduz plano por conta própria.
 */
export function useSubscription() {
  const { user, isAuthenticated } = useAuth();
  const run = useServerFn(getBillingOverview);

  const query = useQuery<BillingOverview>({
    queryKey: [...BILLING_QUERY_KEY, user?.id ?? null],
    // Sessão anônima não assina: nem consulta.
    enabled: isAuthenticated,
    staleTime: 60 * 1000,
    queryFn: () => run({ data: {} }),
  });

  return {
    ...query,
    plan: query.data?.plan ?? null,
    subscription: query.data?.subscription ?? null,
    /** Tem assinatura paga. Enquanto carrega é `false`: nunca liberar por otimismo. */
    isPro: query.data?.isPro ?? false,
    isAdmin: query.data?.isAdmin ?? false,
    /** Pode entrar na conta: pagante OU admin. É o que os guards checam. */
    canAccess: query.data?.canAccess ?? false,
    /** true enquanto ainda não sabemos — guard nenhum deve decidir antes disso. */
    resolvendo: !isAuthenticated || query.isPending,
  };
}

/** Preço do plano para telas públicas (landing), sem exigir login. */
export function usePublicPlan() {
  const run = useServerFn(getPublicPlan);
  return useQuery({
    queryKey: ["billing", "public-plan"],
    staleTime: 10 * 60 * 1000,
    queryFn: () => run(),
  });
}

/** Abre o checkout hospedado do gateway e redireciona o navegador para ele. */
export function useStartCheckout() {
  const run = useServerFn(startSubscriptionCheckout);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => run({ data: {} }),
    onSuccess: ({ url }) => {
      void queryClient.invalidateQueries({ queryKey: BILLING_QUERY_KEY });
      window.location.href = url;
    },
  });
}

export function useCancelSubscription() {
  const run = useServerFn(cancelMySubscription);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => run({ data: {} }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BILLING_QUERY_KEY }),
  });
}
