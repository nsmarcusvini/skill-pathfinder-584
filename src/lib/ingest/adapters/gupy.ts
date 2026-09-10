/**
 * Gupy — portal público de vagas (https://portal.gupy.io).
 *
 * Por que esta fonte existe: é a única que traz ESTÁGIO e TRAINEE brasileiro em
 * volume. Antes dela a base inteira tinha 1 estágio de tecnologia no segmento
 * `br`, contra 212 disponíveis aqui — abaixo de `MIN_SAMPLE` (30) o gap sai
 * marcado como `lowConfidence`, então sem esta fonte os dois níveis novos
 * (migration 20260910120000) não tinham dado para existir.
 *
 * A API é a mesma que o portal público usa, sem autenticação, e o `robots.txt`
 * do domínio é `Disallow:` vazio (tudo liberado, verificado em 2026-09-10).
 * Cada vaga aponta de volta para a página da empresa na Gupy — mandamos tráfego
 * para eles, não desviamos. Nada aqui se parece com o scraping de LinkedIn,
 * Indeed e Glassdoor que a regra 9 do CLAUDE.md proíbe: aquilo é contornar
 * antibot e ToS, isto é consumir um endpoint público como Remotive e Jobicy.
 *
 * ⚠️ A BUSCA É POR TERMO, não por catálogo: `jobName` é obrigatório para trazer
 * algo relevante. Os termos vivem em `job_sources.config.queries` (dado, não
 * código — regra 1), então adicionar "estágio em cibersegurança" é UPDATE no
 * banco, sem deploy.
 */
import { fetchJson } from "../http";
import { stripHtml } from "../normalize";
import type { AdapterConfig, JobAdapter, NormalizedJob } from "../types";

const BASE = "https://portal.gupy.io/api/job-search/jobs";
/** Teto da API: `limit=200` devolve HTTP 400. Verificado em 2026-09-10. */
const LIMITE = 100;
const MAX_PAGINAS = 3;

/**
 * `type` é um campo ESTRUTURADO da Gupy — muito melhor que adivinhar pelo
 * título. Vira `seniority_hint`, e o `inferSeniority` continua com a palavra
 * final: o título manda, o hint só entra quando o título é silencioso
 * (ver normalize.ts). Assim "Estágio em Desenvolvimento" não depende do hint,
 * e "Pessoa Estagiária de IA" — que o título já denuncia — também não.
 */
const TIPO_PARA_HINT: Record<string, string> = {
  vacancy_type_internship: "estagio",
  vacancy_type_trainee: "trainee",
  vacancy_type_effective: "",
};

/** hybrid/on-site/remote → o vocabulário do RUMVIA. */
function modalidade(w: unknown): "remoto" | "hibrido" | "presencial" | null {
  switch (String(w ?? "")) {
    case "remote":
      return "remoto";
    case "hybrid":
      return "hibrido";
    case "on-site":
      return "presencial";
    default:
      return null;
  }
}

function local(vaga: Record<string, unknown>): string | null {
  const cidade = vaga["city"] ? String(vaga["city"]) : "";
  const estado = vaga["state"] ? String(vaga["state"]) : "";
  const junto = [cidade, estado].filter(Boolean).join(", ");
  return junto || null;
}

export const gupyAdapter: JobAdapter = {
  key: "gupy",

  async fetchJobs(cfg: AdapterConfig) {
    const queries = Array.isArray(cfg["queries"])
      ? (cfg["queries"] as unknown[]).map(String).filter(Boolean)
      : [];
    if (queries.length === 0) {
      throw new Error(
        "gupy: config.queries vazio. A API é por termo de busca — informe ao menos um " +
          '(ex.: ["estagio desenvolvimento", "trainee ti"]).',
      );
    }

    // A mesma vaga aparece em vários termos ("estagio java" e "estagio backend"):
    // deduplica por id aqui para não pagar o custo de normalizar e escrever duas
    // vezes. O dedupe do pipeline continua valendo entre FONTES diferentes.
    const porId = new Map<string, NormalizedJob>();

    for (const termo of queries) {
      for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
        const url =
          `${BASE}?jobName=${encodeURIComponent(termo)}` +
          `&limit=${LIMITE}&offset=${pagina * LIMITE}`;

        const data = await fetchJson<{ data: Array<Record<string, unknown>> }>(url);
        const vagas = data.data ?? [];
        if (vagas.length === 0) break;

        for (const vaga of vagas) {
          const id = vaga["id"];
          if (id === undefined || id === null) continue;

          const html = vaga["description"] ? String(vaga["description"]) : null;
          const tipo = String(vaga["type"] ?? "");

          porId.set(String(id), {
            external_id: String(id),
            source_key: "gupy",
            title: String(vaga["name"] ?? ""),
            company_name: String(vaga["careerPageName"] ?? "Desconhecida"),
            location_raw: local(vaga),
            is_remote: String(vaga["workplaceType"] ?? "") === "remote",
            // A Gupy é um portal brasileiro: toda vaga é BR. Sem isto o
            // classificador de segmento não teria país e cairia em 'outro'.
            country: "BR",
            description_html: html,
            description_text: stripHtml(html),
            // O portal não expõe faixa salarial nesta rota.
            salary_min: null,
            salary_max: null,
            salary_currency: null,
            salary_period: null,
            employment_type: tipo || null,
            seniority_hint: TIPO_PARA_HINT[tipo] || null,
            posted_at: vaga["publishedDate"] ? String(vaga["publishedDate"]) : null,
            apply_url: vaga["jobUrl"] ? String(vaga["jobUrl"]) : null,
            work_modality: modalidade(vaga["workplaceType"]),
            source_url: vaga["jobUrl"] ? String(vaga["jobUrl"]) : null,
            source_job_id: String(id),
            raw: vaga,
          });
        }

        if (vagas.length < LIMITE) break;
      }
    }

    return [...porId.values()];
  },
};
