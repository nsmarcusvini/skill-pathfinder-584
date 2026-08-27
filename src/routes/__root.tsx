import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

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
        <Link
          to="/"
          className="mx-auto border px-4 py-2 text-sm hover:bg-surface"
        >
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
            onClick={() => { router.invalidate(); reset(); }}
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
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
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

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MarketProvider>
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
        </MarketProvider>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
