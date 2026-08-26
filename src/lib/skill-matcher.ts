/**
 * Matcher determinístico ÚNICO do RUMVIA.
 *
 * Usado pelo parser de currículo (cv-parser.server.ts) E pela extração de
 * skills de vagas (jd/extract.server.ts). Uma implementação só: se o matcher
 * divergir entre os dois lados, o score de aderência fica inconsistente.
 *
 * Ordem obrigatória: exato → alias → regex (is_ambiguous) → trigram >= 0.86.
 * Sempre com limite de palavra e sem casar dentro de URL, e-mail ou nome da
 * própria empresa.
 */

export const TRIGRAM_THRESHOLD = 0.86;
/** Limiar mais frouxo, só para SUGERIR skill parecida na curadoria. */
export const TRIGRAM_SUGGEST_THRESHOLD = 0.6;

export type MatchedBy = "exact" | "alias" | "regex" | "trigram" | "unmatched";

export interface CatalogSkill {
  id: string;
  canonical_name: string;
  is_ambiguous: boolean;
  match_patterns: string[];
}

export interface CatalogAlias {
  skill_id: string;
  alias: string;
}

export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Remove URLs, e-mails e (opcionalmente) o nome da empresa. */
export function stripLinks(text: string, companyName?: string | null): string {
  let out = text
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, " ")
    .replace(/\bhttps?:\/\/\S+/gi, " ")
    .replace(/\b(?:www|github\.com|linkedin\.com)\/?\S*/gi, " ");
  const company = companyName?.trim();
  if (company && company.length >= 3) {
    try {
      out = out.replace(new RegExp(escapeRegExp(company), "gi"), " ");
    } catch {
      /* nome com caractere estranho é ignorado */
    }
  }
  return out;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Regex com limite de palavra tolerante a símbolos técnicos (c#, node.js, ci/cd). */
export function wordBoundaryRegex(term: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\d])${escapeRegExp(term)}(?![\\p{L}\\d])`, "u");
}

/* --------------------------------------------------------------- trigram */

function trigrams(value: string): Set<string> {
  const padded = `  ${value.trim().replace(/\s+/g, " ")} `;
  const set = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) set.add(padded.slice(i, i + 3));
  return set;
}

export function similarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / (ta.size + tb.size - shared);
}

/* ----------------------------------------------------------------- índice */

export interface CatalogIndex {
  skills: CatalogSkill[];
  aliasBySkill: Map<string, string[]>;
  normTerms: Array<{ skillId: string; norm: string; alias: string | null }>;
}

export function buildCatalogIndex(skills: CatalogSkill[], aliases: CatalogAlias[]): CatalogIndex {
  const aliasBySkill = new Map<string, string[]>();
  for (const a of aliases) {
    const list = aliasBySkill.get(a.skill_id) ?? [];
    list.push(a.alias);
    aliasBySkill.set(a.skill_id, list);
  }
  const normTerms = [
    ...skills.map((s) => ({ skillId: s.id, norm: normalize(s.canonical_name), alias: null as string | null })),
    ...aliases.map((a) => ({ skillId: a.skill_id, norm: normalize(a.alias), alias: a.alias })),
  ];
  return { skills, aliasBySkill, normTerms };
}

export interface TrigramSuggestion {
  skillId: string | null;
  score: number;
  alias: string | null;
}

export function bestTrigram(term: string, index: CatalogIndex): TrigramSuggestion {
  const norm = normalize(term);
  let best: TrigramSuggestion = { skillId: null, score: 0, alias: null };
  for (const entry of index.normTerms) {
    const score = similarity(norm, entry.norm);
    if (score > best.score) best = { skillId: entry.skillId, score, alias: entry.alias };
  }
  return best;
}

/* ---------------------------------------------------------------- ocorrências */

export function findOccurrences(
  pattern: RegExp,
  text: string,
): { count: number; evidence: string | null } {
  let count = 0;
  let evidence: string | null = null;
  const re = new RegExp(pattern.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    count += 1;
    if (!evidence) {
      const start = Math.max(0, m.index - 70);
      const end = Math.min(text.length, m.index + m[0].length + 70);
      evidence = text.slice(start, end).replace(/\s+/g, " ").trim();
    }
    if (m.index === re.lastIndex) re.lastIndex += 1;
  }
  return { count, evidence };
}

export interface SegmentMatch<S extends string> {
  skill_id: string;
  raw_term: string;
  matched_alias: string | null;
  matched_by: Exclude<MatchedBy, "unmatched">;
  confidence: number;
  evidence: string | null;
  count: number;
  segments: Set<S>;
}

/**
 * Roda o catálogo inteiro contra segmentos de texto já limpos (sem URL/e-mail).
 * Retorna, por skill, a melhor forma de match e em quais segmentos apareceu.
 */
export function matchCatalogSegments<S extends string>(
  segments: Array<[S, string]>,
  index: CatalogIndex,
): { matches: Array<SegmentMatch<S>>; matchedTerms: Set<string> } {
  const matches: Array<SegmentMatch<S>> = [];
  const matchedTerms = new Set<string>();

  for (const skill of index.skills) {
    const candidates: Array<{
      term: string;
      alias: string | null;
      matchedBy: Exclude<MatchedBy, "unmatched">;
      confidence: number;
      re: RegExp;
    }> = [
      {
        term: skill.canonical_name,
        alias: null,
        matchedBy: "exact",
        confidence: 1,
        re: wordBoundaryRegex(skill.canonical_name),
      },
    ];

    for (const alias of index.aliasBySkill.get(skill.id) ?? []) {
      candidates.push({
        term: alias,
        alias,
        matchedBy: "alias",
        confidence: 0.95,
        re: wordBoundaryRegex(alias),
      });
    }

    if (skill.is_ambiguous) {
      for (const pattern of skill.match_patterns ?? []) {
        try {
          candidates.push({
            term: skill.canonical_name,
            alias: null,
            matchedBy: "regex",
            confidence: 0.9,
            re: new RegExp(pattern, "u"),
          });
        } catch {
          /* padrão inválido é ignorado */
        }
      }
    }

    let best: SegmentMatch<S> | null = null;

    for (const candidate of candidates) {
      let count = 0;
      let evidence: string | null = null;
      const segs = new Set<S>();
      for (const [segment, text] of segments) {
        const found = findOccurrences(candidate.re, text);
        if (found.count > 0) {
          count += found.count;
          segs.add(segment);
          if (!evidence) evidence = found.evidence;
        }
      }
      if (count === 0) continue;

      matchedTerms.add(normalize(candidate.term));
      if (candidate.alias) matchedTerms.add(normalize(candidate.alias));

      if (!best || candidate.confidence > best.confidence || (candidate.confidence === best.confidence && count > best.count)) {
        best = {
          skill_id: skill.id,
          raw_term: candidate.term,
          matched_alias: candidate.alias,
          matched_by: candidate.matchedBy,
          confidence: candidate.confidence,
          evidence,
          count: (best?.count ?? 0) + count,
          segments: new Set<S>([...(best?.segments ?? []), ...segs]),
        };
      } else {
        best.count += count;
        for (const s of segs) best.segments.add(s);
      }
    }

    if (best) {
      matchedTerms.add(normalize(skill.canonical_name));
      matches.push(best);
    }
  }

  return { matches, matchedTerms };
}
