/**
 * Detecção de ATS pela URL da página de carreiras.
 * Só existe adapter para ATS com endpoint público e estável confirmado;
 * o resto entra pelo importador CSV.
 */
export interface AtsDetection {
  ats: string;
  label: string;
  board_token: string | null;
  adapter: string | null;
  supported: boolean;
  api_endpoint: string | null;
  recommendation: string;
}

const PATTERNS: Array<{
  re: RegExp;
  ats: string;
  label: string;
  adapter: string | null;
  supported: boolean;
  endpoint?: (token: string) => string;
  note?: string;
}> = [
  {
    re: /boards\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9_-]+)/i,
    ats: "greenhouse",
    label: "Greenhouse",
    adapter: "greenhouse",
    supported: true,
    endpoint: (t) => `https://boards-api.greenhouse.io/v1/boards/${t}/jobs?content=true`,
  },
  {
    re: /(?:jobs\.lever\.co|lever\.co\/)\/?([a-z0-9_-]+)/i,
    ats: "lever",
    label: "Lever",
    adapter: "lever",
    supported: true,
    endpoint: (t) => `https://api.lever.co/v0/postings/${t}?mode=json`,
  },
  {
    re: /jobs\.ashbyhq\.com\/([a-z0-9_.-]+)/i,
    ats: "ashby",
    label: "Ashby",
    adapter: "ashby",
    supported: true,
    endpoint: (t) => `https://api.ashbyhq.com/posting-api/job-board/${t}?includeCompensation=true`,
  },
  {
    re: /apply\.workable\.com\/([a-z0-9_-]+)/i,
    ats: "workable",
    label: "Workable",
    adapter: "workable",
    supported: true,
    endpoint: (t) => `https://apply.workable.com/api/v1/widget/accounts/${t}?details=true`,
  },
  {
    re: /(?:jobs|careers)\.smartrecruiters\.com\/([a-z0-9_-]+)/i,
    ats: "smartrecruiters",
    label: "SmartRecruiters",
    adapter: "smartrecruiters",
    supported: true,
    endpoint: (t) => `https://api.smartrecruiters.com/v1/companies/${t}/postings`,
  },
  {
    re: /([a-z0-9-]+)\.recruitee\.com/i,
    ats: "recruitee",
    label: "Recruitee",
    adapter: null,
    supported: false,
    note: "Board público existe, mas o adapter ainda não foi homologado.",
  },
  {
    re: /([a-z0-9-]+)\.gupy\.io/i,
    ats: "gupy",
    label: "Gupy",
    adapter: null,
    supported: false,
    note: "Sem endpoint público estável confirmado. Importe as vagas por CSV.",
  },
  {
    re: /([a-z0-9-]+)\.solides\.jobs|vagas\.solides\.com\.br\/([a-z0-9-]+)/i,
    ats: "solides",
    label: "Sólides",
    adapter: null,
    supported: false,
    note: "Sem endpoint público estável confirmado. Importe as vagas por CSV.",
  },
  {
    re: /([a-z0-9-]+)\.abler\.com\.br/i,
    ats: "abler",
    label: "Abler",
    adapter: null,
    supported: false,
    note: "Sem endpoint público estável confirmado. Importe as vagas por CSV.",
  },
  {
    re: /([a-z0-9-]+)\.inhire\.app|inhire\.app\/([a-z0-9-]+)/i,
    ats: "inhire",
    label: "InHire",
    adapter: null,
    supported: false,
    note: "Sem endpoint público estável confirmado. Importe as vagas por CSV.",
  },
  {
    re: /([a-z0-9-]+)\.quickin\.io|quickin\.io\/([a-z0-9-]+)/i,
    ats: "quickin",
    label: "Quickin",
    adapter: null,
    supported: false,
    note: "Sem endpoint público estável confirmado. Importe as vagas por CSV.",
  },
  {
    re: /(linkedin\.com|indeed\.com|glassdoor\.com)/i,
    ats: "bloqueado",
    label: "LinkedIn / Indeed / Glassdoor",
    adapter: null,
    supported: false,
    note: "Scraping proibido no RUMVIA. Só entrará como adapter de API licenciada.",
  },
];

export function detectAts(rawUrl: string): AtsDetection {
  const url = rawUrl.trim();
  for (const p of PATTERNS) {
    const match = url.match(p.re);
    if (!match) continue;
    const token = (match[1] ?? match[2] ?? null)?.toLowerCase() ?? null;
    return {
      ats: p.ats,
      label: p.label,
      board_token: p.supported ? token : token,
      adapter: p.adapter,
      supported: p.supported,
      api_endpoint: p.supported && token && p.endpoint ? p.endpoint(token) : null,
      recommendation: p.supported
        ? `Adicione "${token}" em board_tokens da fonte ${p.adapter}_boards.`
        : (p.note ?? "Empresa entra pelo importador CSV."),
    };
  }
  return {
    ats: "desconhecido",
    label: "ATS não identificado",
    board_token: null,
    adapter: null,
    supported: false,
    api_endpoint: null,
    recommendation: "Nenhum padrão conhecido nesta URL. Use o importador CSV em /admin/importar.",
  };
}
