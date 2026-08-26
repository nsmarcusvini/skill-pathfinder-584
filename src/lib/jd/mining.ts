/**
 * Mineração determinística de termos desconhecidos nas descrições de vaga.
 * Substitui o papel que um LLM teria: gera candidatos por padrão, e a
 * curadoria humana decide na fila (pending_skill_terms).
 */

import { normalize } from "@/lib/skill-matcher";

import type { JdSegment } from "./sections";

export interface MinedTerm {
  term: string;
  occurrences: number;
  snippet: string;
  lang: "pt" | "en" | "other";
}

const STOPWORDS_PT = new Set(
  `a as o os um uma uns umas de do da dos das em no na nos nas por para com sem sob sobre entre ate apos e ou mas que quem qual quais quando onde como porque pois se ja nao sim muito mais menos todo toda todos todas outro outra outros outras mesmo mesma ser estar ter haver fazer poder dever vai vamos voce voces nos nosso nossa nossos nossas seu sua seus suas ele ela eles elas isso isto aquilo experiencia experiencias vaga vagas time times empresa empresas trabalho trabalhar area areas nivel niveis conhecimento conhecimentos ingles portugues espanhol anos ano dia dias mes meses hora horas home office remoto hibrido presencial clt pj beneficios beneficio salario plano saude vale refeicao alimentacao transporte oportunidade desafio desafios cultura pessoas pessoa profissional profissionais candidato candidatos processo seletivo etapa etapas entrevista entrevistas requisitos requisito desejavel diferenciais atividades atividade responsabilidades responsabilidade`.split(
    /\s+/,
  ),
);

const STOPWORDS_EN = new Set(
  `a an the of in on at to for with without by from and or but that which who whom whose when where how why if then than as is are was were be been being have has had do does did can could should would will shall may might must you your yours we our ours they them their he she it its this these those there here about into over under between within across per not no yes very more most less least all any some other others same team teams company companies job jobs role roles work working experience experiences year years month months day days remote hybrid onsite office benefits benefit salary compensation opportunity challenge culture people person professional candidate candidates process interview requirements requirement preferred plus responsibilities responsibility skills skill knowledge english portuguese spanish`.split(
    /\s+/,
  ),
);

/** Cidades e estados comuns em anúncios BR/global — não são skills. */
const PLACES = new Set(
  [
    "sao paulo","rio de janeiro","belo horizonte","porto alegre","curitiba","florianopolis","recife","fortaleza",
    "salvador","brasilia","campinas","goiania","manaus","belem","natal","joao pessoa","vitoria","santos","londrina",
    "sao jose dos campos","ribeirao preto","uberlandia","maringa","blumenau","joinville","caxias do sul","niteroi",
    "brasil","brazil","latam","america latina","latin america","portugal","lisboa","porto","estados unidos",
    "united states","usa","europe","europa","remote","remoto","argentina","chile","mexico","colombia","peru",
    "canada","spain","espanha","germany","alemanha","uk","london","new york","berlin","madrid","amsterdam",
    "sp","rj","mg","rs","pr","sc","ba","pe","ce","df","go","es","pa","am","mt","ms","pb","rn","al","se","pi","ro","to","ac","ap","rr",
  ],
);

/** Símbolos que indicam token técnico (k8s, ci/cd, node.js, c#, .net). */
const TECHY = /[#+./\d]/;

function isStopword(term: string): boolean {
  const norm = normalize(term);
  if (STOPWORDS_PT.has(norm) || STOPWORDS_EN.has(norm)) return true;
  return norm.split(/\s+/).every((w) => STOPWORDS_PT.has(w) || STOPWORDS_EN.has(w));
}

function isPlace(term: string): boolean {
  return PLACES.has(normalize(term));
}

function snippetAround(text: string, term: string): string {
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx < 0) return term;
  return text
    .slice(Math.max(0, idx - 70), Math.min(text.length, idx + term.length + 70))
    .replace(/\s+/g, " ")
    .trim();
}

function detectLang(text: string): "pt" | "en" | "other" {
  const pt = (text.match(/\b(de|para|com|voce|experiencia|conhecimento|nao|que|em)\b/gi) ?? []).length;
  const en = (text.match(/\b(the|and|with|you|experience|knowledge|for|to|in)\b/gi) ?? []).length;
  if (pt === 0 && en === 0) return "other";
  return pt >= en ? "pt" : "en";
}

function addCandidate(map: Map<string, MinedTerm>, term: string, source: string, lang: MinedTerm["lang"]) {
  const clean = term.replace(/^[^\p{L}\d.#+]+|[^\p{L}\d#+]+$/gu, "").trim();
  if (clean.length < 2 || clean.length > 40) return;
  if (!/[\p{L}]/u.test(clean)) return;
  if (isStopword(clean) || isPlace(clean)) return;
  const key = normalize(clean);
  const existing = map.get(key);
  if (existing) {
    existing.occurrences += 1;
    return;
  }
  map.set(key, { term: clean, occurrences: 1, snippet: snippetAround(source, clean), lang });
}

export interface MineOptions {
  /** Termos já mapeados no catálogo (canônicos + aliases, normalizados). */
  knownTerms: Set<string>;
  /** Termos rejeitados pela curadoria (normalizados). */
  blocked: Set<string>;
  companyName?: string | null;
}

/**
 * Extrai candidatos: capitalizadas fora do início de frase, tokens com símbolo
 * técnico, siglas de 2 a 6 letras maiúsculas e bigramas dentro dos requisitos.
 */
export function mineUnknownTerms(
  segments: Record<JdSegment, string>,
  options: MineOptions,
): MinedTerm[] {
  const requirementText = `${segments.requisitos}\n${segments.desejavel}`.trim();
  if (requirementText.length === 0) return [];
  const lang = detectLang(requirementText);
  const company = options.companyName ? normalize(options.companyName) : null;
  const candidates = new Map<string, MinedTerm>();

  for (const sentence of requirementText.split(/(?<=[.;!?\n])\s+/)) {
    const trimmed = sentence.trim();
    if (trimmed.length === 0) continue;
    const words = trimmed.split(/\s+/);

    words.forEach((word, position) => {
      const bare = word.replace(/^[^\p{L}\d.#+]+|[^\p{L}\d#+]+$/gu, "");
      if (bare.length < 2) return;

      // sigla de 2 a 6 letras maiúsculas
      if (/^[A-Z]{2,6}$/.test(bare)) {
        addCandidate(candidates, bare, requirementText, lang);
        return;
      }
      // token com símbolo técnico
      if (TECHY.test(bare) && /[\p{L}]/u.test(bare) && !/^\d+$/.test(bare)) {
        addCandidate(candidates, bare, requirementText, lang);
        return;
      }
      // capitalizada fora do início da frase
      if (position > 0 && /^\p{Lu}[\p{L}\d]+$/u.test(bare)) {
        addCandidate(candidates, bare, requirementText, lang);
      }
    });

    // bigramas dentro dos requisitos
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`.replace(/[^\p{L}\d\s.#+/-]/gu, "").trim();
      if (!/^[\p{Lu}\d][\p{L}\d.#+/-]*\s[\p{L}\d.#+/-]+$/u.test(bigram)) continue;
      addCandidate(candidates, bigram, requirementText, lang);
    }
  }

  return Array.from(candidates.values()).filter((candidate) => {
    const norm = normalize(candidate.term);
    if (options.knownTerms.has(norm)) return false;
    if (options.blocked.has(norm)) return false;
    if (company && (norm === company || company.includes(norm) || norm.includes(company))) return false;
    return true;
  });
}
