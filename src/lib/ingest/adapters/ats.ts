/** Adapters de ATS com board público e estável (sem chave). */
import { fetchJson, mapPool } from "../http";
import { detectRemote, stripHtml, toAnnual } from "../normalize";
import type { AdapterConfig, JobAdapter, NormalizedJob } from "../types";

function tokens(cfg: AdapterConfig): string[] {
  return (cfg.board_tokens ?? []).filter((t): t is string => typeof t === "string" && t.length > 0);
}

async function collect(cfg: AdapterConfig, fn: (token: string) => Promise<NormalizedJob[]>) {
  const results = await mapPool(tokens(cfg), fn);
  const jobs: NormalizedJob[] = [];
  const errors: string[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") jobs.push(...r.value);
    else errors.push(String((r.reason as Error)?.message ?? r.reason));
  }
  if (jobs.length === 0 && errors.length > 0) throw new Error(errors.join(" | "));
  return jobs;
}

export const greenhouseAdapter: JobAdapter = {
  key: "greenhouse",
  async fetchJobs(cfg) {
    return collect(cfg, async (token) => {
      const data = await fetchJson<{ jobs: Array<any> }>(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`,
      );
      return (data.jobs ?? []).map((job): NormalizedJob => {
        const html = typeof job.content === "string" ? job.content.replace(/&lt;/g, "<").replace(/&gt;/g, ">") : null;
        const text = stripHtml(html);
        const location = job.location?.name ?? null;
        return {
          external_id: String(job.id),
          source_key: "greenhouse",
          title: String(job.title ?? ""),
          company_name: String(job.company_name ?? token),
          location_raw: location,
          is_remote: detectRemote(location, text),
          country: (cfg.country as string) ?? null,
          description_html: html,
          description_text: text,
          salary_min: null,
          salary_max: null,
          salary_currency: null,
          salary_period: null,
          employment_type: null,
          seniority_hint: null,
          posted_at: job.updated_at ?? job.first_published ?? null,
          apply_url: job.absolute_url ?? null,
          raw: { board_token: token, ...job },
        };
      });
    });
  },
};

export const leverAdapter: JobAdapter = {
  key: "lever",
  async fetchJobs(cfg) {
    return collect(cfg, async (token) => {
      const data = await fetchJson<Array<any>>(
        `https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`,
      );
      return (data ?? []).map((job): NormalizedJob => {
        const html = job.descriptionadesc ?? job.description ?? null;
        const text = stripHtml(html) ?? job.descriptionPlain ?? null;
        const location = job.categories?.location ?? null;
        return {
          external_id: String(job.id),
          source_key: "lever",
          title: String(job.text ?? ""),
          company_name: token,
          location_raw: location,
          is_remote: detectRemote(location, text, job.workplaceType === "remote"),
          country: (cfg.country as string) ?? null,
          description_html: html,
          description_text: text,
          salary_min: null,
          salary_max: null,
          salary_currency: null,
          salary_period: null,
          employment_type: job.categories?.commitment ?? null,
          seniority_hint: job.categories?.level ?? null,
          posted_at: job.createdAt ? new Date(job.createdAt).toISOString() : null,
          apply_url: job.hostedUrl ?? job.applyUrl ?? null,
          raw: { board_token: token, ...job },
        };
      });
    });
  },
};

export const ashbyAdapter: JobAdapter = {
  key: "ashby",
  async fetchJobs(cfg) {
    return collect(cfg, async (token) => {
      const data = await fetchJson<{ jobs: Array<any> }>(
        `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}?includeCompensation=true`,
      );
      return (data.jobs ?? []).map((job): NormalizedJob => {
        const html = job.descriptionHtml ?? null;
        const text = job.descriptionPlain ?? stripHtml(html);
        const comp = job.compensation?.compensationTierSummary ?? null;
        const range = job.compensation?.summaryComponents?.[0] ?? null;
        const salary = toAnnual(
          range?.minValue ?? null,
          range?.maxValue ?? null,
          range?.interval ? String(range.interval).toLowerCase().replace("per ", "") : null,
        );
        return {
          external_id: String(job.id),
          source_key: "ashby",
          title: String(job.title ?? ""),
          company_name: String(job.organizationName ?? token),
          location_raw: job.location ?? null,
          is_remote: detectRemote(job.location ?? null, text, job.isRemote),
          country: (cfg.country as string) ?? null,
          description_html: html,
          description_text: text,
          salary_min: salary.salary_min,
          salary_max: salary.salary_max,
          salary_currency: range?.currencyCode ?? null,
          salary_period: salary.salary_period,
          employment_type: job.employmentType ?? null,
          seniority_hint: null,
          posted_at: job.publishedAt ?? null,
          apply_url: job.jobUrl ?? job.applyUrl ?? null,
          raw: { board_token: token, compensation_summary: comp, ...job },
        };
      });
    });
  },
};

export const workableAdapter: JobAdapter = {
  key: "workable",
  async fetchJobs(cfg) {
    return collect(cfg, async (token) => {
      const data = await fetchJson<{ name?: string; jobs: Array<any> }>(
        `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(token)}?details=true`,
      );
      return (data.jobs ?? []).map((job): NormalizedJob => {
        const html = job.description ?? null;
        const text = stripHtml(`${html ?? ""}\n${job.requirements ?? ""}`);
        const location = [job.city, job.state, job.country].filter(Boolean).join(", ") || job.location || null;
        return {
          external_id: String(job.shortcode ?? job.id),
          source_key: "workable",
          title: String(job.title ?? ""),
          company_name: String(data.name ?? token),
          location_raw: location,
          is_remote: detectRemote(location, text, job.telecommuting),
          country: job.country_code ?? (cfg.country as string) ?? null,
          description_html: html,
          description_text: text,
          salary_min: null,
          salary_max: null,
          salary_currency: null,
          salary_period: null,
          employment_type: job.employment_type ?? null,
          seniority_hint: job.experience ?? null,
          posted_at: job.published_on ?? job.created_at ?? null,
          apply_url: job.application_url ?? job.url ?? null,
          raw: { board_token: token, ...job },
        };
      });
    });
  },
};

export const smartrecruitersAdapter: JobAdapter = {
  key: "smartrecruiters",
  async fetchJobs(cfg) {
    return collect(cfg, async (token) => {
      const data = await fetchJson<{ content: Array<any> }>(
        `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(token)}/postings?limit=100`,
      );
      return (data.content ?? []).map((job): NormalizedJob => {
        const city = job.location?.city ?? null;
        const country = job.location?.country ? String(job.location.country).toUpperCase() : null;
        const location = [city, job.location?.region, country].filter(Boolean).join(", ") || null;
        return {
          external_id: String(job.id),
          source_key: "smartrecruiters",
          title: String(job.name ?? ""),
          company_name: String(job.company?.name ?? token),
          location_raw: location,
          is_remote: detectRemote(location, null, job.location?.remote),
          country,
          description_html: null,
          description_text: job.jobAd?.sections?.jobDescription?.text ? stripHtml(job.jobAd.sections.jobDescription.text) : null,
          salary_min: null,
          salary_max: null,
          salary_currency: null,
          salary_period: null,
          employment_type: job.typeOfEmployment?.label ?? null,
          seniority_hint: job.experienceLevel?.label ?? null,
          posted_at: job.releasedDate ?? null,
          apply_url: job.applyUrl ?? job.ref ?? null,
          raw: { board_token: token, ...job },
        };
      });
    });
  },
};
