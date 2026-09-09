import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "@/hooks/use-auth";
import { MarketProvider } from "@/hooks/use-market";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="max-w-md text-center flex flex-col gap-4">
        <span className="font-display text-7xl tracking-tight">404</span>
        <h1 className="text-xl font-semibold">Página não encontrada</h1>
        <p className="text-sm" style={{ color: "var(--color-muted-foreground, #888)" }}>
          Essa página não existe ou foi movida.
        </p>
        <Link to="/" className="mx-auto border px-4 py-2 text-sm hover:bg-surface">
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="max-w-md text-center flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Algo deu errado</h1>
        <p className="text-sm" style={{ color: "var(--color-muted-foreground, #888)" }}>
          Ocorreu um erro ao carregar esta página. Tente novamente ou volte ao início.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="border px-4 py-2 text-sm hover:bg-surface"
          >
            Tentar novamente
          </button>
          <a href="/" className="border px-4 py-2 text-sm hover:bg-surface">
            Início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "RUMVIA — Aderência do seu CV ao mercado de tecnologia" },
      {
        name: "description",
        content:
          "O RUMVIA compara seu currículo com a demanda real do mercado de tecnologia e mostra sua aderência à trilha escolhida.",
      },
      { name: "author", content: "RUMVIA" },
      { property: "og:title", content: "RUMVIA — Aderência do seu CV ao mercado" },
      {
        property: "og:description",
        content: "Descubra em porcentagem o quanto seu CV está aderente à sua trilha de carreira.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600&family=Barlow:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      // SVG primeiro: navegadores modernos preferem, o .ico fica de fallback.
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon", sizes: "any" },
      // iOS ignora SVG em apple-touch-icon: precisa ser PNG, senão a tela de
      // início usa um screenshot da página no lugar do ícone.
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

/**
 * Barra fina no topo enquanto o router troca de rota.
 *
 * Sem ela o clique parecia travado: como nenhuma rota usa `loader`, sair de uma
 * tela e entrar na outra leva o tempo de baixar o chunk e montar — e nesse
 * intervalo a página anterior fica parada, sem nenhum sinal de que algo está
 * acontecendo. A reação natural do usuário é clicar de novo.
 *
 * Não é spinner de tela cheia de propósito: trocar o conteúdo por um esqueleto
 * a cada navegação é mais agressivo do que o problema pede, e piora a sensação
 * em transições rápidas (o esqueleto pisca). Uma barra fina informa sem
 * interromper.
 *
 * `aria-hidden`: é decoração. Quem usa leitor de tela é avisado pela mudança de
 * conteúdo e pelo `<title>` da rota nova, não por uma barra.
 */
function NavigationProgress() {
  const routerPending = useRouterState({ select: (s) => s.status === "pending" });

  // No SSR o router ainda está `pending` (resolvendo a rota inicial); quando o
  // React hidrata no cliente já virou `idle`. Tentar igualar as classes nos
  // dois lados deu hydration mismatch — e o React avisa que NÃO corrige
  // atributo ("this won't be patched up"), então ficaria errado de verdade.
  //
  // Não renderizar nada antes de montar resolve pela raiz: o servidor não
  // emite o elemento, o primeiro render do cliente também não, e não há o que
  // divergir. A barra só existe depois da hidratação — que é exatamente quando
  // ela passa a ter utilidade, porque navegação client-side só ocorre aí.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  if (!montado) return null;

  const isLoading = routerPending;

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 origin-left bg-accent",
        "transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none",
        isLoading ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0",
      )}
    />
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MarketProvider>
          <NavigationProgress />
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
        </MarketProvider>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
