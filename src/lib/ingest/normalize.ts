/**
 * Normalização compartilhada: título, senioridade, idioma, país, moeda, salário
 * e classificação de market_segment. Usada pelo fluxo pull e pelo webhook push.
 */

export function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function deaccent(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeTitle(title: string): string {
  return deaccent(title)
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[|/–—-]+/g, " ")
    .replace(/\b(m\/f\/d|remoto|remote|hibrido|hybrid|presencial|onsite|clt|pj|efetivo|vaga)\b/g, " ")
    .replace(/[^a-z0-9+#.\s]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Regex bilíngue de senioridade. Ordem importa: staff/lead antes de sênior. */
const SENIORITY_RULES: Array<{ seniority: string; re: RegExp }> = [
  { seniority: "especialista", re: /\b(staff|principal|lead|tech lead|head|especialista|specialist|architect|arquiteto)\b/ },
  { seniority: "senior", re: /\b(sr\.?|senior|senior|sênior|iii|3)\b/ },
  { seniority: "junior", re: /\b(jr\.?|junior|júnior|entry[- ]?level|trainee|estagio|estágio|intern|internship|i)\b/ },
  { seniority: "pleno", re: /\b(pleno|mid[- ]?level|mid|middle|ii|2)\b/ },
];

export function inferSeniority(title: string, hint?: string | null): string | null {
  const haystack = deaccent(`${hint ?? ""} ${title}`).toLowerCase();
  for (const rule of SENIORITY_RULES) {
    if (rule.re.test(haystack)) return rule.seniority;
  }
  return null;
}

const PT_STOPWORDS = ["você", "voce", "nós", "para", "com", "experiência", "experiencia", "conhecimento", "vaga", "empresa", "atuação", "atuacao", "desejável", "desejavel", "não", "nao", "que", "dos", "das"];
const EN_STOPWORDS = ["you", "we", "the", "with", "experience", "knowledge", "role", "team", "will", "our", "and", "about"];

export function detectLang(text: string | null): "pt" | "en" | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  const count = (words: string[]) =>
    words.reduce((acc, w) => acc + (lower.split(new RegExp(`\\b${w}\\b`, "g")).length - 1), 0);
  const pt = count(PT_STOPWORDS);
  const en = count(EN_STOPWORDS);
  if (pt === 0 && en === 0) return null;
  return pt >= en ? "pt" : "en";
}

const BR_CITIES = [
  "brasil", "brazil", "são paulo", "sao paulo", "rio de janeiro", "belo horizonte", "curitiba",
  "porto alegre", "florianópolis", "florianopolis", "recife", "fortaleza", "salvador", "brasília",
  "brasilia", "campinas", "goiânia", "goiania", "manaus", "belém", "belem", "vitória", "vitoria",
  "joinville", "santos", "sorocaba", "ribeirão preto", "ribeirao preto", "natal", "maceió", "maceio",
];

export function normalizeCountry(location: string | null, explicit?: string | null): string | null {
  if (explicit && explicit.trim().length === 2) return explicit.trim().toUpperCase();
  if (explicit && /brasil|brazil/i.test(explicit)) return "BR";
  if (!location) return explicit ? explicit.trim().toUpperCase().slice(0, 2) : null;
  const l = location.toLowerCase();
  if (BR_CITIES.some((c) => l.includes(c))) return "BR";
  if (/\b(portugal|lisboa|porto)\b/.test(l)) return "PT";
  if (/\b(united states|usa|u\.s\.|new york|san francisco|remote us)\b/.test(l)) return "US";
  if (/\b(canada|toronto|vancouver)\b/.test(l)) return "CA";
  if (/\b(united kingdom|uk|london)\b/.test(l)) return "GB";
  if (/\b(spain|españa|madrid|barcelona)\b/.test(l)) return "ES";
  if (/\b(germany|deutschland|berlin|munich)\b/.test(l)) return "DE";
  if (/\b(mexico|méxico|cdmx)\b/.test(l)) return "MX";
  if (/\b(argentina|buenos aires)\b/.test(l)) return "AR";
  return null;
}

export function normalizeCurrency(currency: string | null | undefined, country: string | null): string | null {
  if (currency) {
    const c = currency.trim().toUpperCase();
    if (c === "R$" || c === "BRL") return "BRL";
    if (c === "$" || c === "USD") return "USD";
    if (c === "€" || c === "EUR") return "EUR";
    if (/^[A-Z]{3}$/.test(c)) return c;
  }
  if (country === "BR") return "BRL";
  return null;
}

const PERIOD_FACTOR: Record<string, number> = {
  hour: 2080,
  hourly: 2080,
  day: 252,
  daily: 252,
  week: 52,
  weekly: 52,
  month: 12,
  monthly: 12,
  year: 1,
  yearly: 1,
  annual: 1,
};

/** Converte para período anual quando o fator é conhecido. */
export function toAnnual(
  min: number | null,
  max: number | null,
  period: string | null,
): { salary_min: number | null; salary_max: number | null; salary_period: string | null } {
  const key = (period ?? "").toLowerCase().trim();
  const factor = PERIOD_FACTOR[key];
  if (!factor) return { salary_min: min, salary_max: max, salary_period: period ?? null };
  return {
    salary_min: min === null ? null : Math.round(min * factor),
    salary_max: max === null ? null : Math.round(max * factor),
    salary_period: "year",
  };
}

export type MarketSegment = "br" | "remoto_global" | "outro";

export interface SegmentDecision {
  market_segment: MarketSegment;
  remote_restriction: string | null;
  /** Regra que decidiu — gravada em job_posting_raw para auditoria. */
  rule: string;
}

/** Classificação de segmento nas 4 regras, nesta ordem. */
export function classifyMarketSegment(input: {
  country: string | null;
  location_raw: string | null;
  is_remote: boolean;
  text: string | null;
}): SegmentDecision {
  const location = (input.location_raw ?? "").toLowerCase();
  const text = `${location} ${(input.text ?? "").slice(0, 6000).toLowerCase()}`;

  // 1. País BR ou local brasileiro
  if (input.country === "BR" || BR_CITIES.some((c) => location.includes(c))) {
    return { market_segment: "br", remote_restriction: input.is_remote ? "brazil_only" : null, rule: "1_pais_ou_local_br" };
  }

  // 2. Remoto com restrição a Brasil/LatAm
  if (input.is_remote) {
    if (/brazil only|brazil-only|apenas brasil|somente brasil|residir no brasil|based in brazil/.test(text)) {
      return { market_segment: "br", remote_restriction: "brazil_only", rule: "2_remoto_restrito_brasil" };
    }
    if (/latam|latin america|américa latina|america latina/.test(text)) {
      return { market_segment: "br", remote_restriction: "latam", rule: "2_remoto_restrito_latam" };
    }
    // 3. Remoto sem restrição de país
    return { market_segment: "remoto_global", remote_restriction: null, rule: "3_remoto_global" };
  }

  // 4. Presencial fora do Brasil
  return { market_segment: "outro", remote_restriction: null, rule: "4_presencial_fora_br" };
}

export function detectRemote(location: string | null, text: string | null, flag?: boolean | null): boolean {
  if (flag === true) return true;
  const haystack = `${location ?? ""} ${text?.slice(0, 2000) ?? ""}`.toLowerCase();
  return /\bremote\b|\bremoto\b|home ?office|anywhere|worldwide|100% remoto/.test(haystack);
}

export function dedupeHash(companyName: string, title: string, location: string | null): string {
  const base = `${deaccent(companyName).toLowerCase().trim()}|${normalizeTitle(title)}|${deaccent(location ?? "").toLowerCase().trim()}`;
  let h1 = 0x811c9dc5;
  for (let i = 0; i < base.length; i += 1) {
    h1 ^= base.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193) >>> 0;
  }
  return `${h1.toString(16)}-${base.length.toString(16)}`;
}
