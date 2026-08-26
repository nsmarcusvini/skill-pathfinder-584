import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Toda função aqui exige profiles.is_admin = true (checado sob RLS do próprio usuário). */
async function assertAdmin(supabase: { from: (t: string) => any }, userId: string) {
  const { data } = await supabase.from("profiles").select("is_admin").eq("id", userId).maybeSingle();
  if (!data?.is_admin) throw new Error("Acesso restrito a administradores.");
}

export interface AdminSource {
  id: string;
  key: string;
  name: string;
  adapter: string;
  source_type: string;
  is_active: boolean;
  has_token: boolean;
  config: Record<string, unknown>;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_count: number;
  error_message: string | null;
  jobs_total: number;
  jobs_active: number;
}

export const listSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminSource[]> => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: sources }, { data: postings }] = await Promise.all([
      supabaseAdmin.from("job_sources").select("*").order("key"),
      supabaseAdmin.from("job_postings").select("source_id, is_active"),
    ]);

    const counts = new Map<string, { total: number; active: number }>();
    for (const p of postings ?? []) {
      const entry = counts.get(p.source_id) ?? { total: 0, active: 0 };
      entry.total += 1;
      if (p.is_active) entry.active += 1;
      counts.set(p.source_id, entry);
    }

    return (sources ?? []).map((s) => ({
      id: s.id,
      key: s.key,
      name: s.name,
      adapter: s.adapter,
      source_type: s.source_type ?? "pull",
      is_active: s.is_active,
      has_token: Boolean(s.ingest_token_hash),
      config: (s.config ?? {}) as Record<string, unknown>,
      last_run_at: s.last_run_at,
      last_run_status: s.last_run_status,
      last_run_count: s.last_run_count ?? 0,
      error_message: s.error_message,
      jobs_total: counts.get(s.id)?.total ?? 0,
      jobs_active: counts.get(s.id)?.active ?? 0,
    }));
  });

export const runIngestNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ source_keys: z.array(z.string()).optional() }).parse(data))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { runIngest } = await import("@/lib/ingest/run.server");
    return runIngest(data.source_keys);
  });

export const toggleSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(data))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("job_sources").update({ is_active: data.is_active }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Cria (ou renova) uma fonte push e devolve o token em texto UMA única vez. */
export const issuePushToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ key: z.string().min(2).max(60), name: z.string().min(2).max(120) }).parse(data),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { createHash, randomBytes } = await import("crypto");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const token = randomBytes(32).toString("hex");
    const hash = createHash("sha256").update(token).digest("hex");

    const { error } = await supabaseAdmin.from("job_sources").upsert(
      {
        key: data.key,
        name: data.name,
        adapter: "push",
        source_type: "push",
        ingest_token_hash: hash,
        is_active: true,
        config: { pushed_by: "external" },
      },
      { onConflict: "key" },
    );
    if (error) throw new Error(error.message);
    return { source_key: data.key, token };
  });

export const importCsvJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ content: z.string().min(1).max(4_000_000), source_key: z.string().default("csv_manual") }).parse(data),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { parseCsv } = await import("@/lib/ingest/adapters/csv-manual");
    const { ingestJobs, startRun, finishRun } = await import("@/lib/ingest/pipeline.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const rows = parseCsv(data.content, data.source_key);
    const valid = rows.filter((r) => r.job).map((r) => r.job!);
    const invalid = rows.length - valid.length;
    if (valid.length === 0) return { received: rows.length, created: 0, updated: 0, rejected: rows.length, errors: ["Nenhuma linha válida."] };
    if (valid.length > 500) throw new Error("Limite de 500 vagas por importação.");

    const { data: source } = await supabaseAdmin
      .from("job_sources")
      .select("id")
      .eq("key", data.source_key)
      .maybeSingle();
    if (!source) throw new Error(`Fonte "${data.source_key}" não encontrada.`);

    const runId = await startRun(source.id);
    const counters = await ingestJobs(valid, { sourceId: source.id, defaultCountry: "BR" });
    counters.rejected += invalid;
    await finishRun(runId, source.id, counters, "success");
    return counters;
  });
