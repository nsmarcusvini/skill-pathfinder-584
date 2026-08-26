/**
 * Extração determinística de skills das descrições de vaga.
 * SEM LLM: usa o MESMO matcher do parser de currículo (@/lib/skill-matcher).
 * Idempotente por job_posting_id, em lotes de 200.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildCatalogIndex,
  bestTrigram,
  matchCatalogSegments,
  normalize,
  stripLinks,
  TRIGRAM_SUGGEST_THRESHOLD,
  type CatalogIndex,
} from "@/lib/skill-matcher";

import { mineUnknownTerms, type MinedTerm } from "./mining";
import { isRequiredFromSegments, sectionizeJd, type JdSegment } from "./sections";

export const BATCH_SIZE = 200;
/** Mínimo de vagas distintas para um termo aparecer na curadoria humana. */
export const MIN_DISTINCT_JOBS = 3;

export interface ExtractionResult {
  processed: number;
  skills_written: number;
  jobs_with_few_skills: number;
  terms_queued: number;
  remaining: number;
}

interface JobRow {
  id: string;
  title: string;
  description_text: string | null;
  company_name_raw: string | null;
}

async function loadCatalog(): Promise<{ index: CatalogIndex; knownTerms: Set<string>; blocked: Set<string> }> {
  const [{ data: skills }, { data: aliases }, { data: blocklist }] = await Promise.all([
    supabaseAdmin.from("skills").select("id, canonical_name, is_ambiguous, match_patterns"),
    supabaseAdmin.from("skill_aliases").select("skill_id, alias"),
    supabaseAdmin.from("skill_term_blocklist").select("term"),
  ]);

  const index = buildCatalogIndex(
    (skills ?? []).map((s) => ({
      id: s.id,
      canonical_name: s.canonical_name,
      is_ambiguous: s.is_ambiguous,
      match_patterns: s.match_patterns ?? [],
    })),
    (aliases ?? []).map((a) => ({ skill_id: a.skill_id, alias: String(a.alias) })),
  );

  const knownTerms = new Set(index.normTerms.map((t) => t.norm));
  const blocked = new Set((blocklist ?? []).map((b) => normalize(b.term)));
  return { index, knownTerms, blocked };
}

interface TermAggregate extends MinedTerm {
  jobs: Set<string>;
}

/**
 * Processa um lote de vagas. Sem filtros, pega as que ainda não têm
 * skills_extracted_at (ou cuja descrição mudou depois da última extração).
 */
export async function extractJdSkills(options?: {
  jobIds?: string[];
  since?: string;
  force?: boolean;
  limit?: number;
}): Promise<ExtractionResult> {
  const limit = Math.min(options?.limit ?? BATCH_SIZE, BATCH_SIZE);
  const { index, knownTerms, blocked } = await loadCatalog();

  let query = supabaseAdmin
    .from("job_postings")
    .select("id, title, description_text, company_name_raw")
    .limit(limit);

  if (options?.jobIds && options.jobIds.length > 0) query = query.in("id", options.jobIds);
  else {
    query = query.eq("is_active", true);
    if (options?.since) query = query.gte("ingested_at", options.since);
    if (!options?.force) query = query.is("skills_extracted_at", null);
  }

  const { data: jobs, error } = await query;
  if (error) throw new Error(`Falha ao ler vagas: ${error.message}`);

  const rows = (jobs ?? []) as JobRow[];
  const terms = new Map<string, TermAggregate>();
  let skillsWritten = 0;
  let jobsWithFewSkills = 0;

  for (const job of rows) {
    const description = job.description_text ?? "";
    const clean = stripLinks(`${job.title}\n${description}`, job.company_name_raw);
    const sections = sectionizeJd(clean);

    const segments: Array<[JdSegment, string]> = [
      ["requisitos", sections.requisitos],
      ["desejavel", sections.desejavel],
      ["outro", sections.outro],
    ];
    const { matches } = matchCatalogSegments<JdSegment>(segments, index);

    const payload = matches.map((match) => ({
      job_posting_id: job.id,
      skill_id: match.skill_id,
      mention_count: match.count,
      is_required: isRequiredFromSegments(match.segments),
      confidence: match.confidence,
      matched_alias: match.matched_alias,
      extraction_method: match.matched_by,
    }));

    // idempotente: substitui o conjunto de skills daquela vaga
    await supabaseAdmin.from("job_posting_skills").delete().eq("job_posting_id", job.id);
    if (payload.length > 0) {
      const { error: insertError } = await supabaseAdmin.from("job_posting_skills").insert(payload);
      if (insertError) throw new Error(`Falha ao gravar skills da vaga: ${insertError.message}`);
      skillsWritten += payload.length;
    }
    if (payload.length < 3) jobsWithFewSkills += 1;

    await supabaseAdmin
      .from("job_postings")
      .update({ skills_extracted_at: new Date().toISOString() })
      .eq("id", job.id);

    for (const mined of mineUnknownTerms(sections, {
      knownTerms,
      blocked,
      companyName: job.company_name_raw,
    })) {
      const key = normalize(mined.term);
      const existing = terms.get(key);
      if (existing) {
        existing.occurrences += mined.occurrences;
        existing.jobs.add(job.id);
      } else {
        terms.set(key, { ...mined, jobs: new Set([job.id]) });
      }
    }
  }

  const termsQueued = await upsertPendingTerms(Array.from(terms.values()), index);

  const { count: remaining } = await supabaseAdmin
    .from("job_postings")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true)
    .is("skills_extracted_at", null);

  return {
    processed: rows.length,
    skills_written: skillsWritten,
    jobs_with_few_skills: jobsWithFewSkills,
    terms_queued: termsQueued,
    remaining: remaining ?? 0,
  };
}

/** Agrega candidatos na fila de curadoria, somando ocorrências e vagas distintas. */
async function upsertPendingTerms(aggregates: TermAggregate[], index: CatalogIndex): Promise<number> {
  if (aggregates.length === 0) return 0;

  const { data: existing } = await supabaseAdmin
    .from("pending_skill_terms")
    .select("id, term, occurrences, distinct_jobs, status");

  const byTerm = new Map((existing ?? []).map((row) => [normalize(row.term), row]));
  const now = new Date().toISOString();
  let queued = 0;

  for (const aggregate of aggregates) {
    const key = normalize(aggregate.term);
    const previous = byTerm.get(key);

    if (previous) {
      if (previous.status !== "novo") continue; // aprovado/rejeitado não volta para a fila
      await supabaseAdmin
        .from("pending_skill_terms")
        .update({
          occurrences: (previous.occurrences ?? 0) + aggregate.occurrences,
          distinct_jobs: (previous.distinct_jobs ?? 0) + aggregate.jobs.size,
          last_seen: now,
        })
        .eq("id", previous.id);
      queued += 1;
      continue;
    }

    const suggestion = bestTrigram(aggregate.term, index);
    await supabaseAdmin.from("pending_skill_terms").insert({
      term: aggregate.term,
      lang: aggregate.lang,
      occurrences: aggregate.occurrences,
      distinct_jobs: aggregate.jobs.size,
      example_snippet: aggregate.snippet.slice(0, 500),
      first_seen: now,
      last_seen: now,
      status: "novo",
      suggested_skill_id:
        suggestion.score >= TRIGRAM_SUGGEST_THRESHOLD ? suggestion.skillId : null,
      context: "jd",
    });
    queued += 1;
  }

  return queued;
}

/** Reprocessa vagas específicas ou de um período (após curar a fila). */
export async function reprocessJdSkills(input: {
  jobIds?: string[];
  since?: string;
}): Promise<ExtractionResult[]> {
  const results: ExtractionResult[] = [];
  if (input.jobIds && input.jobIds.length > 0) {
    for (let i = 0; i < input.jobIds.length; i += BATCH_SIZE) {
      results.push(await extractJdSkills({ jobIds: input.jobIds.slice(i, i + BATCH_SIZE), force: true }));
    }
    return results;
  }

  // por período: no máximo 10 lotes por chamada, o resto fica para a próxima
  for (let batch = 0; batch < 10; batch++) {
    const result = await extractJdSkills({ since: input.since ?? "", force: true, limit: BATCH_SIZE });
    results.push(result);
    if (result.processed < BATCH_SIZE) break;
  }
  return results;
}

export interface ExtractionHealth {
  jobs_total: number;
  jobs_extracted: number;
  median_skills_per_job: number;
  pct_jobs_below_three: number;
  dictionary_gap: boolean;
  pending_terms: number;
}

/** Métrica de qualidade: mediana de skills/vaga e % de vagas com menos de 3. */
export async function extractionHealth(): Promise<ExtractionHealth> {
  // PostgREST limita a 1000 linhas por página: pagina até esgotar.
  const counts: Array<{ job_posting_id: string }> = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from("job_posting_skills")
      .select("job_posting_id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    counts.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  const [{ count: pendingTerms }] = await Promise.all([
    supabaseAdmin
      .from("pending_skill_terms")
      .select("id", { count: "exact", head: true })
      .eq("status", "novo")
      .gte("distinct_jobs", MIN_DISTINCT_JOBS),
  ]);

  const [{ count: jobsTotal }, { count: jobsExtracted }] = await Promise.all([
    supabaseAdmin.from("job_postings").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabaseAdmin
      .from("job_postings")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .not("skills_extracted_at", "is", null),
  ]);

  const perJob = new Map<string, number>();
  for (const row of counts) perJob.set(row.job_posting_id, (perJob.get(row.job_posting_id) ?? 0) + 1);

  const extracted = jobsExtracted ?? 0;
  const values: number[] = [];
  for (const value of perJob.values()) values.push(value);
  // vagas processadas sem nenhuma skill contam como zero
  while (values.length < extracted) values.push(0);
  values.sort((a, b) => a - b);

  const median =
    values.length === 0
      ? 0
      : values.length % 2 === 1
        ? values[(values.length - 1) / 2]!
        : ((values[values.length / 2 - 1]! + values[values.length / 2]!) / 2);

  const below = values.filter((v) => v < 3).length;
  const pct = values.length === 0 ? 0 : Math.round((below / values.length) * 1000) / 10;

  return {
    jobs_total: jobsTotal ?? 0,
    jobs_extracted: extracted,
    median_skills_per_job: median,
    pct_jobs_below_three: pct,
    dictionary_gap: pct > 15,
    pending_terms: pendingTerms ?? 0,
  };
}
