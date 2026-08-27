import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function sinceDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ToolRankingItem {
  skillId: string;
  name: string;
  slug: string;
  categoryKey: string;
  categoryName: string;
  demand: number;
  jobs: number;
  totalJobs: number;
  trend: number;
  isCertifiable: boolean;
  websiteUrl: string | null;
}

export interface ToolDetail {
  demand: number;
  jobs: number;
  totalJobs: number;
  description: string | null;
  salaryCurrency: string;
  salaryP25: number | null;
  salaryP50: number | null;
  salaryP75: number | null;
  salarySample: number;
  companies: Array<{ name: string; jobs: number }>;
  cooccurrence: Array<{ skillId: string; name: string; jobs: number }>;
}

export interface ToolMonthlyRow {
  skillId: string;
  month: string;
  demand: number;
  jobs: number;
  totalJobs: number;
}

export interface CompanyRankingItem {
  companyId: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  website: string | null;
  industry: string | null;
  jobs: number;
  remoteJobs: number;
  segments: string[];
  lastPostedAt: string | null;
  avgSalaryMin: number | null;
  avgSalaryMax: number | null;
  currency: string;
  topSkills: Array<{ skillId: string; name: string; jobs: number }>;
}

export interface CompanySkillRow {
  skillId: string;
  name: string;
  jobs: number;
  totalJobs: number;
  userLevel: number;
}

export interface CompanyOpenJob {
  id: string;
  title: string;
  seniority: string | null;
  applyUrl: string;
  postedAt: string | null;
  marketSegment: string;
}

export interface CompanyDetail {
  companyId: string;
  skills: CompanySkillRow[];
  userMatchCount: number;
  openJobs: CompanyOpenJob[];
}

export interface CompanyMonthlyRow {
  month: string;
  jobs: number;
}

// ─── Tool Ranking ────────────────────────────────────────────────────────────

interface ToolRankingInput {
  trackId: string;
  segments: string[];
  seniorities: string[];
  periodDays: number;
  categories?: string[];
}

export const getToolRanking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ToolRankingInput) => input)
  .handler(async ({ data, context }): Promise<ToolRankingItem[]> => {
    const { supabase } = context;
    const rpcArgs = {
      _track_id: data.trackId,
      _segments: data.segments,
      _seniorities: data.seniorities,
      _since: sinceDaysAgo(data.periodDays),
      ...(data.categories?.length ? { _categories: data.categories } : {}),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await supabase.rpc("tool_ranking", rpcArgs as any);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      skillId: r.skill_id,
      name: r.name,
      slug: r.slug,
      categoryKey: r.category_key,
      categoryName: r.category_name,
      demand: r.demand,
      jobs: r.jobs,
      totalJobs: r.total_jobs,
      trend: r.trend,
      isCertifiable: r.is_certifiable,
      websiteUrl: r.website_url ?? null,
    }));
  });

// ─── Tool Detail ─────────────────────────────────────────────────────────────

interface ToolDetailInput {
  trackId: string;
  skillId: string;
  segments: string[];
  seniorities: string[];
  periodDays: number;
}

export const getToolDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ToolDetailInput) => input)
  .handler(async ({ data, context }): Promise<ToolDetail | null> => {
    const { supabase } = context;
    const [{ data: rows, error }, { data: skillRow }] = await Promise.all([
      supabase.rpc("tool_detail", {
        _track_id: data.trackId,
        _skill_id: data.skillId,
        _segments: data.segments,
        _seniorities: data.seniorities,
        _since: sinceDaysAgo(data.periodDays),
      }),
      supabase.from("skills").select("description").eq("id", data.skillId).maybeSingle(),
    ]);
    if (error) throw new Error(error.message);
    const d = rows?.[0];
    if (!d) return null;
    const companies =
      (d.companies as Array<{ name: string; jobs: number }> | null) ?? [];
    const cooccurrence =
      (d.cooccurrence as Array<{ skill_id: string; name: string; jobs: number }> | null) ?? [];
    return {
      demand: d.demand,
      jobs: d.jobs,
      totalJobs: d.total_jobs,
      description: skillRow?.description ?? null,
      salaryCurrency: d.salary_currency,
      salaryP25: d.salary_p25 ?? null,
      salaryP50: d.salary_p50 ?? null,
      salaryP75: d.salary_p75 ?? null,
      salarySample: d.salary_sample,
      companies,
      cooccurrence: cooccurrence.map((c) => ({
        skillId: c.skill_id,
        name: c.name,
        jobs: c.jobs,
      })),
    };
  });

// ─── Tool Monthly ────────────────────────────────────────────────────────────

interface ToolMonthlyInput {
  trackId: string;
  skillIds: string[];
  segments: string[];
  seniorities: string[];
  months: number;
}

export const getToolMonthly = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ToolMonthlyInput) => input)
  .handler(async ({ data, context }): Promise<ToolMonthlyRow[]> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.rpc("tool_monthly", {
      _track_id: data.trackId,
      _skill_ids: data.skillIds,
      _segments: data.segments,
      _seniorities: data.seniorities,
      _months: data.months,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      skillId: r.skill_id,
      month: r.month,
      demand: r.demand,
      jobs: r.jobs,
      totalJobs: r.total_jobs,
    }));
  });

// ─── Company Ranking ─────────────────────────────────────────────────────────

interface CompanyRankingInput {
  trackId: string;
  segments: string[];
  seniorities: string[];
  periodDays: number;
}

export const getCompanyRanking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CompanyRankingInput) => input)
  .handler(async ({ data, context }): Promise<CompanyRankingItem[]> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.rpc("company_ranking", {
      _track_id: data.trackId,
      _segments: data.segments,
      _seniorities: data.seniorities,
      _since: sinceDaysAgo(data.periodDays),
    });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      companyId: r.company_id,
      name: r.name,
      slug: r.slug,
      logoUrl: r.logo_url ?? null,
      website: r.website ?? null,
      industry: r.industry ?? null,
      jobs: r.jobs,
      remoteJobs: r.remote_jobs,
      segments: (r.segments as string[]) ?? [],
      lastPostedAt: r.last_posted_at ?? null,
      avgSalaryMin: r.avg_salary_min ?? null,
      avgSalaryMax: r.avg_salary_max ?? null,
      currency: r.currency,
      topSkills: (
        (r.top_skills as Array<{ skill_id: string; name: string; jobs: number }> | null) ?? []
      ).map((s) => ({ skillId: s.skill_id, name: s.name, jobs: s.jobs })),
    }));
  });

// ─── Company Detail ───────────────────────────────────────────────────────────

interface CompanyDetailInput {
  trackId: string;
  companyId: string;
  segments: string[];
  periodDays: number;
}

export const getCompanyDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CompanyDetailInput) => input)
  .handler(async ({ data, context }): Promise<CompanyDetail> => {
    const { supabase, userId } = context;

    const [{ data: demandRows }, { data: openJobRows }] = await Promise.all([
      supabase.rpc("company_skill_demand", {
        _track_id: data.trackId,
        _company_id: data.companyId,
        _segments: data.segments,
        _since: sinceDaysAgo(data.periodDays),
      }),
      supabase
        .from("job_postings")
        .select("id, title, seniority, apply_url, posted_at, market_segment")
        .eq("company_id", data.companyId)
        .eq("track_id", data.trackId)
        .eq("is_active", true)
        .in("market_segment", data.segments)
        .order("posted_at", { ascending: false })
        .limit(20),
    ]);

    const skillIds = (demandRows ?? []).map((r) => r.skill_id);

    const [{ data: skillMeta }, { data: userSkills }] = await Promise.all([
      skillIds.length
        ? supabase.from("skills").select("id, canonical_name").in("id", skillIds)
        : Promise.resolve({ data: [] as { id: string; canonical_name: string }[], error: null }),
      skillIds.length
        ? supabase
            .from("user_skills")
            .select("skill_id, level")
            .eq("user_id", userId)
            .in("skill_id", skillIds)
        : Promise.resolve({ data: [] as { skill_id: string; level: number }[], error: null }),
    ]);

    const nameBySkill = new Map((skillMeta ?? []).map((s) => [s.id, s.canonical_name]));
    const levelBySkill = new Map((userSkills ?? []).map((s) => [s.skill_id, s.level ?? 0]));

    const skills: CompanySkillRow[] = (demandRows ?? []).map((r) => ({
      skillId: r.skill_id,
      name: nameBySkill.get(r.skill_id) ?? "",
      jobs: r.jobs,
      totalJobs: r.total_jobs,
      userLevel: levelBySkill.get(r.skill_id) ?? 0,
    }));

    return {
      companyId: data.companyId,
      skills,
      userMatchCount: skills.filter((s) => s.userLevel > 0).length,
      openJobs: (openJobRows ?? []).map((j) => ({
        id: j.id,
        title: j.title,
        seniority: j.seniority ?? null,
        applyUrl: j.apply_url ?? "",
        postedAt: j.posted_at ?? null,
        marketSegment: j.market_segment,
      })),
    };
  });

// ─── Salary Stats ────────────────────────────────────────────────────────────

export interface SalaryStatRow {
  seniority: string;
  marketSegment: string;
  currency: string;
  p25: number;
  p50: number;
  p75: number;
  sampleSize: number;
}

export interface SalaryStatsResult {
  rows: SalaryStatRow[];
  usdBrl: number;
  rateDate: string;
}

export const getSalaryStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { trackId: string }) => input)
  .handler(async ({ data, context }): Promise<SalaryStatsResult> => {
    const { supabase } = context;
    const [{ data: rows }, { data: setting }] = await Promise.all([
      supabase
        .from("mv_salary_stats")
        .select("seniority, market_segment, currency, p25, p50, p75, sample_size")
        .eq("track_id", data.trackId)
        .not("seniority", "is", null),
      supabase.from("app_settings").select("value, updated_at").eq("key", "usd_brl").maybeSingle(),
    ]);

    const settingVal = setting?.value;
    let usdBrl = 5.4;
    let rateDate = setting?.updated_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    if (typeof settingVal === "number") {
      usdBrl = settingVal;
    } else if (settingVal && typeof settingVal === "object") {
      const v = settingVal as Record<string, unknown>;
      if (typeof v["rate"] === "number") usdBrl = v["rate"] as number;
      if (typeof v["date"] === "string") rateDate = v["date"] as string;
    }

    return {
      rows: (rows ?? []).map((r) => ({
        seniority: r.seniority!,
        marketSegment: r.market_segment!,
        currency: r.currency!,
        p25: r.p25 ?? 0,
        p50: r.p50 ?? 0,
        p75: r.p75 ?? 0,
        sampleSize: r.sample_size ?? 0,
      })),
      usdBrl,
      rateDate,
    };
  });

// ─── Salary Skill Impact ──────────────────────────────────────────────────────

export interface SalarySkillImpactRow {
  skillId: string;
  name: string;
  demand: number;
  salaryP50: number;
  salarySample: number;
  overallP50: number;
  deltaPct: number;
}

export const getSalarySkillImpact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { trackId: string; segment: string; periodDays: number }) => input)
  .handler(async ({ data, context }): Promise<SalarySkillImpactRow[]> => {
    const { supabase } = context;

    const [{ data: statRows }, { data: rankingRows }] = await Promise.all([
      supabase
        .from("mv_salary_stats")
        .select("p50, sample_size")
        .eq("track_id", data.trackId)
        .eq("market_segment", data.segment)
        .not("seniority", "is", null),
      supabase.rpc("tool_ranking", {
        _track_id: data.trackId,
        _segments: [data.segment],
        _since: sinceDaysAgo(data.periodDays),
      } as any),
    ]);

    const totalSample = (statRows ?? []).reduce((sum, r) => sum + (r.sample_size ?? 0), 0);
    const overallP50 =
      totalSample > 0
        ? (statRows ?? []).reduce((sum, r) => sum + (r.p50 ?? 0) * (r.sample_size ?? 0), 0) /
          totalSample
        : 0;

    const top15 = (rankingRows ?? []).slice(0, 15);
    if (top15.length === 0) return [];

    const detailResults = await Promise.all(
      top15.map((skill) =>
        supabase.rpc("tool_detail", {
          _track_id: data.trackId,
          _skill_id: skill.skill_id,
          _segments: [data.segment],
          _since: sinceDaysAgo(data.periodDays),
        } as any),
      ),
    );

    return top15.map((skill, i) => {
      const result = detailResults[i];
      const detail = result?.data?.[0];
      const salaryP50 = detail?.salary_p50 ?? 0;
      const salarySample = detail?.salary_sample ?? 0;
      const deltaPct = overallP50 > 0 ? ((salaryP50 - overallP50) / overallP50) * 100 : 0;
      return {
        skillId: skill.skill_id,
        name: skill.name,
        demand: skill.demand,
        salaryP50,
        salarySample,
        overallP50,
        deltaPct,
      };
    });
  });

// ─── Submit Salary Observation ────────────────────────────────────────────────

export interface SubmitSalaryInput {
  trackId: string;
  seniority: string;
  marketSegment: string;
  amountMin: number;
  amountMax: number;
  currency: string;
  period: string;
}

export const submitSalaryObservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SubmitSalaryInput) => input)
  .handler(async ({ data, context }): Promise<void> => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("salary_observations").insert({
      track_id: data.trackId,
      seniority: data.seniority,
      market_segment: data.marketSegment,
      amount_min: data.amountMin,
      amount_max: data.amountMax,
      currency: data.currency,
      period: data.period,
      source: "user",
      user_id: userId,
    });
    if (error) throw new Error(error.message);
  });

// ─── Company Monthly ──────────────────────────────────────────────────────────

interface CompanyMonthlyInput {
  trackId: string;
  companyId: string;
  segments: string[];
  months: number;
}

export const getCompanyMonthly = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CompanyMonthlyInput) => input)
  .handler(async ({ data, context }): Promise<CompanyMonthlyRow[]> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.rpc("company_monthly", {
      _track_id: data.trackId,
      _company_id: data.companyId,
      _segments: data.segments,
      _months: data.months,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({ month: r.month, jobs: r.jobs }));
  });
