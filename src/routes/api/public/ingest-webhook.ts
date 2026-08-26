/**
 * ingest-webhook — porta de entrada PUSH.
 * Qualquer coletor externo (API licenciada, scraper próprio, n8n, Apify) envia
 * { source_key, jobs: NormalizedJob[] } e cai no MESMO pipeline do fluxo pull.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";
import { z } from "zod";

const jobSchema = z.object({
  external_id: z.string().min(1),
  source_key: z.string().min(1).optional(),
  title: z.string().min(1),
  company_name: z.string().min(1),
  location_raw: z.string().nullable().optional(),
  is_remote: z.boolean().default(false),
  country: z.string().nullable().optional(),
  description_html: z.string().nullable().optional(),
  description_text: z.string().nullable().optional(),
  salary_min: z.number().nullable().optional(),
  salary_max: z.number().nullable().optional(),
  salary_currency: z.string().nullable().optional(),
  salary_period: z.string().nullable().optional(),
  employment_type: z.string().nullable().optional(),
  seniority_hint: z.string().nullable().optional(),
  posted_at: z.string().nullable().optional(),
  apply_url: z.string().nullable().optional(),
  raw: z.record(z.string(), z.unknown()).default({}),
});

const payloadSchema = z.object({
  source_key: z.string().min(1),
  jobs: z.array(jobSchema).max(500),
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/ingest-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-ingest-token");
        if (!token) return json({ error: "x-ingest-token ausente" }, 401);

        let payload: z.infer<typeof payloadSchema>;
        try {
          payload = payloadSchema.parse(await request.json());
        } catch (error) {
          const message = error instanceof z.ZodError ? error.issues.slice(0, 5) : "payload inválido";
          return json({ error: "payload inválido", details: message }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: source } = await supabaseAdmin
          .from("job_sources")
          .select("id, key, ingest_token_hash, is_active, source_type, config")
          .eq("key", payload.source_key)
          .maybeSingle();

        if (!source || !source.is_active || source.source_type !== "push" || !source.ingest_token_hash) {
          return json({ error: "fonte push inválida ou inativa" }, 404);
        }

        const provided = Buffer.from(createHash("sha256").update(token).digest("hex"));
        const expected = Buffer.from(source.ingest_token_hash);
        if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
          return json({ error: "token inválido" }, 401);
        }

        const { ingestJobs, startRun, finishRun } = await import("@/lib/ingest/pipeline.server");
        const runId = await startRun(source.id);
        try {
          const counters = await ingestJobs(
            payload.jobs.map((job) => ({
              ...job,
              source_key: job.source_key ?? payload.source_key,
              location_raw: job.location_raw ?? null,
              country: job.country ?? null,
              description_html: job.description_html ?? null,
              description_text: job.description_text ?? null,
              salary_min: job.salary_min ?? null,
              salary_max: job.salary_max ?? null,
              salary_currency: job.salary_currency ?? null,
              salary_period: job.salary_period ?? null,
              employment_type: job.employment_type ?? null,
              seniority_hint: job.seniority_hint ?? null,
              posted_at: job.posted_at ?? null,
              apply_url: job.apply_url ?? null,
            })),
            { sourceId: source.id, defaultCountry: ((source.config ?? {}) as { country?: string }).country ?? null },
          );
          await finishRun(runId, source.id, counters, "success");
          return json(
            { received: counters.received, created: counters.created, updated: counters.updated, rejected: counters.rejected },
            200,
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await finishRun(runId, source.id, { received: payload.jobs.length, created: 0, updated: 0, rejected: payload.jobs.length, errors: [] }, "error", message);
          return json({ error: message }, 500);
        }
      },
    },
  },
});
