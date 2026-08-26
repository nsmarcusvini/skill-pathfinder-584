/**
 * Adapter csv_manual: cobre vagas brasileiras que nenhuma API gratuita entrega.
 * O arquivo é enviado em /admin/importar, validado linha a linha e pré-visualizado
 * antes de entrar no MESMO pipeline dos adapters de pull.
 */
import type { JobAdapter, NormalizedJob } from "../types";

export const CSV_COLUMNS = [
  "external_id",
  "title",
  "company_name",
  "location_raw",
  "is_remote",
  "country",
  "description_text",
  "salary_min",
  "salary_max",
  "salary_currency",
  "salary_period",
  "employment_type",
  "seniority_hint",
  "posted_at",
  "apply_url",
] as const;

export interface CsvRowResult {
  line: number;
  job: NormalizedJob | null;
  errors: string[];
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else current += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      out.push(current);
      current = "";
    } else current += ch;
  }
  out.push(current);
  return out.map((v) => v.trim());
}

function toNumber(value: string): number | null {
  if (!value) return null;
  const n = Number(value.replace(/[^0-9.,-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Valida linha a linha e devolve o resultado detalhado para a pré-visualização. */
export function parseCsv(content: string, sourceKey = "csv_manual"): CsvRowResult[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const delimiter = (lines[0]!.match(/;/g)?.length ?? 0) > (lines[0]!.match(/,/g)?.length ?? 0) ? ";" : ",";
  const header = splitCsvLine(lines[0]!, delimiter).map((h) => h.toLowerCase());
  const results: CsvRowResult[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i]!, delimiter);
    const get = (col: string) => {
      const idx = header.indexOf(col);
      return idx >= 0 ? (cells[idx] ?? "") : "";
    };
    const errors: string[] = [];
    const title = get("title");
    const company = get("company_name");
    const applyUrl = get("apply_url");
    if (!title) errors.push("title é obrigatório");
    if (!company) errors.push("company_name é obrigatório");
    if (applyUrl && !/^https?:\/\//i.test(applyUrl)) errors.push("apply_url deve começar com http(s)://");
    const postedAt = get("posted_at");
    if (postedAt && Number.isNaN(Date.parse(postedAt))) errors.push("posted_at inválido (use AAAA-MM-DD)");
    const currency = get("salary_currency").toUpperCase();
    if (currency && !/^[A-Z]{3}$/.test(currency)) errors.push("salary_currency deve ter 3 letras (BRL, USD)");

    if (errors.length > 0) {
      results.push({ line: i + 1, job: null, errors });
      continue;
    }

    const externalId = get("external_id") || `${company}-${title}-${get("location_raw")}`.toLowerCase().replace(/\s+/g, "-").slice(0, 120);
    const description = get("description_text") || null;

    results.push({
      line: i + 1,
      errors: [],
      job: {
        external_id: externalId,
        source_key: sourceKey,
        title,
        company_name: company,
        location_raw: get("location_raw") || null,
        is_remote: /^(1|true|sim|yes|remoto|remote)$/i.test(get("is_remote")),
        country: get("country").toUpperCase() || null,
        description_html: null,
        description_text: description,
        salary_min: toNumber(get("salary_min")),
        salary_max: toNumber(get("salary_max")),
        salary_currency: currency || null,
        salary_period: get("salary_period") || null,
        employment_type: get("employment_type") || null,
        seniority_hint: get("seniority_hint") || null,
        posted_at: postedAt ? new Date(postedAt).toISOString() : null,
        apply_url: applyUrl || null,
        raw: { imported_from: "csv_manual", line: i + 1 },
      },
    });
  }

  return results;
}

/** No fluxo automático o csv_manual não busca nada: só entra por upload no admin. */
export const csvManualAdapter: JobAdapter = {
  key: "manual",
  async fetchJobs() {
    return [];
  },
};
