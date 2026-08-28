/**
 * Reprocessa a extração de skills das vagas já ingeridas, em lotes, sem
 * rebuscar nada nas fontes.
 *
 *   bun run scripts/extract-skills.ts
 *
 * Útil depois de mexer no dicionário (aliases, match_patterns) ou no matcher:
 * zere job_postings.skills_extracted_at e rode este script para a base inteira
 * refletir a regra nova.
 */
import { extractJdSkills } from "@/lib/jd/extract.server";

for (const v of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[v]) {
    console.error(`Faltando ${v} no ambiente. Confira o .env.`);
    process.exit(1);
  }
}

let lote = 0;
let totalVagas = 0;
let totalSkills = 0;
let totalTermos = 0;
const inicio = Date.now();

for (;;) {
  const r = await extractJdSkills({});
  lote += 1;
  totalVagas += r.processed;
  totalSkills += r.skills_written;
  totalTermos += r.terms_queued;

  console.log(
    `lote ${String(lote).padStart(2)}: ${String(r.processed).padStart(4)} vaga(s), ` +
      `${String(r.skills_written).padStart(5)} skill(s), ${String(r.remaining).padStart(5)} restante(s)`,
  );

  if (r.processed === 0 || r.remaining === 0) break;
  if (lote > 200) {
    console.warn("Parando por segurança em 200 lotes.");
    break;
  }
}

const seg = ((Date.now() - inicio) / 1000).toFixed(1);
console.log("─".repeat(60));
console.log(`${totalVagas} vaga(s) processada(s) · ${totalSkills} vínculo(s) de skill`);
console.log(`${totalTermos} termo(s) desconhecido(s) na fila de curadoria · ${seg}s`);
