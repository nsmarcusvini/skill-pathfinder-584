import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z
  .object({
    job_ids: z.array(z.string().uuid()).max(200).optional(),
    since: z.string().optional(),
    force: z.boolean().optional(),
    batches: z.number().int().min(1).max(10).optional(),
  })
  .default({});

/** Extração em lote de skills das vagas (lotes de 200, idempotente). */
export const Route = createFileRoute("/api/public/extract-jd-skills")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("x-cron-secret");
        const envSecret = process.env["LOVABLE_CRON_SECRET"];
        let authorized = Boolean(provided && envSecret && provided === envSecret);

        if (!authorized && provided) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data } = await supabaseAdmin.rpc("verify_cron_secret", { _token: provided });
          authorized = data === true;
        }

        if (!authorized) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        let input: z.infer<typeof bodySchema> = {};
        try {
          const raw = await request.text();
          input = bodySchema.parse(raw ? JSON.parse(raw) : {});
        } catch {
          return new Response(JSON.stringify({ error: "payload inválido" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const { extractJdSkills } = await import("@/lib/jd/extract.server");
        const results = [];
        const batches = input.batches ?? 1;
        for (let i = 0; i < batches; i++) {
          const result = await extractJdSkills({
            ...(input.job_ids ? { jobIds: input.job_ids } : {}),
            ...(input.since ? { since: input.since } : {}),
            ...(input.force ? { force: input.force } : {}),
          });
          results.push(result);
          if (result.processed === 0 || input.job_ids) break;
        }

        return new Response(JSON.stringify({ batches: results }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
