import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
  cancelMySubscription,
  getBillingOverview,
  getPublicPlans,
  startSubscriptionCheckout,
  type BillingOverview,
  type BillingPlan,
} from "@/lib/billing.functions";
import { useAuth } from "@/hooks/use-auth";

export const BILLING_QUERY_KEY = ["billing"] as const;

const SEM_PLANOS: BillingPlan[] = [];

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

  const plans = query.data?.plans ?? SEM_PLANOS;

  return {
    ...query,
    /** Catálogo ativo, já ordenado para exibição. */
    plans,
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

/** Catálogo de planos para telas públicas (landing), sem exigir login. */
export function usePublicPlans() {
  const run = useServerFn(getPublicPlans);
  return useQuery({
    queryKey: ["billing", "public-plans"],
    staleTime: 10 * 60 * 1000,
    queryFn: () => run(),
  });
}

/**
 * Menor preço por mês do catálogo — o número que responde "quanto custa?" numa
 * frase só, quando não há espaço para a tabela inteira. `null` sem catálogo:
 * preço inventado é pior que preço ausente.
 */
export function menorMensalidade<T extends { monthlyEquivalentCents: number }>(
  plans: T[],
): T | null {
  if (plans.length === 0) return null;
  return plans.reduce((menor, p) =>
    p.monthlyEquivalentCents < menor.monthlyEquivalentCents ? p : menor,
  );
}

/** Abre o checkout hospedado do gateway e redireciona o navegador para ele. */
export function useStartCheckout() {
  const run = useServerFn(startSubscriptionCheckout);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (planKey: string) => run({ data: { planKey } }),
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
