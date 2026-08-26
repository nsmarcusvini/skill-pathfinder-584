/**
 * ingest-jobs — orquestrador de ingestão (fluxo PULL).
 * Chamado pelo pg_cron (a cada 6h) via pg_net. Exige x-cron-secret.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z
  .object({ source_keys: z.array(z.string().min(1)).max(50).optional() })
  .default({});

export const Route = createFileRoute("/api/public/ingest-jobs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["LOVABLE_CRON_SECRET"];
        const provided = request.headers.get("x-cron-secret");
        if (!secret || !provided || provided !== secret) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        let parsed: { source_keys?: string[] } = {};
        try {
          const raw = await request.text();
          parsed = bodySchema.parse(raw ? JSON.parse(raw) : {});
        } catch {
          return new Response(JSON.stringify({ error: "payload inválido" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const { runIngest } = await import("@/lib/ingest/run.server");
        try {
          const result = await runIngest(parsed.source_keys);
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "content-type": "application/json", "cache-control": "no-store" },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error("ingest-jobs falhou:", message);
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
