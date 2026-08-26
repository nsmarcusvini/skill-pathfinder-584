/**
 * Pipeline determinístico de leitura de currículo do RUMVIA.
 * NÃO usa LLM nem qualquer serviço externo: extração de texto + dicionário
 * canônico + aliases + regex de siglas ambíguas + similaridade trigram.
 */

export const PARSER_VERSION = "cv-parser-v1";

export type Section = "skills" | "experiencia" | "formacao" | "certificacoes" | "outro";
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

export interface ExtractedSkill {
  skill_id: string | null;
  raw_term: string;
  matched_by: MatchedBy;
  confidence: number;
  evidence_snippet: string | null;
  section: Section;
  mention_count: number;
  first_year: number | null;
  last_year: number | null;
  years_hint: number | null;
  level_hint: number | null;
}

/* ------------------------------------------------------------------ texto */

export async function extractText(bytes: Uint8Array, mimeType: string): Promise<string> {
  if (mimeType === "application/pdf") return extractPdfText(bytes);
  return extractDocxText(bytes);
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const { extractText: unpdfExtract, getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(bytes);
  const { text } = await unpdfExtract(doc, { mergePages: true });
  return typeof text === "string" ? text : (text as string[]).join("\n");
}

/** DOCX = zip; lemos word/document.xml com DecompressionStream('deflate-raw'). */
async function extractDocxText(bytes: Uint8Array): Promise<string> {
  const xml = await readZipEntry(bytes, "word/document.xml");
  if (!xml) throw new Error("DOCX inválido: word/document.xml não encontrado.");
  return xml
    .replace(/<w:tab[^>]*\/>/g, " ")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function readZipEntry(bytes: Uint8Array, entryName: string): Promise<string | null> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  let offset = 0;
  while (offset + 30 <= bytes.byteLength) {
    if (view.getUint32(offset, true) !== 0x04034b50) break;
    const method = view.getUint16(offset + 8, true);
    let compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    const dataStart = nameStart + nameLength + extraLength;

    if (compressedSize === 0 && name !== entryName) {
      // Streaming zip sem tamanho no header local: usamos o diretório central.
      return readZipEntryFromCentralDirectory(bytes, view, entryName);
    }
    if (name === entryName) {
      if (compressedSize === 0) {
        return readZipEntryFromCentralDirectory(bytes, view, entryName);
      }
      const data = bytes.subarray(dataStart, dataStart + compressedSize);
      return inflateToText(data, method);
    }
    offset = dataStart + compressedSize;
    compressedSize = 0;
  }
  return readZipEntryFromCentralDirectory(bytes, view, entryName);
}

async function readZipEntryFromCentralDirectory(
  bytes: Uint8Array,
  view: DataView,
  entryName: string,
): Promise<string | null> {
  const decoder = new TextDecoder();
  for (let i = bytes.byteLength - 22; i >= 0; i--) {
    if (view.getUint32(i, true) !== 0x06054b50) continue;
    const entries = view.getUint16(i + 10, true);
    let ptr = view.getUint32(i + 16, true);
    for (let e = 0; e < entries; e++) {
      if (view.getUint32(ptr, true) !== 0x02014b50) return null;
      const method = view.getUint16(ptr + 10, true);
      const compressedSize = view.getUint32(ptr + 20, true);
      const nameLength = view.getUint16(ptr + 28, true);
      const extraLength = view.getUint16(ptr + 30, true);
      const commentLength = view.getUint16(ptr + 32, true);
      const localOffset = view.getUint32(ptr + 42, true);
      const name = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLength));
      if (name === entryName) {
        const localNameLength = view.getUint16(localOffset + 26, true);
        const localExtraLength = view.getUint16(localOffset + 28, true);
        const dataStart = localOffset + 30 + localNameLength + localExtraLength;
        return inflateToText(bytes.subarray(dataStart, dataStart + compressedSize), method);
      }
      ptr += 46 + nameLength + extraLength + commentLength;
    }
    return null;
  }
  return null;
}

async function inflateToText(data: Uint8Array, method: number): Promise<string> {
  if (method === 0) return new TextDecoder().decode(data);
  const stream = new Blob([data as unknown as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

/* ------------------------------------------------------------ normalização */

export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Remove URLs e e-mails para que não gerem falsos positivos. */
function stripLinks(text: string): string {
  return text
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, " ")
    .replace(/\bhttps?:\/\/\S+/gi, " ")
    .replace(/\b(?:www|github\.com|linkedin\.com)\/?\S*/gi, " ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ------------------------------------------------------------ seccionamento */

const SECTION_PATTERNS: Array<{ section: Section; re: RegExp }> = [
  {
    section: "skills",
    re: /^(habilidades|competencias|conhecimentos|tecnologias|skills|technical skills|stack|ferramentas)\b/,
  },
  {
    section: "experiencia",
    re: /^(experiencia profissional|experiencia|historico|experience|work experience|professional experience)\b/,
  },
  { section: "formacao", re: /^(formacao|educacao|education|academic)\b/ },
  {
    section: "certificacoes",
    re: /^(certificacoes|certificates|certifications|cursos)\b/,
  },
];

export interface SectionedCv {
  headline: string;
  sections: Record<Section, string>;
}

export function sectionize(text: string): SectionedCv {
  const lines = text.split(/\r?\n/);
  const buckets: Record<Section, string[]> = {
    skills: [],
    experiencia: [],
    formacao: [],
    certificacoes: [],
    outro: [],
  };
  const headline: string[] = [];
  let current: Section | null = null;

  for (const line of lines) {
    const flat = normalize(line.trim()).replace(/[:•\-–—]+$/g, "").trim();
    const hit =
      flat.length > 0 && flat.length <= 40
        ? SECTION_PATTERNS.find((p) => p.re.test(flat))
        : undefined;
    if (hit) {
      current = hit.section;
      continue;
    }
    if (current) buckets[current].push(line);
    else headline.push(line);
  }

  return {
    headline: headline.join("\n").trim(),
    sections: {
      skills: buckets.skills.join("\n"),
      experiencia: buckets.experiencia.join("\n"),
      formacao: buckets.formacao.join("\n"),
      certificacoes: buckets.certificacoes.join("\n"),
      outro: buckets.outro.join("\n"),
    },
  };
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

/* ------------------------------------------------------------ experiência */

const MONTHS: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
  feb: 2, apr: 4, may: 5, aug: 8, sep: 9, oct: 10, dec: 12,
};

interface ExperienceBlock {
  text: string;
  startYear: number;
  endYear: number;
  months: number;
}

const DATE_RANGE =
  /(?:([a-zç]{3,9})[\/\s.-]+)?(\d{4})\s*(?:-|–|—|até|ate|a|to)\s*(?:(?:([a-zç]{3,9})[\/\s.-]+)?(\d{4})|atual|hoje|present|current|momento)/i;

export function parseExperienceBlocks(sectionText: string): ExperienceBlock[] {
  const lines = sectionText.split(/\r?\n/);
  const blocks: ExperienceBlock[] = [];
  let currentBlock: ExperienceBlock | null = null;
  const nowYear = new Date().getUTCFullYear();
  const nowMonth = new Date().getUTCMonth() + 1;

  for (const line of lines) {
    const match = DATE_RANGE.exec(normalize(line));
    if (match) {
      const startMonth = match[1] ? (MONTHS[match[1].slice(0, 3)] ?? 1) : 1;
      const startYear = Number(match[2]);
      const endYear = match[4] ? Number(match[4]) : nowYear;
      const endMonth = match[4] ? (match[3] ? (MONTHS[match[3].slice(0, 3)] ?? 12) : 12) : nowMonth;
      const months = Math.max(1, (endYear - startYear) * 12 + (endMonth - startMonth) + 1);
      currentBlock = { text: line, startYear, endYear, months };
      blocks.push(currentBlock);
      continue;
    }
    if (currentBlock) currentBlock.text += `\n${line}`;
  }
  return blocks;
}

/* -------------------------------------------------------------- matching */

interface Occurrence {
  count: number;
  sections: Set<Section>;
  evidence: string;
  rawTerm: string;
}

function findOccurrences(pattern: RegExp, sectionText: string): { count: number; evidence: string | null } {
  let count = 0;
  let evidence: string | null = null;
  const re = new RegExp(pattern.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(sectionText)) !== null) {
    count += 1;
    if (!evidence) {
      const start = Math.max(0, m.index - 70);
      const end = Math.min(sectionText.length, m.index + m[0].length + 70);
      evidence = sectionText.slice(start, end).replace(/\s+/g, " ").trim();
    }
    if (m.index === re.lastIndex) re.lastIndex += 1;
  }
  return { count, evidence };
}

export interface MatchResult {
  extracted: ExtractedSkill[];
  totalYears: number;
  titles: string[];
}

const LEVEL_MARKERS = {
  basic: /\b(basico|basic|iniciante|beginner)\b/i,
  advanced: /\b(avancado|advanced|proficiente)\b/i,
  expert: /\b(especialista|expert|lead|principal)\b/i,
};

export function levelFromYears(years: number | null): number {
  if (years === null || years <= 0) return 2;
  if (years <= 1) return 2;
  if (years <= 3) return 3;
  if (years <= 6) return 4;
  return 5;
}

export function matchSkills(
  sectioned: SectionedCv,
  skills: CatalogSkill[],
  aliases: CatalogAlias[],
): MatchResult {
  const sectionEntries: Array<[Section, string]> = (
    ["skills", "experiencia", "formacao", "certificacoes", "outro"] as Section[]
  ).map((s) => [s, stripLinks(sectioned.sections[s])]);
  const headline = stripLinks(sectioned.headline);
  const fullText = [headline, ...sectionEntries.map(([, t]) => t)].join("\n");

  const blocks = parseExperienceBlocks(sectioned.sections.experiencia);
  const totalYears = Math.round((blocks.reduce((s, b) => s + b.months, 0) / 12) * 10) / 10;

  const aliasBySkill = new Map<string, string[]>();
  for (const a of aliases) {
    const list = aliasBySkill.get(a.skill_id) ?? [];
    list.push(a.alias);
    aliasBySkill.set(a.skill_id, list);
  }

  const extracted: ExtractedSkill[] = [];
  const matchedTerms = new Set<string>();

  for (const skill of skills) {
    const candidates: Array<{ term: string; matchedBy: MatchedBy; confidence: number; re: RegExp }> = [
      {
        term: skill.canonical_name,
        matchedBy: "exact",
        confidence: 1,
        re: new RegExp(`(?<![\\p{L}\\d])${escapeRegExp(skill.canonical_name)}(?![\\p{L}\\d])`, "u"),
      },
    ];
    for (const alias of aliasBySkill.get(skill.id) ?? []) {
      candidates.push({
        term: alias,
        matchedBy: "alias",
        confidence: 0.95,
        re: new RegExp(`(?<![\\p{L}\\d])${escapeRegExp(alias)}(?![\\p{L}\\d])`, "u"),
      });
    }
    if (skill.is_ambiguous) {
      for (const pattern of skill.match_patterns ?? []) {
        try {
          candidates.push({
            term: skill.canonical_name,
            matchedBy: "regex",
            confidence: 0.9,
            re: new RegExp(pattern, "u"),
          });
        } catch {
          /* padrão inválido é ignorado */
        }
      }
    }

    let best: Occurrence & { matchedBy: MatchedBy; confidence: number } | null = null;
    for (const candidate of candidates) {
      let count = 0;
      let evidence: string | null = null;
      const sections = new Set<Section>();
      for (const [section, text] of sectionEntries) {
        const found = findOccurrences(candidate.re, text);
        if (found.count > 0) {
          count += found.count;
          sections.add(section);
          if (!evidence) evidence = found.evidence;
        }
      }
      const inHeadline = findOccurrences(candidate.re, headline);
      count += inHeadline.count;
      if (inHeadline.count > 0 && !evidence) evidence = inHeadline.evidence;

      if (count > 0) {
        matchedTerms.add(normalize(candidate.term));
        if (
          !best ||
          candidate.confidence > best.confidence ||
          (candidate.confidence === best.confidence && count > best.count)
        ) {
          best = {
            count,
            sections,
            evidence: evidence ?? "",
            rawTerm: candidate.term,
            matchedBy: candidate.matchedBy,
            confidence: candidate.confidence,
          };
        } else {
          best.count += count;
        }
      }
    }

    if (!best) continue;

    // anos: soma dos blocos de experiência em que a skill aparece
    const skillRe = new RegExp(
      `(?<![\\p{L}\\d])${escapeRegExp(skill.canonical_name)}(?![\\p{L}\\d])`,
      "iu",
    );
    let months = 0;
    let firstYear: number | null = null;
    let lastYear: number | null = null;
    for (const block of blocks) {
      if (skillRe.test(block.text)) {
        months += block.months;
        firstYear = firstYear === null ? block.startYear : Math.min(firstYear, block.startYear);
        lastYear = lastYear === null ? block.endYear : Math.max(lastYear, block.endYear);
      }
    }
    const years = months > 0 ? Math.round((months / 12) * 10) / 10 : null;

    let level = levelFromYears(years);
    if (best.sections.has("certificacoes")) level += 1;
    if (best.count >= 4) level += 1;
    level = Math.min(5, level);

    const evidence = best.evidence || null;
    if (evidence) {
      if (LEVEL_MARKERS.expert.test(evidence)) level = 5;
      else if (LEVEL_MARKERS.advanced.test(evidence)) level = Math.max(4, level);
      else if (LEVEL_MARKERS.basic.test(evidence)) level = Math.min(2, level);
    }

    const section: Section = best.sections.has("skills")
      ? "skills"
      : best.sections.has("experiencia")
        ? "experiencia"
        : best.sections.has("certificacoes")
          ? "certificacoes"
          : best.sections.has("formacao")
            ? "formacao"
            : "outro";

    extracted.push({
      skill_id: skill.id,
      raw_term: best.rawTerm,
      matched_by: best.matchedBy,
      confidence: best.confidence,
      evidence_snippet: evidence,
      section,
      mention_count: best.count,
      first_year: firstYear,
      last_year: lastYear,
      years_hint: years,
      level_hint: level,
    });
  }

  // termos da seção de skills que não casaram: trigram e, por fim, curadoria
  const rawTerms = sectioned.sections.skills
    .split(/[\n,;|/•·]|\s{3,}/)
    .map((t) => t.replace(/^[\s\-–—*·]+|[\s.:;]+$/g, "").trim())
    .filter((t) => t.length >= 2 && t.length <= 40 && /[\p{L}]/u.test(t));

  const canonicalIndex = skills.map((s) => ({ skill: s, norm: normalize(s.canonical_name) }));
  const aliasIndex = aliases.map((a) => ({ skillId: a.skill_id, norm: normalize(a.alias) }));
  const already = new Set(extracted.map((e) => e.skill_id));

  for (const term of Array.from(new Set(rawTerms))) {
    const norm = normalize(term);
    if (matchedTerms.has(norm)) continue;
    if (fullText.length === 0) continue;

    let bestScore = 0;
    let bestSkillId: string | null = null;
    for (const c of canonicalIndex) {
      const score = similarity(norm, c.norm);
      if (score > bestScore) {
        bestScore = score;
        bestSkillId = c.skill.id;
      }
    }
    for (const a of aliasIndex) {
      const score = similarity(norm, a.norm);
      if (score > bestScore) {
        bestScore = score;
        bestSkillId = a.skillId;
      }
    }

    if (bestScore >= 0.86 && bestSkillId && !already.has(bestSkillId)) {
      already.add(bestSkillId);
      extracted.push({
        skill_id: bestSkillId,
        raw_term: term,
        matched_by: "trigram",
        confidence: Math.round(bestScore * 1000) / 1000,
        evidence_snippet: term,
        section: "skills",
        mention_count: 1,
        first_year: null,
        last_year: null,
        years_hint: null,
        level_hint: 2,
      });
    } else if (bestScore < 0.86) {
      extracted.push({
        skill_id: null,
        raw_term: term,
        matched_by: "unmatched",
        confidence: Math.round(bestScore * 1000) / 1000,
        evidence_snippet: term,
        section: "skills",
        mention_count: 1,
        first_year: null,
        last_year: null,
        years_hint: null,
        level_hint: null,
      });
    }
  }

  const titles = (sectioned.headline + "\n" + sectioned.sections.experiencia)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l.length <= 90)
    .slice(0, 40);

  return { extracted, totalYears, titles };
}

/* ------------------------------------------------ detecção de trilha/nível */

export interface RoleVariantRow {
  id: string;
  track_id: string;
  name: string;
  search_terms: string[];
}
export interface BaselineRow {
  track_id: string;
  skill_id: string;
  importance: number;
}

export interface Detection {
  trackId: string | null;
  roleVariantId: string | null;
  confidence: number;
  alternatives: Array<{ trackId: string; score: number }>;
  seniority: "junior" | "pleno" | "senior" | "staff" | null;
}

export function detectTrackAndSeniority(
  titles: string[],
  matchedSkillIds: string[],
  variants: RoleVariantRow[],
  baselines: BaselineRow[],
  totalYears: number,
): Detection {
  const titleBlob = normalize(titles.join(" \n "));
  const scores = new Map<string, number>();
  let bestVariant: { id: string; score: number } | null = null;

  for (const variant of variants) {
    let hits = 0;
    for (const term of variant.search_terms ?? []) {
      const re = new RegExp(`(?<![\\p{L}\\d])${escapeRegExp(normalize(term))}(?![\\p{L}\\d])`, "gu");
      hits += (titleBlob.match(re) ?? []).length;
    }
    if (hits > 0) {
      scores.set(variant.track_id, (scores.get(variant.track_id) ?? 0) + hits * 3);
      if (!bestVariant || hits > bestVariant.score) bestVariant = { id: variant.id, score: hits };
    }
  }

  const skillSet = new Set(matchedSkillIds);
  for (const baseline of baselines) {
    if (!skillSet.has(baseline.skill_id)) continue;
    scores.set(baseline.track_id, (scores.get(baseline.track_id) ?? 0) + baseline.importance / 100);
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const total = ranked.reduce((sum, [, score]) => sum + score, 0);
  const top = ranked[0];

  let seniority: Detection["seniority"] = null;
  if (/\b(staff|principal|lead)\b/.test(titleBlob)) seniority = "staff";
  else if (/\b(senior|sr\.?|especialista)\b/.test(titleBlob)) seniority = "senior";
  else if (/\b(pleno|mid|middle|pl\.?)\b/.test(titleBlob)) seniority = "pleno";
  else if (/\b(junior|jr\.?|trainee|estagi)/.test(titleBlob)) seniority = "junior";
  else if (totalYears > 0) {
    seniority =
      totalYears < 2 ? "junior" : totalYears < 5 ? "pleno" : totalYears < 9 ? "senior" : "staff";
  }

  return {
    trackId: top?.[0] ?? null,
    roleVariantId: bestVariant?.id ?? null,
    confidence: top && total > 0 ? Math.round((top[1] / total) * 1000) / 1000 : 0,
    alternatives: ranked.slice(1, 3).map(([trackId, score]) => ({
      trackId,
      score: Math.round(score * 100) / 100,
    })),
    seniority,
  };
}
