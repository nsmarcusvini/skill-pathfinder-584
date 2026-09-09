import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        /**
         * Sem isto, `staleTime` é 0: toda volta para uma tela já visitada
         * refazia TODAS as consultas dela. Sair do dashboard, olhar salários e
         * voltar disparava de novo gap, skills e mercado — dados que não mudam
         * de minuto a minuto, porque as views de mercado são atualizadas por
         * cron a cada 6h e o CV muda quando a pessoa envia outro.
         *
         * 5 minutos é conservador para esse perfil de dado. O que precisa ser
         * imediato já invalida por conta própria: pagamento
         * (`BILLING_QUERY_KEY`), perfil e skills chamam `invalidateQueries`
         * depois de escrever, e isso continua valendo — `staleTime` não
         * atrapalha invalidação explícita.
         */
        staleTime: 5 * 60 * 1000,
        /** Refetch ao focar a aba é ruído aqui: nada muda por outra pessoa. */
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    /**
     * Baixa o código da rota no HOVER (ou toque), antes do clique. É a maior
     * diferença perceptível de navegação nesta app: como nenhuma rota usa
     * `loader` — as 21 buscam dados por `useQuery` no cliente —, o clique hoje
     * paga tudo em série: baixar o chunk, montar a tela, e só então disparar as
     * consultas. Com `intent`, o chunk já chegou quando o dedo desce.
     */
    defaultPreload: "intent",
    /**
     * Quanto tempo o resultado de um preload vale antes de ser refeito. Era 0,
     * o que anulava o preload de dados: chegava e já nascia obsoleto. 30s cobre
     * a distância entre passar o mouse e clicar, sem servir dado velho.
     */
    defaultPreloadStaleTime: 30_000,
  });

  return router;
};
