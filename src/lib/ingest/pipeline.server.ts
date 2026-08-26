/**
 * PIPELINE ÚNICO de ingestão (normalização → classificação → upsert).
 * Chamado pelo fluxo pull (ingest-jobs) e pelo push (ingest-webhook).
 * Qualquer divergência entre os dois lados quebraria os números do produto,
 * então NUNCA duplique esta lógica: importe daqui.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

import {
  classifyMarketSegment,
  dedupeHash,
  detectLang,
  inferSeniority,
  normalizeCountry,
  normalizeCurrency,
  normalizeTitle,
  toAnnual,
} from "./normalize";
import type { NormalizedJob } from "./types";

export interface IngestCounters {
  received: number;
  created: number;
  updated: number;
  rejected: number;
  errors: string[];
}

interface TrackRef {
  track_id: string;
  role_variant_id: string;
  terms: string[];
}

let classifierCache: { loadedAt: number; variants: TrackRef[] } | null = null;

async function loadClassifier(): Promise<TrackRef[]> {
  if (classifierCache && Date.now() - classifierCache.loadedAt < 5 * 60_000) return classifierCache.variants;
  const { data } = await supabaseAdmin
    .from("track_role_variants")
    .select("id, track_id, search_terms")
    .eq("is_active", true);
  const variants: TrackRef[] = (data ?? []).map((v) => ({
    track_id: v.track_id,
    role_variant_id: v.id,
    terms: (v.search_terms ?? []).map((t: string) => t.toLowerCase()),
  }));
  classifierCache = { loadedAt: Date.now(), variants };
  return variants;
}

function classifyTrack(titleNormalized: string, variants: TrackRef[]): { track_id: string | null; role_variant_id: string | null } {
  let best: { ref: TrackRef; score: number } | null = null;
  for (const variant of variants) {
    for (const term of variant.terms) {
      if (!term) continue;
      if (titleNormalized.includes(term)) {
        const score = term.length;
        if (!best || score > best.score) best = { ref: variant, score };
      }
    }
  }
  return best
    ? { track_id: best.ref.track_id, role_variant_id: best.ref.role_variant_id }
    : { track_id: null, role_variant_id: null };
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

/** Casa a empresa por similaridade trigram > 0.9; cria quando não houver. */
async function resolveCompany(name: string): Promise<string | null> {
  const clean = name.trim();
  if (!clean) return null;
  const { data: match } = await supabaseAdmin.rpc("match_company", { _name: clean });
  if (typeof match === "string" && match) return match;

  const slug = slugify(clean);
  const { data: created, error } = await supabaseAdmin
    .from("companies")
    .upsert({ name: clean, slug }, { onConflict: "slug" })
    .select("id")
    .maybeSingle();
  if (error) return null;
  return created?.id ?? null;
}

export interface PipelineOptions {
  sourceId: string;
  defaultCountry?: string | null;
}

/** Normaliza, classifica e faz upsert por (source_id, external_id). */
export async function ingestJobs(jobs: NormalizedJob[], options: PipelineOptions): Promise<IngestCounters> {
  const counters: IngestCounters = { received: jobs.length, created: 0, updated: 0, rejected: 0, errors: [] };
  const variants = await loadClassifier();

  for (const job of jobs) {
    try {
      if (!job.title?.trim() || !job.external_id) {
        counters.rejected += 1;
        continue;
      }

      const text = job.description_text ?? null;
      const country = normalizeCountry(job.location_raw, job.country ?? options.defaultCountry ?? null);
      const segment = classifyMarketSegment({
        country,
        location_raw: job.location_raw,
        is_remote: job.is_remote,
        text,
      });
      const titleNormalized = normalizeTitle(job.title);
      const { track_id, role_variant_id } = classifyTrack(titleNormalized, variants);
      const salary = toAnnual(job.salary_min, job.salary_max, job.salary_period);
      const currency = normalizeCurrency(job.salary_currency, country);
      const companyId = await resolveCompany(job.company_name);

      const row = {
        source_id: options.sourceId,
        external_id: job.external_id,
        company_id: companyId,
        company_name_raw: job.company_name,
        title: job.title.trim(),
        title_normalized: titleNormalized,
        track_id,
        role_variant_id,
        seniority: inferSeniority(job.title, job.seniority_hint),
        location_raw: job.location_raw,
        country,
        is_remote: job.is_remote,
        remote_restriction: segment.remote_restriction,
        market_segment: segment.market_segment,
        description_lang: detectLang(text),
        employment_type: job.employment_type,
        description_text: text,
        salary_min: salary.salary_min,
        salary_max: salary.salary_max,
        salary_currency: currency,
        salary_period: salary.salary_period,
        apply_url: job.apply_url,
        posted_at: job.posted_at,
        ingested_at: new Date().toISOString(),
        dedupe_hash: dedupeHash(job.company_name, job.title, job.location_raw),
        is_active: true,
      };

      const { data: existing } = await supabaseAdmin
        .from("job_postings")
        .select("id")
        .eq("source_id", options.sourceId)
        .eq("external_id", job.external_id)
        .maybeSingle();

      const { data: upserted, error } = await supabaseAdmin
        .from("job_postings")
        .upsert(row, { onConflict: "source_id,external_id" })
        .select("id")
        .maybeSingle();

      if (error || !upserted) {
        counters.rejected += 1;
        if (error) counters.errors.push(`${job.external_id}: ${error.message}`);
        continue;
      }

      if (existing) counters.updated += 1;
      else counters.created += 1;

      // Auditoria: payload bruto + regra de segmento que decidiu.
      await supabaseAdmin.from("job_posting_raw").insert({
        job_posting_id: upserted.id,
        payload: {
          raw: job.raw,
          segment_rule: segment.rule,
          market_segment: segment.market_segment,
          remote_restriction: segment.remote_restriction,
          source_key: job.source_key,
        },
      });

      if (row.salary_min || row.salary_max) {
        await supabaseAdmin.from("salary_observations").insert({
          job_posting_id: upserted.id,
          track_id,
          seniority: row.seniority,
          market_segment: row.market_segment,
          country,
          currency: currency ?? (row.market_segment === "br" ? "BRL" : "USD"),
          amount_min: row.salary_min,
          amount_max: row.salary_max,
          period: row.salary_period ?? "year",
          source: "job_posting",
        });
      }
    } catch (error) {
      counters.rejected += 1;
      counters.errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return counters;
}

/** Desativa vagas não vistas há 45 dias. */
export async function deactivateStaleJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("job_postings")
    .update({ is_active: false })
    .lt("ingested_at", cutoff)
    .eq("is_active", true)
    .select("id");
  return data?.length ?? 0;
}

export async function startRun(sourceId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("ingestion_runs")
    .insert({ source_id: sourceId, status: "running" })
    .select("id")
    .maybeSingle();
  return data?.id ?? null;
}

export async function finishRun(
  runId: string | null,
  sourceId: string,
  counters: IngestCounters,
  status: "success" | "error",
  error?: string,
): Promise<void> {
  if (runId) {
    await supabaseAdmin
      .from("ingestion_runs")
      .update({
        finished_at: new Date().toISOString(),
        status,
        jobs_found: counters.received,
        jobs_new: counters.created,
        jobs_updated: counters.updated,
        error: error ?? (counters.errors.length > 0 ? counters.errors.slice(0, 5).join(" | ").slice(0, 1000) : null),
      })
      .eq("id", runId);
  }
  await supabaseAdmin
    .from("job_sources")
    .update({
      last_run_at: new Date().toISOString(),
      last_run_status: status,
      last_run_count: counters.created + counters.updated,
      error_message: error ?? null,
    })
    .eq("id", sourceId);
}
