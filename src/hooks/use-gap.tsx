import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as React from "react";

import { computeGap } from "@/lib/gap.functions";
import { useAuth } from "@/hooks/use-auth";
import { useMarket, type MarketSegment, type Seniority } from "@/hooks/use-market";

export const GAP_QUERY_KEY = ["gap"] as const;

/**
 * Definição única da query de gap — chave e fetcher no mesmo lugar.
 *
 * Existe para que `useGap` (quem lê) e o prefetch do menu (quem adianta) usem
 * exatamente a MESMA chave. Duplicar a chave nos dois lugares é como isso
 * apodrece: basta alguém acrescentar uma dimensão ao recorte num lado e o
 * prefetch passa a aquecer uma entrada de cache que ninguém lê — trabalho de
 * rede gasto sem nenhum sintoma visível.
 */
function gapQueryOptions<T>(args: {
  userId: string | null;
  seniority: Seniority;
  segment: MarketSegment;
  periodDays: number;
  run: (opts: {
    data: { seniority: Seniority; marketSegment: MarketSegment; periodDays: number };
  }) => Promise<T>;
}) {
  const { userId, seniority, segment, periodDays, run } = args;
  return {
    queryKey: [...GAP_QUERY_KEY, userId, seniority, segment, periodDays],
    staleTime: 30 * 1000,
    queryFn: () => run({ data: { seniority, marketSegment: segment, periodDays } }),
  };
}

/**
 * Lê o resultado da compute-gap. Nenhuma tela recalcula score localmente.
 */
export function useGap() {
  const { user } = useAuth();
  const run = useServerFn(computeGap);
  const { seniority, segment, periodDays } = useMarket();
  return useQuery({
    ...gapQueryOptions({ userId: user?.id ?? null, seniority, segment, periodDays, run }),
    enabled: Boolean(user),
  });
}

/**
 * Começa a carregar o gap ANTES do clique, no hover do item de menu.
 *
 * O router já baixa o código da rota por intenção (`defaultPreload: "intent"`),
 * mas o dado só começava depois do clique — e o compute-gap é a consulta mais
 * cara do app. Adiantá-la pelo tempo que a mão leva do hover ao clique costuma
 * esconder boa parte da espera.
 *
 * `prefetchQuery` respeita o `staleTime`: passar o mouse dez vezes com o dado
 * fresco não dispara nada.
 */
export function usePrefetchGap() {
  const { user } = useAuth();
  const run = useServerFn(computeGap);
  const { seniority, segment, periodDays } = useMarket();
  const queryClient = useQueryClient();

  return React.useCallback(() => {
    if (!user) return;
    void queryClient.prefetchQuery(
      gapQueryOptions({ userId: user.id, seniority, segment, periodDays, run }),
    );
  }, [queryClient, user, seniority, segment, periodDays, run]);
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
