/** Agregadores públicos de vagas remotas (JSON aberto, sem chave). */
import { fetchJson } from "../http";
import { detectRemote, stripHtml, toAnnual } from "../normalize";
import type { JobAdapter, NormalizedJob } from "../types";

function parseMoney(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const digits = value.replace(/[^0-9.]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

export const remotiveAdapter: JobAdapter = {
  key: "remotive",
  async fetchJobs(cfg) {
    const search = cfg.query ? `?search=${encodeURIComponent(String(cfg.query))}&limit=200` : "?limit=200";
    const data = await fetchJson<{ jobs: Array<any> }>(`https://remotive.com/api/remote-jobs${search}`);
    return (data.jobs ?? []).map((job): NormalizedJob => {
      const text = stripHtml(job.description ?? null);
      return {
        external_id: String(job.id),
        source_key: "remotive",
        title: String(job.title ?? ""),
        company_name: String(job.company_name ?? "Desconhecida"),
        location_raw: job.candidate_required_location ?? null,
        is_remote: true,
        country: null,
        description_html: job.description ?? null,
        description_text: text,
        salary_min: null,
        salary_max: null,
        salary_currency: null,
        salary_period: null,
        employment_type: job.job_type ?? null,
        seniority_hint: null,
        posted_at: job.publication_date ?? null,
        apply_url: job.url ?? null,
        raw: job,
      };
    });
  },
};

export const remoteokAdapter: JobAdapter = {
  key: "remoteok",
  async fetchJobs() {
    const data = await fetchJson<Array<any>>("https://remoteok.com/api");
    return (data ?? [])
      .filter((job) => job && job.id && job.position)
      .map((job): NormalizedJob => {
        const text = stripHtml(job.description ?? null);
        const salary = toAnnual(parseMoney(job.salary_min), parseMoney(job.salary_max), "year");
        return {
          external_id: String(job.id),
          source_key: "remoteok",
          title: String(job.position ?? ""),
          company_name: String(job.company ?? "Desconhecida"),
          location_raw: job.location ?? "Remote",
          is_remote: true,
          country: null,
          description_html: job.description ?? null,
          description_text: text,
          salary_min: salary.salary_min,
          salary_max: salary.salary_max,
          salary_currency: salary.salary_min ? "USD" : null,
          salary_period: salary.salary_period,
          employment_type: null,
          seniority_hint: Array.isArray(job.tags) ? job.tags.join(" ") : null,
          posted_at: job.date ?? null,
          apply_url: job.url ?? job.apply_url ?? null,
          raw: job,
        };
      });
  },
};

export const himalayasAdapter: JobAdapter = {
  key: "himalayas",
  async fetchJobs() {
    const data = await fetchJson<{ jobs: Array<any> }>("https://himalayas.app/jobs/api?limit=200");
    return (data.jobs ?? []).map((job): NormalizedJob => {
      const text = stripHtml(job.description ?? null);
      const salary = toAnnual(parseMoney(job.minSalary), parseMoney(job.maxSalary), "year");
      return {
        external_id: String(job.guid ?? job.id ?? job.applicationLink),
        source_key: "himalayas",
        title: String(job.title ?? ""),
        company_name: String(job.companyName ?? "Desconhecida"),
        location_raw: Array.isArray(job.locationRestrictions) && job.locationRestrictions.length > 0
          ? job.locationRestrictions.join(", ")
          : "Worldwide",
        is_remote: true,
        country: null,
        description_html: job.description ?? null,
        description_text: text,
        salary_min: salary.salary_min,
        salary_max: salary.salary_max,
        salary_currency: job.salaryCurrency ?? (salary.salary_min ? "USD" : null),
        salary_period: salary.salary_period,
        employment_type: job.employmentType ?? null,
        seniority_hint: job.seniority ? String(job.seniority) : null,
        posted_at: job.pubDate ? new Date(Number(job.pubDate) * 1000).toISOString() : null,
        apply_url: job.applicationLink ?? job.url ?? null,
        raw: job,
      };
    });
  },
};

export const jobicyAdapter: JobAdapter = {
  key: "jobicy",
  async fetchJobs() {
    const data = await fetchJson<{ jobs: Array<any> }>("https://jobicy.com/api/v2/remote-jobs?count=100");
    return (data.jobs ?? []).map((job): NormalizedJob => {
      const text = stripHtml(job.jobDescription ?? job.jobExcerpt ?? null);
      const salary = toAnnual(
        parseMoney(job.annualSalaryMin),
        parseMoney(job.annualSalaryMax),
        "year",
      );
      return {
        external_id: String(job.id),
        source_key: "jobicy",
        title: String(job.jobTitle ?? ""),
        company_name: String(job.companyName ?? "Desconhecida"),
        location_raw: job.jobGeo ?? "Anywhere",
        is_remote: true,
        country: null,
        description_html: job.jobDescription ?? null,
        description_text: text,
        salary_min: salary.salary_min,
        salary_max: salary.salary_max,
        salary_currency: job.salaryCurrency ?? null,
        salary_period: salary.salary_period,
        employment_type: Array.isArray(job.jobType) ? job.jobType.join(", ") : (job.jobType ?? null),
        seniority_hint: Array.isArray(job.jobLevel) ? job.jobLevel.join(" ") : (job.jobLevel ?? null),
        posted_at: job.pubDate ?? null,
        apply_url: job.url ?? null,
        raw: job,
      };
    });
  },
};

export const arbeitnowAdapter: JobAdapter = {
  key: "arbeitnow",
  async fetchJobs() {
    const data = await fetchJson<{ data: Array<any> }>("https://www.arbeitnow.com/api/job-board-api");
    return (data.data ?? []).map((job): NormalizedJob => {
      const text = stripHtml(job.description ?? null);
      return {
        external_id: String(job.slug),
        source_key: "arbeitnow",
        title: String(job.title ?? ""),
        company_name: String(job.company_name ?? "Desconhecida"),
        location_raw: job.location ?? null,
        is_remote: detectRemote(job.location ?? null, text, job.remote),
        country: null,
        description_html: job.description ?? null,
        description_text: text,
        salary_min: null,
        salary_max: null,
        salary_currency: null,
        salary_period: null,
        employment_type: Array.isArray(job.job_types) ? job.job_types.join(", ") : null,
        seniority_hint: Array.isArray(job.tags) ? job.tags.join(" ") : null,
        posted_at: job.created_at ? new Date(Number(job.created_at) * 1000).toISOString() : null,
        apply_url: job.url ?? null,
        raw: job,
      };
    });
  },
};
