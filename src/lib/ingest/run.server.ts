/** Execução do fluxo PULL: seleciona fontes, roda adapters e chama o pipeline único. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { getAdapter } from "./adapters";
import {
  deactivateStaleJobs,
  finishRun,
  ingestJobs,
  startRun,
  type IngestCounters,
} from "./pipeline.server";
import type { AdapterConfig } from "./types";

export interface SourceResult {
  source_key: string;
  status: "success" | "error" | "skipped";
  received: number;
  created: number;
  updated: number;
  rejected: number;
  error?: string | undefined;
}

export async function runIngest(sourceKeys?: string[]): Promise<{
  sources: SourceResult[];
  deactivated: number;
}> {
  let query = supabaseAdmin.from("job_sources").select("id, key, adapter, config, is_active, source_type");
  if (sourceKeys && sourceKeys.length > 0) query = query.in("key", sourceKeys);
  else query = query.eq("is_active", true);

  const { data: sources, error } = await query;
  if (error) throw new Error(`Falha ao ler job_sources: ${error.message}`);

  const results: SourceResult[] = [];

  // Sequencial por fonte; a concorrência (máx. 5) vive no cliente HTTP.
  for (const source of sources ?? []) {
    if (source.source_type === "push") {
      results.push({ source_key: source.key, status: "skipped", received: 0, created: 0, updated: 0, rejected: 0, error: "fonte push: recebe por webhook" });
      continue;
    }
    const adapter = getAdapter(source.adapter);
    if (!adapter || adapter.disabled) {
      results.push({
        source_key: source.key,
        status: "skipped",
        received: 0,
        created: 0,
        updated: 0,
        rejected: 0,
        error: adapter?.disabledReason ?? `adapter "${source.adapter}" não implementado`,
      });
      continue;
    }

    const runId = await startRun(source.id);
    try {
      const cfg = (source.config ?? {}) as AdapterConfig;
      const jobs = await adapter.fetchJobs(cfg);
      const counters: IngestCounters = await ingestJobs(jobs, {
        sourceId: source.id,
        defaultCountry: (cfg.country as string) ?? null,
      });
      await finishRun(runId, source.id, counters, "success");
      results.push({ source_key: source.key, status: "success", ...counters });
    } catch (err) {
      // Falha em uma fonte não derruba as outras.
      const message = err instanceof Error ? err.message : String(err);
      await finishRun(runId, source.id, { received: 0, created: 0, updated: 0, rejected: 0, errors: [] }, "error", message.slice(0, 1000));
      results.push({ source_key: source.key, status: "error", received: 0, created: 0, updated: 0, rejected: 0, error: message });
    }
  }

  const deactivated = await deactivateStaleJobs();
  return { sources: results, deactivated };
}
