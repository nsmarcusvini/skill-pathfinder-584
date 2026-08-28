/**
 * Adapters da Bright Data: LinkedIn Jobs, Indeed e Glassdoor Jobs.
 *
 * Todos falam o contrato AsyncJobAdapter (duas fases) porque a coleta da
 * Bright Data é assíncrona. O resultado sai como NormalizedJob e segue pelo
 * MESMO pipeline dos outros adapters — nada de caminho paralelo (regra 9).
 *
 * SOBRE OS CAMPOS: cada dataset da Bright Data devolve um conjunto próprio, e
 * os nomes exatos variam por dataset e por versão. Como não dá para fixar um
 * esquema sem inspecionar a conta do cliente, o mapeamento é TOLERANTE: procura
 * o valor entre vários nomes plausíveis e cai para null quando não acha. O
 * registro cru inteiro vai para `raw`, então nada se perde e o mapeamento pode
 * ser refinado depois com dados reais em mãos, sem recoletar.
 *
 * Isso é deliberado: preferir null a inventar um campo que talvez não exista.
 */
import { dispararColeta, brightDataConfigurada } from "../providers/bright-data";
import type { AdapterConfig, AsyncJobAdapter, NormalizedJob } from "../types";

/* ------------------------------------------------------------------ leitura */

/** Primeiro valor não-vazio entre as chaves candidatas. */
function txt(r: Record<string, unknown>, ...chaves: string[]): string | null {
  for (const k of chaves) {
    const v = r[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

function num(r: Record<string, unknown>, ...chaves: string[]): number | null {
  for (const k of chaves) {
    const v = r[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      // "R$ 8.000,00" / "$120,000" -> número
      const limpo = v
        .replace(/[^\d.,-]/g, "")
        .replace(/\.(?=\d{3}\b)/g, "")
        .replace(",", ".");
      const n = Number.parseFloat(limpo);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function bool(r: Record<string, unknown>, ...chaves: string[]): boolean | null {
  for (const k of chaves) {
    const v = r[k];
    if (typeof v === "boolean") return v;
    if (typeof v === "string") {
      const s = v.toLowerCase();
      if (["true", "yes", "sim", "remote", "remoto"].includes(s)) return true;
      if (["false", "no", "nao", "não", "on-site", "onsite"].includes(s)) return false;
    }
  }
  return null;
}

/** Data em ISO, aceitando epoch em segundos ou milissegundos. */
function data(r: Record<string, unknown>, ...chaves: string[]): string | null {
  for (const k of chaves) {
    const v = r[k];
    if (typeof v === "number" && v > 0) {
      const ms = v < 1e12 ? v * 1000 : v;
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
    if (typeof v === "string" && v.trim()) {
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
  }
  return null;
}

function semHtml(html: string | null): string | null {
  if (!html) return null;
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Mapeamento comum. As três fontes entregam essencialmente os mesmos conceitos
 * com nomes diferentes, então uma função só cobre as três e cada adapter passa
 * as chaves que a sua fonte usa primeiro.
 */
function paraNormalizedJob(
  r: Record<string, unknown>,
  sourceKey: string,
  extras: { idKeys: string[]; urlKeys: string[] },
): NormalizedJob | null {
  const externalId = txt(r, ...extras.idKeys, "id", "job_id", "jobId");
  const title = txt(r, "job_title", "title", "position", "jobTitle");
  const company = txt(r, "company_name", "company", "employer", "companyName", "employer_name");

  // Sem esses três não há vaga utilizável — o pipeline rejeitaria adiante.
  if (!externalId || !title || !company) return null;

  const html = txt(
    r,
    "job_description_formatted",
    "description_html",
    "job_description",
    "description",
  );
  const texto = txt(r, "job_description_plain", "description_text") ?? semHtml(html);

  const remotoDeclarado = bool(r, "is_remote", "remote", "remote_work");
  const modalidadeTxt = (
    txt(r, "job_work_type", "workplace_type", "work_type", "job_type") ?? ""
  ).toLowerCase();
  const ehRemoto = /remote|remoto|home\s*office|anywhere/.test(modalidadeTxt);
  const ehHibrido = /hybrid|híbrido|hibrido/.test(modalidadeTxt);
  const ehPresencial = /on-?site|presencial|in-?office/.test(modalidadeTxt);
  const isRemote = remotoDeclarado ?? ehRemoto;

  // Híbrido é checado primeiro: "hybrid remote" é híbrido, não remoto.
  const modalidade: "remoto" | "hibrido" | "presencial" | null = ehHibrido
    ? "hibrido"
    : isRemote
      ? "remoto"
      : ehPresencial
        ? "presencial"
        : null;

  return {
    external_id: externalId,
    source_key: sourceKey,
    title,
    company_name: company,
    location_raw: txt(r, "job_location", "location", "city", "job_city", "formatted_location"),
    is_remote: isRemote,
    country: txt(r, "country_code", "country", "job_country"),
    description_html: html,
    description_text: texto,
    salary_min: num(r, "salary_min", "min_salary", "base_salary_min", "pay_min"),
    salary_max: num(r, "salary_max", "max_salary", "base_salary_max", "pay_max"),
    salary_currency: txt(r, "salary_currency", "currency", "pay_currency"),
    salary_period: txt(r, "salary_period", "pay_period", "salary_type"),
    employment_type: txt(r, "job_employment_type", "employment_type", "job_type", "contract_type"),
    seniority_hint: txt(
      r,
      "job_seniority_level",
      "seniority",
      "seniority_level",
      "experience_level",
    ),
    posted_at: data(
      r,
      "job_posted_date",
      "posted_at",
      "date_posted",
      "posted_time",
      "job_posted_time",
    ),
    apply_url: txt(r, "apply_link", "application_url", "apply_url", ...extras.urlKeys),
    // Registro cru completo: auditoria, e permite refinar o mapeamento depois
    // sem precisar recoletar nada.
    raw: r,

    work_modality: modalidade,
    requirements_text: semHtml(
      txt(r, "job_requirements", "requirements", "qualifications_required"),
    ),
    qualifications_text: semHtml(txt(r, "job_qualifications", "qualifications", "nice_to_have")),
    benefits_text: semHtml(txt(r, "job_benefits", "benefits", "perks")),
    source_url: txt(r, ...extras.urlKeys, "url", "job_url", "link", "posting_url"),
    // O id na plataforma pode ser o mesmo que usamos como external_id; guardar
    // separado deixa explícito de onde veio e sobrevive se mudarmos a chave.
    source_job_id: externalId,
    source_updated_at: data(r, "job_updated_date", "updated_at", "last_updated", "date_updated"),
  };
}

/* ------------------------------------------------------- fábrica de adapters */

interface DefinicaoFonte {
  key: string;
  nome: string;
  idKeys: string[];
  urlKeys: string[];
  /** Como a fonte descobre vagas novas. Confirmado na doc para LinkedIn. */
  discoverBy: string;
}

/**
 * `dataset_id` NUNCA vem do código: é específico da conta e sai do painel
 * (brightdata.com/cp/datasets). Vive em job_sources.config.dataset_id.
 */
function criarAdapter(def: DefinicaoFonte): AsyncJobAdapter {
  return {
    key: def.key,

    async trigger(cfg: AdapterConfig) {
      if (!brightDataConfigurada()) {
        throw new Error(
          `${def.nome}: BRIGHT_DATA_API_KEY ausente. Defina no ambiente do servidor.`,
        );
      }
      const datasetId = typeof cfg["dataset_id"] === "string" ? cfg["dataset_id"] : null;
      if (!datasetId) {
        throw new Error(
          `${def.nome}: falta dataset_id em job_sources.config. Pegue no painel da Bright Data ` +
            `(brightdata.com/cp/datasets) — ele é específico da sua conta e não pode ser fixado no código.`,
        );
      }

      // As entradas de descoberta vêm da config, não do código: cada instalação
      // busca o que interessa a ela.
      const entradas = Array.isArray(cfg["discover_inputs"])
        ? (cfg["discover_inputs"] as Array<Record<string, unknown>>)
        : [];
      if (entradas.length === 0) {
        throw new Error(
          `${def.nome}: config.discover_inputs vazio. Informe ao menos uma entrada de busca ` +
            `(ex.: [{"keyword":"devops","location":"Brazil"}]).`,
        );
      }

      const limite = typeof cfg["limit_per_input"] === "number" ? cfg["limit_per_input"] : 50;

      const snapshotId = await dispararColeta({
        datasetId,
        payload: entradas,
        type: "discover_new",
        discoverBy: def.discoverBy,
        limitPerInput: limite,
        includeErrors: true,
      });

      return {
        snapshotId,
        request: {
          dataset_id: datasetId,
          discover_by: def.discoverBy,
          limit_per_input: limite,
          inputs: entradas,
        },
      };
    },

    collect(registros) {
      const vagas: NormalizedJob[] = [];
      for (const r of registros) {
        // Com include_errors=true vêm linhas de erro no meio dos dados.
        if (r["error"] || r["warning"]) continue;
        const vaga = paraNormalizedJob(r, def.key, { idKeys: def.idKeys, urlKeys: def.urlKeys });
        if (vaga) vagas.push(vaga);
      }
      return vagas;
    },
  };
}

/* ------------------------------------------------------------------ fontes */

export const brightDataLinkedinJobsAdapter = criarAdapter({
  key: "bd_linkedin_jobs",
  nome: "Bright Data — LinkedIn Jobs",
  idKeys: ["job_posting_id", "linkedin_job_id"],
  urlKeys: ["url", "job_url", "link"],
  // Doc do LinkedIn Scraper: "Discover jobs by keyword or search URL".
  discoverBy: "keyword",
});

export const brightDataIndeedAdapter = criarAdapter({
  key: "bd_indeed",
  nome: "Bright Data — Indeed",
  idKeys: ["jobkey", "job_key", "indeed_job_id"],
  urlKeys: ["url", "job_url", "link"],
  discoverBy: "keyword",
});

export const brightDataGlassdoorAdapter = criarAdapter({
  key: "bd_glassdoor",
  nome: "Bright Data — Glassdoor Jobs",
  idKeys: ["job_listing_id", "glassdoor_job_id"],
  urlKeys: ["url", "job_url", "link"],
  discoverBy: "keyword",
});

/**
 * JobGether — a Bright Data NÃO oferece produto para esta fonte.
 *
 * Verificado em 2026-08-27: não há dataset, scraper nem entrada no catálogo.
 * O adapter fica registrado e desativado, no mesmo padrão de adzuna/jsearch,
 * para que a fonte apareça no admin com o motivo explícito em vez de sumir.
 *
 * Para habilitar no futuro: a JobGether expõe vagas publicamente; o caminho
 * autorizado seria API própria, feed ou acordo direto — nunca scraping por
 * fora (CLAUDE.md, regra 9).
 */
export const jobgetherAdapter: AsyncJobAdapter = {
  key: "bd_jobgether",
  disabled: true,
  disabledReason:
    "A Bright Data não oferece dataset/scraper para JobGether (verificado em 2026-08-27). " +
    "Requer API própria, feed ou acordo direto com a fonte.",
  async trigger() {
    throw new Error("JobGether indisponível na Bright Data.");
  },
  collect() {
    return [];
  },
};
