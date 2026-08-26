/** Seccionamento bilíngue da descrição de vaga (sem LLM). */

export type JdSegment = "requisitos" | "desejavel" | "outro";

const REQUIRED_RE =
  /^(requisitos obrigatorios|requisitos|o que esperamos|qualificacoes|voce precisa ter|o que voce precisa|requirements|must have|must haves|qualifications|what you'?ll need|what you need)\b/;

const DESIRABLE_RE =
  /^(diferenciais|desejavel|desejaveis|sera um plus|bonus|nice to have|nice-to-have|bonus points|preferred|preferred qualifications|plus)\b/;

/** Qualquer outro cabeçalho conhecido volta o cursor para fora das seções de requisito. */
const OTHER_RE =
  /^(sobre (a empresa|nos|a vaga)|beneficios|benefits|responsabilidades|responsibilities|o que voce vai fazer|what you'?ll do|nossa cultura|about us|about the role|como se candidatar|how to apply|salario|compensation|perks)\b/;

export function normalizeHeading(line: string): string {
  return line
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^[\s*#>\-–—•·]+/, "")
    .replace(/[:：*.\s]+$/g, "")
    .trim();
}

/**
 * Divide a descrição em segmentos. Texto fora de qualquer cabeçalho
 * reconhecido cai em "outro" — e nesse caso is_required fica null.
 */
export function sectionizeJd(text: string): Record<JdSegment, string> {
  const buckets: Record<JdSegment, string[]> = { requisitos: [], desejavel: [], outro: [] };
  let current: JdSegment = "outro";

  for (const line of text.split(/\r?\n/)) {
    const flat = normalizeHeading(line);
    if (flat.length > 0 && flat.length <= 60) {
      if (REQUIRED_RE.test(flat)) {
        current = "requisitos";
        continue;
      }
      if (DESIRABLE_RE.test(flat)) {
        current = "desejavel";
        continue;
      }
      if (OTHER_RE.test(flat)) {
        current = "outro";
        continue;
      }
    }
    buckets[current].push(line);
  }

  return {
    requisitos: buckets.requisitos.join("\n"),
    desejavel: buckets.desejavel.join("\n"),
    outro: buckets.outro.join("\n"),
  };
}

/** requisitos → true, desejável → false, fora de seção reconhecida → null. */
export function isRequiredFromSegments(segments: Set<JdSegment>): boolean | null {
  if (segments.has("requisitos")) return true;
  if (segments.has("desejavel")) return false;
  return null;
}
