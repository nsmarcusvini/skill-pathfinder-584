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
    .replace(
      /\b(m\/f\/d|remoto|remote|hibrido|hybrid|presencial|onsite|clt|pj|efetivo|vaga)\b/g,
      " ",
    )
    .replace(/[^a-z0-9+#.\s]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Faixa que cobre pleno E sênior ao mesmo tempo. É o rótulo padrão do LinkedIn
 * ("Mid-Senior level") e chega em `hint` na maioria das vagas do Bright Data —
 * era a causa de 2 em cada 3 vagas da base virarem "senior": a regra de sênior
 * casava o "senior" de dentro de "Mid-Senior" e vencia até quando o título dizia
 * "Pleno". Escolher um dos dois lados é inventar; devolvemos null e a vaga fica
 * sem senioridade, entrando só no degrau que aceita `_include_unranked`.
 */
const AMBIGUOUS_SENIORITY = /\bmid[- ]?senior\b/;

/**
 * Regex bilíngue de senioridade. Ordem importa: staff antes de tudo, e sênior
 * por último — assim "Senior Staff Engineer" vira staff e "Pleno" não é
 * atropelado.
 *
 * Os valores TÊM de ser junior | pleno | senior | staff — é o CHECK de
 * job_postings.seniority, profiles.seniority e track_skill_baselines.seniority.
 * Emitir qualquer outra coisa faz o INSERT da vaga ser rejeitado inteiro.
 *
 * Cuidados que vieram de olhar a base real, não invente de novo:
 *  - Nada de `\b3\b` ou `\b2\b`: "L3", "Nível 2" e "3 anos" viravam senioridade.
 *  - Nada de `\bi\b`: pegava "Engineering Manager I" como júnior, e há título que
 *    usa " I " como separador ("Software Engineer (back-end) I Híbrido").
 *    `ii` e `iii` são seguros — conferidos um a um na base — e ficam.
 *  - `pl` é a abreviação brasileira de pleno ("Analista de Testes PL"), mas não
 *    pode casar "PL/SQL": daí o lookahead negativo.
 */
const SENIORITY_RULES: Array<{ seniority: string; re: RegExp }> = [
  {
    // Nada de `director`/`executive` aqui: no título eles são cargo comercial,
    // não senioridade — "Account Executive" e "Sales Director" viravam staff.
    seniority: "staff",
    re: /\b(staff|principal|lead|tech lead|head|especialista|specialist|architect|arquiteto)\b/,
  },
  {
    seniority: "junior",
    re: /\b(jr\.?|junior|júnior|entry[- ]?level|trainee|estagio|estágio|intern|internship)\b/,
  },
  {
    // `associate` ficou de fora: como nível do LinkedIn significa pleno, mas em
    // título é função ("Finance Associate", "Associate Director, Media Strategy").
    // Como a mesma regra roda no título e no hint, o dano no título é maior que
    // o ganho no hint.
    seniority: "pleno",
    re: /\b(pleno|mid[- ]?level|middle|intermediate|intermediario|ii)\b|\bpl\b(?!\s*\/)/,
  },
  { seniority: "senior", re: /\b(sr\.?|senior|senior|sênior|iii)\b/ },
];

function matchSeniority(text: string): string | null {
  if (AMBIGUOUS_SENIORITY.test(text)) return null;
  for (const rule of SENIORITY_RULES) {
    if (rule.re.test(text)) return rule.seniority;
  }
  return null;
}

/**
 * O TÍTULO manda; o `hint` da fonte só entra quando o título é silencioso.
 * Antes os dois eram concatenados no mesmo texto, então o rótulo genérico da
 * fonte atropelava o que a vaga dizia de si: "Desenvolvedor Back-End Pleno" e
 * "Data Engineer II" estavam gravados como sênior.
 */
export function inferSeniority(title: string, hint?: string | null): string | null {
  const peloTitulo = matchSeniority(deaccent(title ?? "").toLowerCase());
  if (peloTitulo) return peloTitulo;
  if (!hint) return null;
  return matchSeniority(deaccent(hint).toLowerCase());
}

const PT_STOPWORDS = [
  "você",
  "voce",
  "nós",
  "para",
  "com",
  "experiência",
  "experiencia",
  "conhecimento",
  "vaga",
  "empresa",
  "atuação",
  "atuacao",
  "desejável",
  "desejavel",
  "não",
  "nao",
  "que",
  "dos",
  "das",
];
const EN_STOPWORDS = [
  "you",
  "we",
  "the",
  "with",
  "experience",
  "knowledge",
  "role",
  "team",
  "will",
  "our",
  "and",
  "about",
];

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
  "brasil",
  "brazil",
  "são paulo",
  "sao paulo",
  "rio de janeiro",
  "belo horizonte",
  "curitiba",
  "porto alegre",
  "florianópolis",
  "florianopolis",
  "recife",
  "fortaleza",
  "salvador",
  "brasília",
  "brasilia",
  "campinas",
  "goiânia",
  "goiania",
  "manaus",
  "belém",
  "belem",
  "vitória",
  "vitoria",
  "joinville",
  "santos",
  "sorocaba",
  "ribeirão preto",
  "ribeirao preto",
  "natal",
  "maceió",
  "maceio",
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

/**
 * Palavras que ocupam o lugar da cidade sem serem uma. Aparecem sozinhas
 * ("Anywhere", "Remoto") ou como sufixo ("Brazil (Remote)").
 */
const NAO_E_CIDADE =
  /^(remote|remoto|anywhere|worldwide|global|home\s*office|hybrid|h[íi]brido|on-?site|presencial|distributed|latam|latin america|am[ée]rica latina|europe|emea|apac|americas|multiple locations|various|n\/a|-)$/;

/** Último segmento costuma ser país; não é cidade nem estado. */
const PAISES =
  /^(brazil|brasil|br|united states|usa|us|canada|ca|mexico|m[ée]xico|argentina|chile|colombia|per[uú]|uruguai|uruguay|portugal|pt|spain|espa[ñn]a|es|united kingdom|uk|gb|england|germany|deutschland|de|france|fr|italy|it|netherlands|nl|poland|pl|ireland|india|australia)$/;

export interface ParsedLocation {
  city: string | null;
  state: string | null;
}

/**
 * Extrai cidade e estado de `location_raw`.
 *
 * As fontes escrevem a mesma cidade de formas diferentes — "São Paulo, São
 * Paulo, Brazil", "São Paulo, Brazil", "Brasil", "Remoto". Sem normalizar, um
 * filtro por localidade viraria uma lista de dezenas de variações da mesma
 * cidade, cada uma com uma contagem parcial.
 *
 * Deliberadamente conservador: quando não dá para afirmar que um segmento é
 * cidade, devolve null. Preencher errado é pior do que não preencher — a tela
 * sabe mostrar "não informado", mas não sabe desconfiar de um dado plausível.
 *
 * ESTA É A ÚNICA fonte dessa regra. O pipeline e o backfill importam daqui.
 */
export function parseLocation(locationRaw: string | null | undefined): ParsedLocation {
  if (!locationRaw) return { city: null, state: null };

  // "Brazil (Remote)" -> "Brazil"; o parêntese nunca carrega a cidade.
  const limpo = locationRaw.replace(/\([^)]*\)/g, " ").trim();
  if (!limpo) return { city: null, state: null };

  const partes = limpo
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (partes.length === 0) return { city: null, state: null };

  const ehDescartavel = (v: string) => {
    const n = deaccent(v).toLowerCase();
    return NAO_E_CIDADE.test(n) || PAISES.test(n);
  };

  // Tira país e palavras de modalidade de qualquer posição.
  const uteis = partes.filter((p) => !ehDescartavel(p));
  if (uteis.length === 0) return { city: null, state: null };

  const city = uteis[0] ?? null;
  // "São Paulo, São Paulo" repete cidade no estado; guardar as duas iguais não
  // agrega e ainda faz a UI mostrar "São Paulo — São Paulo".
  const segundo = uteis[1];
  const state =
    segundo && deaccent(segundo).toLowerCase() !== deaccent(city ?? "").toLowerCase()
      ? segundo
      : null;

  return { city, state };
}

export function normalizeCurrency(
  currency: string | null | undefined,
  country: string | null,
): string | null {
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

/**
 * Fatores para anualizar. As abreviações (`hr`, `mo`, `yr`...) não são enfeite:
 * é assim que o LinkedIn manda em `base_salary.payment_period`, verificado com
 * dados reais em 2026-08-28. Sem elas, `toAnnual` não encontrava o fator e
 * devolvia o valor MENSAL como se fosse anual — um salário de R$10 mil/mês
 * entraria na mediana como R$10 mil/ano, deformando a estatística para baixo.
 * Falhar calado aqui é pior do que não ler o salário.
 */
const PERIOD_FACTOR: Record<string, number> = {
  hour: 2080,
  hourly: 2080,
  hr: 2080,
  day: 252,
  daily: 252,
  week: 52,
  weekly: 52,
  wk: 52,
  month: 12,
  monthly: 12,
  mo: 12,
  mth: 12,
  year: 1,
  yearly: 1,
  yr: 1,
  annual: 1,
  annually: 1,
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
    return {
      market_segment: "br",
      remote_restriction: input.is_remote ? "brazil_only" : null,
      rule: "1_pais_ou_local_br",
    };
  }

  // 2. Remoto com restrição a Brasil/LatAm
  if (input.is_remote) {
    if (
      /brazil only|brazil-only|apenas brasil|somente brasil|residir no brasil|based in brazil/.test(
        text,
      )
    ) {
      return {
        market_segment: "br",
        remote_restriction: "brazil_only",
        rule: "2_remoto_restrito_brasil",
      };
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

export function detectRemote(
  location: string | null,
  text: string | null,
  flag?: boolean | null,
): boolean {
  if (flag === true) return true;
  const haystack = `${location ?? ""} ${text?.slice(0, 2000) ?? ""}`.toLowerCase();
  return /\bremote\b|\bremoto\b|home ?office|anywhere|worldwide|100% remoto/.test(haystack);
}

export function dedupeHash(companyName: string, title: string, location: string | null): string {
  const base = `${deaccent(companyName).toLowerCase().trim()}|${normalizeTitle(title)}|${deaccent(
    location ?? "",
  )
    .toLowerCase()
    .trim()}`;
  let h1 = 0x811c9dc5;
  for (let i = 0; i < base.length; i += 1) {
    h1 ^= base.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193) >>> 0;
  }
  return `${h1.toString(16)}-${base.length.toString(16)}`;
}
