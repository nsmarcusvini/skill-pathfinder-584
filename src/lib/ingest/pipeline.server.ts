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
  parseLocation,
  normalizeTitle,
  toAnnual,
} from "./normalize";
import type { Json } from "@/integrations/supabase/types";
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
  if (classifierCache && Date.now() - classifierCache.loadedAt < 5 * 60_000)
    return classifierCache.variants;
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

function classifyTrack(
  titleNormalized: string,
  variants: TrackRef[],
): { track_id: string | null; role_variant_id: string | null } {
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
export async function ingestJobs(
  jobs: NormalizedJob[],
  options: PipelineOptions,
): Promise<IngestCounters> {
  const counters: IngestCounters = {
    received: jobs.length,
    created: 0,
    updated: 0,
    rejected: 0,
    errors: [],
  };
  const variants = await loadClassifier();

  for (const job of jobs) {
    try {
      if (!job.title?.trim() || !job.external_id) {
        counters.rejected += 1;
        continue;
      }

      const text = job.description_text ?? null;
      const country = normalizeCountry(
        job.location_raw,
        job.country ?? options.defaultCountry ?? null,
      );
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
      // city/state nunca eram preenchidos: as colunas existiam vazias na base
      // inteira, e por isso não dava para filtrar vaga por localidade.
      const local = parseLocation(job.location_raw);

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
        city: local.city,
        state: local.state,
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

        // Campos opcionais do NormalizedJob. Fontes ricas (Bright Data)
        // preenchem; as demais deixam null e nada quebra.
        work_modality: job.work_modality ?? (job.is_remote ? "remoto" : null),
        requirements_text: job.requirements_text ?? null,
        qualifications_text: job.qualifications_text ?? null,
        benefits_text: job.benefits_text ?? null,
        source_url: job.source_url ?? null,
        source_job_id: job.source_job_id ?? job.external_id,
        source_updated_at: job.source_updated_at ?? null,

        // Marca que a vaga foi VISTA agora. É o que sustenta a expiração:
        // vaga que para de aparecer na coleta tem last_seen_at parado, e
        // deactivateStaleJobs a desativa depois de 45 dias.
        last_seen_at: new Date().toISOString(),
        lifecycle_status: "ativa",
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
        } as unknown as Json,
      });

      // A ingestão NÃO grava mais salary_observations.
      //
      // O track_id vinha de classifyTrack(), que devolve null quando o título da
      // vaga não bate com nenhuma track_role_variants — 108 das 111 observações
      // nasceram sem trilha. Como mv_salary_stats agrupa por track_id e descarta
      // nulo, a tela /salarios ficava vazia em toda trilha que não fosse
      // fullstack, e o que passava vinha inconsistente (segmento 'br' pagando em
      // USD, faixa zerada). Salário virou curadoria manual do admin, em
      // createSalaryObservation. Ver 20260828120000_salarios_manuais.sql.
      //
      // A faixa continua sendo gravada em job_postings (salary_min/salary_max),
      // que é o que a tela de Vagas mostra — só a estatística agregada deixou de
      // ser alimentada por aqui.
    } catch (error) {
      counters.rejected += 1;
      counters.errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return counters;
}

/**
 * Desativa vagas não VISTAS há 45 dias.
 *
 * Passou a olhar last_seen_at em vez de ingested_at. A diferença importa: uma
 * vaga ingerida há 60 dias mas que continua aparecendo em toda coleta segue
 * aberta, e antes era desativada por idade. Já uma que sumiu da fonte tem
 * last_seen_at parado — e é essa que deve expirar.
 *
 * COALESCE com ingested_at cobre as vagas anteriores à coluna existir.
 */
export async function deactivateStaleJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("job_postings")
    .update({ is_active: false, lifecycle_status: "expirada" })
    .lt("last_seen_at", cutoff)
    .eq("is_active", true)
    .select("id");
  return data?.length ?? 0;
}

export interface DedupeResult {
  grupos: number;
  duplicatas: number;
  alteradas: number;
}

/**
 * Reelege o registro canônico de cada vaga sindicalizada entre fontes.
 *
 * A lógica inteira vive na função SQL `dedupe_job_postings` — aqui é só a
 * chamada. É deliberado: as RPCs de mercado (market_demand, tool_ranking...)
 * leem a tabela AO VIVO, não a matview, então a eleição precisa acontecer no
 * fim de cada ingestão, e não só na hora de recalcular as views.
 *
 * Idempotente: rodar de novo sem dado novo devolve alteradas = 0.
 */
export async function dedupeJobPostings(): Promise<DedupeResult> {
  const { data, error } = await supabaseAdmin.rpc("dedupe_job_postings").maybeSingle();
  if (error) throw new Error(`dedupe_job_postings: ${error.message}`);
  return {
    grupos: data?.grupos ?? 0,
    duplicatas: data?.duplicatas ?? 0,
    alteradas: data?.alteradas ?? 0,
  };
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
        error:
          error ??
          (counters.errors.length > 0
            ? counters.errors.slice(0, 5).join(" | ").slice(0, 1000)
            : null),
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
