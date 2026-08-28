/**
 * Roda a ingestão de vagas localmente, sem depender de deploy nem do pg_cron.
 *
 *   bun run scripts/ingest.ts              # todas as fontes ativas
 *   bun run scripts/ingest.ts remoteok     # só as fontes informadas
 *
 * Usa o MESMO runIngest() que o endpoint /api/public/ingest-jobs — nada de
 * pipeline paralelo, senão a normalização e o matcher de skills divergiriam
 * (CLAUDE.md, regras 4 e 9). Lê SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY do .env,
 * que o bun carrega sozinho.
 */
import { runIngest } from "@/lib/ingest/run.server";

const chaves = process.argv.slice(2);

for (const v of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[v]) {
    console.error(`Faltando ${v} no ambiente. Confira o .env.`);
    process.exit(1);
  }
}

const alvo = process.env["SUPABASE_URL"]!.replace(/^https:\/\//, "").split(".")[0];
console.log(`Ingerindo em ${alvo}${chaves.length ? ` (fontes: ${chaves.join(", ")})` : " (todas as fontes ativas)"}\n`);

const inicio = Date.now();
const r = await runIngest(chaves.length ? chaves : undefined);
const seg = ((Date.now() - inicio) / 1000).toFixed(1);

console.log("FONTE                    STATUS    RECEB  NOVAS  ATUAL  REJEIT");
console.log("─".repeat(66));
for (const s of r.sources) {
  const linha = [
    s.source_key.padEnd(24),
    s.status.padEnd(9),
    String(s.received).padStart(5),
    String(s.created).padStart(6),
    String(s.updated).padStart(6),
    String(s.rejected).padStart(7),
  ].join(" ");
  console.log(linha);
  if (s.error) console.log(`  └─ ${s.error.slice(0, 160)}`);
}

const totalNovas = r.sources.reduce((a, s) => a + s.created, 0);
const totalAtual = r.sources.reduce((a, s) => a + s.updated, 0);
const skills = (r.extraction ?? []).reduce((a, e) => a + e.skills_written, 0);

console.log("─".repeat(66));
console.log(`${totalNovas} vaga(s) nova(s), ${totalAtual} atualizada(s), ${r.deactivated} desativada(s)`);
console.log(`${skills} vínculo(s) de skill extraído(s) · ${seg}s`);
