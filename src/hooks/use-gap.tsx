import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as React from "react";

import { computeGap } from "@/lib/gap.functions";
import { useAuth } from "@/hooks/use-auth";
import { useMarket } from "@/hooks/use-market";

export const GAP_QUERY_KEY = ["gap"] as const;

/**
 * Lê o resultado da compute-gap. Nenhuma tela recalcula score localmente.
 */
export function useGap() {
  const { user } = useAuth();
  const run = useServerFn(computeGap);
  const { seniority, segment, periodDays } = useMarket();
  return useQuery({
    queryKey: [...GAP_QUERY_KEY, user?.id ?? null, seniority, segment, periodDays],
    enabled: Boolean(user),
    staleTime: 30 * 1000,
    queryFn: () =>
      run({ data: { seniority, marketSegment: segment, periodDays } }),
  });
}

/**
 * Dispara o recálculo em background após qualquer alteração de skills.
 * Invalida a query de gap: dashboard e demais telas atualizam sem reload.
 */
export function useRecomputeGap() {
  const queryClient = useQueryClient();
  return React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: GAP_QUERY_KEY });
  }, [queryClient]);
}
