/**
 * Contrato único de ingestão de vagas do RUMVIA.
 * Todo adapter (pull) e todo coletor externo (push) fala nesta forma.
 */
export interface NormalizedJob {
  external_id: string;
  source_key: string;
  title: string;
  company_name: string;
  location_raw: string | null;
  is_remote: boolean;
  country: string | null;
  description_html: string | null;
  description_text: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  employment_type: string | null;
  seniority_hint: string | null;
  posted_at: string | null;
  apply_url: string | null;
  raw: Record<string, unknown>;
}

export interface AdapterConfig {
  board_tokens?: string[];
  query?: string;
  tags?: string[];
  market_segment?: string;
  country?: string;
  [key: string]: unknown;
}

export interface JobAdapter {
  key: string;
  /** Fonte paga ou ainda não homologada: fica no catálogo, mas não roda no MVP. */
  disabled?: boolean;
  disabledReason?: string;
  fetchJobs(cfg: AdapterConfig): Promise<NormalizedJob[]>;
}

export const MAX_JOBS_PER_REQUEST = 500;
