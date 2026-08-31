/**
 * abacatepay-webhook — porta de entrada dos eventos de pagamento.
 *
 * URL a cadastrar no dashboard da AbacatePay (ou via `bun scripts/abacatepay-setup.ts`):
 *   https://<dominio>/api/public/abacatepay-webhook?webhookSecret=<ABACATE_PAY_WEBHOOK_SECRET>
 *
 * A rota é fina de propósito: validação, idempotência e efeito ficam em
 * src/lib/abacatepay/webhook.server.ts.
 */
import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/abacatepay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // O HMAC é calculado sobre o corpo CRU — nada de request.json() aqui.
        const rawBody = await request.text();
        const url = new URL(request.url);

        const { handleAbacateWebhook } = await import("@/lib/abacatepay/webhook.server");
        const result = await handleAbacateWebhook({
          rawBody,
          signature: request.headers.get("x-webhook-signature"),
          secretFromQuery: url.searchParams.get("webhookSecret"),
        });

        return json(result.body, result.status);
      },
    },
  },
});
