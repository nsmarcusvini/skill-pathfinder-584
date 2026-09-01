/**
 * asaas-webhook — porta de entrada dos eventos de pagamento.
 *
 * URL a cadastrar no Asaas (ou via `bun run scripts/asaas-setup.ts`):
 *   https://<dominio>/api/public/asaas-webhook
 *
 * O token vai no header `asaas-access-token`, não na query string — então a URL
 * pode ser registrada e logada sem vazar segredo (melhor que o desenho anterior,
 * em que o secret ficava visível na própria URL do webhook).
 *
 * A rota é fina de propósito: validação, idempotência e efeito ficam em
 * src/lib/asaas/webhook.server.ts.
 */
import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/asaas-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();

        const { handleAsaasWebhook } = await import("@/lib/asaas/webhook.server");
        const result = await handleAsaasWebhook({
          rawBody,
          accessToken: request.headers.get("asaas-access-token"),
        });

        return json(result.body, result.status);
      },
    },
  },
});
