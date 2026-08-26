/**
 * Cloudflare Turnstile — proteção do sign-in anônimo.
 *
 * A site key é publicável (VITE_TURNSTILE_SITE_KEY). Se ela não estiver
 * configurada, o desafio é ignorado e o fluxo segue normalmente — assim o
 * produto funciona em preview sem depender de credenciais externas.
 */

export const TURNSTILE_SITE_KEY =
  (import.meta.env["VITE_TURNSTILE_SITE_KEY"] as string | undefined) || undefined;

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  execute: (el: HTMLElement | string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("sem window"));
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Falha ao carregar o Turnstile"));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

/** Executa o desafio invisível e devolve o token, ou undefined se indisponível. */
export async function requestTurnstileToken(): Promise<string | undefined> {
  if (!TURNSTILE_SITE_KEY || typeof window === "undefined") return undefined;

  try {
    await loadScript();
    const api = window.turnstile;
    if (!api) return undefined;

    return await new Promise<string | undefined>((resolve) => {
      const host = document.createElement("div");
      host.style.display = "none";
      document.body.appendChild(host);

      let widgetId: string | null = null;
      let settled = false;

      const finish = (token?: string) => {
        if (settled) return;
        settled = true;
        try {
          if (widgetId) api.remove(widgetId);
        } catch {
          /* widget já removido */
        }
        host.remove();
        resolve(token);
      };

      widgetId = api.render(host, {
        sitekey: TURNSTILE_SITE_KEY,
        size: "invisible",
        callback: (token: string) => finish(token),
        "error-callback": () => finish(undefined),
        "timeout-callback": () => finish(undefined),
      });

      api.execute(host);
      window.setTimeout(() => finish(undefined), 10000);
    });
  } catch {
    return undefined;
  }
}
