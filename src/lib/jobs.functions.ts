import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Listagem de vagas com cobertura de skills do usuário.
 *
 * IMPORTANTE: `coveredSkills / totalSkills` NÃO é o score de aderência. A fórmula
 * de gap é única e vive em `gap.functions.ts` (CLAUDE.md, regra 3) — ela pondera
 * demanda de mercado e baseline da trilha. Aqui é só uma contagem direta de
 * quantas skills pedidas na vaga o usuário já tem, para orientar a leitura da
 * lista. Nunca apresente este número como "aderência".
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface JobListItem {
  id: string;
  title: string;
  companyName: string | null;
  companyId: string | null;
  logoUrl: string | null;
  seniority: string | null;
  marketSegment: string;
  locationRaw: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  isRemote: boolean;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  applyUrl: string | null;
  postedAt: string | null;
  descriptionLang: string | null;
  /** Skills da vaga que o usuário já possui (nível > 0). Não é score de gap. */
  coveredSkills: number;
  /** Total de skills extraídas da vaga. */
  totalSkills: number;
  /** As que faltam, para leitura rápida no card. */
  missingTop: Array<{ skillId: string; name: string }>;
}

export interface JobsPage {
  items: JobListItem[];
  total: number;
  /** Quantas vagas existem na trilha/segmento, ignorando os demais filtros. */
  totalNoFilters: number;
}

export interface JobDetail extends JobListItem {
  descriptionText: string | null;
  sourceKey: string | null;
  skills: Array<{
    skillId: string;
    name: string;
    slug: string;
    categoryName: string | null;
    isRequired: boolean | null;
    userLevel: number;
  }>;
}

interface ListJobsInput {
  trackId: string;
  segment: string;
  seniorities?: string[];
  /** Busca textual em título e empresa. */
  search?: string;
  onlyRemote?: boolean;
  withSalary?: boolean;
  /** Só vagas em que falta no máximo N skills. */
  maxMissing?: number;
  limit?: number;
  offset?: number;
}

// ─── Lista ───────────────────────────────────────────────────────────────────

export const listJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ListJobsInput) => input)
  .handler(async ({ data, context }): Promise<JobsPage> => {
    const { supabase, userId } = context;
    const limit = Math.min(data.limit ?? 25, 100);
    const offset = data.offset ?? 0;

    // Contagem base da trilha/segmento — serve para diferenciar "sem vagas na
    // base" de "seus filtros não retornaram nada".
    //
    // `canonical_job_id is null` em ambas as consultas: a mesma vaga
    // sindicalizada em três fontes apareceria três vezes na lista, e o usuário
    // leria isso como três oportunidades. As cópias seguem na base — o
    // apply_url de cada fonte continua acessível pelo detalhe — mas quem lista
    // é o canônico. Aqui não dá para usar a view job_postings_canonical: o
    // embed `companies(...)` do PostgREST depende da FK, que a view não carrega.
    const { count: totalNoFilters } = await supabase
      .from("job_postings")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true)
      .is("canonical_job_id", null)
      .eq("track_id", data.trackId)
      .eq("market_segment", data.segment);

    let q = supabase
      .from("job_postings")
      .select(
        "id, title, company_id, company_name_raw, seniority, market_segment, location_raw, city, state, country, is_remote, salary_min, salary_max, salary_currency, salary_period, apply_url, posted_at, ingested_at, description_lang, companies(name, logo_url)",
        { count: "exact" },
      )
      .eq("is_active", true)
      .is("canonical_job_id", null)
      .eq("track_id", data.trackId)
      .eq("market_segment", data.segment);

    if (data.seniorities?.length) q = q.in("seniority", data.seniorities);
    if (data.onlyRemote) q = q.eq("is_remote", true);
    if (data.withSalary) q = q.not("salary_min", "is", null);
    if (data.search?.trim()) {
      const term = `%${data.search.trim()}%`;
      q = q.or(`title.ilike.${term},company_name_raw.ilike.${term}`);
    }

    const {
      data: rows,
      count,
      error,
    } = await q
      .order("posted_at", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(error.message);

    const jobIds = (rows ?? []).map((r) => r.id);
    if (jobIds.length === 0) {
      return { items: [], total: count ?? 0, totalNoFilters: totalNoFilters ?? 0 };
    }

    // Skills das vagas da página + skills do usuário, para a contagem de cobertura.
    const [{ data: jobSkills }, { data: userSkills }] = await Promise.all([
      supabase
        .from("job_posting_skills")
        .select("job_posting_id, skill_id, skills(canonical_name)")
        .in("job_posting_id", jobIds),
      supabase.from("user_skills").select("skill_id, level").eq("user_id", userId),
    ]);

    const owned = new Set(
      (userSkills ?? []).filter((u) => (u.level ?? 0) > 0).map((u) => u.skill_id),
    );

    const bucket = new Map<
      string,
      { total: number; covered: number; missing: Array<{ skillId: string; name: string }> }
    >();
    for (const js of jobSkills ?? []) {
      const entry = bucket.get(js.job_posting_id) ?? { total: 0, covered: 0, missing: [] };
      entry.total += 1;
      if (owned.has(js.skill_id)) {
        entry.covered += 1;
      } else if (entry.missing.length < 4) {
        const rel = js.skills as { canonical_name: string } | null;
        entry.missing.push({ skillId: js.skill_id, name: rel?.canonical_name ?? "—" });
      }
      bucket.set(js.job_posting_id, entry);
    }

    let items: JobListItem[] = (rows ?? []).map((r) => {
      const b = bucket.get(r.id) ?? { total: 0, covered: 0, missing: [] };
      const company = r.companies as { name: string; logo_url: string | null } | null;
      return {
        id: r.id,
        title: r.title,
        companyName: company?.name ?? r.company_name_raw ?? null,
        companyId: r.company_id,
        logoUrl: company?.logo_url ?? null,
        seniority: r.seniority,
        marketSegment: r.market_segment,
        locationRaw: r.location_raw,
        city: r.city,
        state: r.state,
        country: r.country,
        isRemote: r.is_remote,
        salaryMin: r.salary_min,
        salaryMax: r.salary_max,
        salaryCurrency: r.salary_currency,
        salaryPeriod: r.salary_period,
        applyUrl: r.apply_url,
        postedAt: r.posted_at ?? r.ingested_at,
        descriptionLang: r.description_lang,
        coveredSkills: b.covered,
        totalSkills: b.total,
        missingTop: b.missing,
      };
    });

    // Filtro por lacunas roda depois da contagem (depende das skills do usuário).
    if (data.maxMissing !== undefined) {
      const max = data.maxMissing;
      items = items.filter((i) => i.totalSkills - i.coveredSkills <= max);
    }

    return { items, total: count ?? 0, totalNoFilters: totalNoFilters ?? 0 };
  });

// ─── Detalhe ─────────────────────────────────────────────────────────────────

export const getJobDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { jobId: string }) => input)
  .handler(async ({ data, context }): Promise<JobDetail | null> => {
    const { supabase, userId } = context;

    const { data: job, error } = await supabase
      .from("job_postings")
      .select(
        "id, title, company_id, company_name_raw, seniority, market_segment, location_raw, city, state, country, is_remote, salary_min, salary_max, salary_currency, salary_period, apply_url, posted_at, ingested_at, description_lang, description_text, companies(name, logo_url), job_sources(key)",
      )
      .eq("id", data.jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) return null;

    const [{ data: jobSkills }, { data: userSkills }] = await Promise.all([
      supabase
        .from("job_posting_skills")
        .select("skill_id, is_required, skills(canonical_name, slug, skill_categories(name))")
        .eq("job_posting_id", data.jobId),
      supabase.from("user_skills").select("skill_id, level").eq("user_id", userId),
    ]);

    const levels = new Map((userSkills ?? []).map((u) => [u.skill_id, u.level ?? 0]));

    const skills = (jobSkills ?? []).map((js) => {
      const s = js.skills as {
        canonical_name: string;
        slug: string;
        skill_categories: { name: string } | null;
      } | null;
      return {
        skillId: js.skill_id,
        name: s?.canonical_name ?? "—",
        slug: s?.slug ?? "",
        categoryName: s?.skill_categories?.name ?? null,
        isRequired: js.is_required,
        userLevel: levels.get(js.skill_id) ?? 0,
      };
    });
    // Faltantes primeiro; dentro de cada grupo, obrigatórias antes.
    skills.sort((a, b) => {
      if (a.userLevel > 0 !== b.userLevel > 0) return a.userLevel > 0 ? 1 : -1;
      if (a.isRequired !== b.isRequired) return a.isRequired ? -1 : 1;
      return a.name.localeCompare(b.name, "pt-BR");
    });

    const company = job.companies as { name: string; logo_url: string | null } | null;
    const source = job.job_sources as { key: string } | null;
    const covered = skills.filter((s) => s.userLevel > 0).length;

    return {
      id: job.id,
      title: job.title,
      companyName: company?.name ?? job.company_name_raw ?? null,
      companyId: job.company_id,
      logoUrl: company?.logo_url ?? null,
      seniority: job.seniority,
      marketSegment: job.market_segment,
      locationRaw: job.location_raw,
      city: job.city,
      state: job.state,
      country: job.country,
      isRemote: job.is_remote,
      salaryMin: job.salary_min,
      salaryMax: job.salary_max,
      salaryCurrency: job.salary_currency,
      salaryPeriod: job.salary_period,
      applyUrl: job.apply_url,
      postedAt: job.posted_at ?? job.ingested_at,
      descriptionLang: job.description_lang,
      descriptionText: job.description_text,
      sourceKey: source?.key ?? null,
      coveredSkills: covered,
      totalSkills: skills.length,
      missingTop: skills
        .filter((s) => s.userLevel === 0)
        .slice(0, 4)
        .map((s) => ({ skillId: s.skillId, name: s.name })),
      skills,
    };
  });
