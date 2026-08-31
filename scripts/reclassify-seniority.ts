/**
 * Reclassifica a senioridade das vagas já ingeridas, sem rebuscar nada nas fontes.
 *
 *   bun run scripts/reclassify-seniority.ts --dry-run   # só mostra o que mudaria
 *   bun run scripts/reclassify-seniority.ts             # aplica
 *
 * Por que existe: até 2026-08-30 o `inferSeniority` concatenava o rótulo da fonte
 * com o título e testava "senior" antes de "pleno". O LinkedIn manda
 * "Mid-Senior level" em quase toda vaga, então o rótulo genérico atropelava o que
 * a vaga dizia de si — "Desenvolvedor Back-End Pleno" e "Data Engineer II" ficaram
 * gravados como sênior. Resultado: 2 em cada 3 vagas eram "senior" e a faixa
 * "pleno" tinha 2 ou 3 vagas por trilha, o que fazia a escada de ampliação do
 * compute-gap disparar para todo usuário pleno.
 *
 * LIMITE IMPORTANTE: `seniority_hint` não é gravado em job_postings, então aqui só
 * dá para reclassificar pelo TÍTULO. Por isso o script é conservador —
 * **só corrige quando o título tem um marcador explícito que discorda do que está
 * gravado, e nunca apaga uma senioridade existente**. Vaga sem marcador no título
 * fica como está: o valor atual veio de um hint que não temos mais como conferir,
 * e trocá-lo por NULL destruiria informação e encolheria os recortes do gap.
 */
import { createClient } from "@supabase/supabase-js";

import { inferSeniority } from "@/lib/ingest/normalize";
import type { Database } from "@/integrations/supabase/types";

for (const v of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[v]) {
    console.error(`Faltando ${v} no ambiente. Confira o .env.`);
    process.exit(1);
  }
}

const dryRun = process.argv.includes("--dry-run");
const PAGE = 1000;

const db = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

type Linha = { id: string; title: string; seniority: string | null };

const mudancas: Array<{ id: string; titulo: string; de: string | null; para: string }> = [];
let lidas = 0;

for (let from = 0; ; from += PAGE) {
  const { data, error } = await db
    .from("job_postings")
    .select("id, title, seniority")
    .order("id", { ascending: true })
    .range(from, from + PAGE - 1);

  if (error) {
    console.error("Falha ao ler job_postings:", error.message);
    process.exit(1);
  }
  const linhas = (data ?? []) as Linha[];
  if (linhas.length === 0) break;
  lidas += linhas.length;

  for (const l of linhas) {
    // Só o título: o hint da fonte não foi persistido na ingestão.
    const pelaRegraNova = inferSeniority(l.title ?? "", null);
    // Conservador de propósito: sem marcador no título, não mexe.
    if (!pelaRegraNova) continue;
    if (pelaRegraNova === l.seniority) continue;
    mudancas.push({ id: l.id, titulo: l.title, de: l.seniority, para: pelaRegraNova });
  }

  if (linhas.length < PAGE) break;
}

const porTransicao = new Map<string, number>();
for (const m of mudancas) {
  const k = `${m.de ?? "(sem senioridade)"} -> ${m.para}`;
  porTransicao.set(k, (porTransicao.get(k) ?? 0) + 1);
}

console.log(`\nVagas lidas: ${lidas}`);
console.log(`Vagas a corrigir: ${mudancas.length}\n`);
console.log("Transições:");
for (const [k, n] of [...porTransicao.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${k}`);
}

console.log("\nAmostra:");
for (const m of mudancas.slice(0, 15)) {
  console.log(`  [${m.de ?? "null"} -> ${m.para}] ${m.titulo}`);
}

if (dryRun) {
  console.log("\n--dry-run: nada foi gravado.");
  process.exit(0);
}

// Grava em lotes, agrupando por valor novo: um UPDATE por senioridade em vez de
// um por vaga.
let gravadas = 0;
for (const alvo of ["junior", "pleno", "senior", "staff"]) {
  const ids = mudancas.filter((m) => m.para === alvo).map((m) => m.id);
  for (let i = 0; i < ids.length; i += 200) {
    const fatia = ids.slice(i, i + 200);
    if (fatia.length === 0) continue;
    const { error } = await db.from("job_postings").update({ seniority: alvo }).in("id", fatia);
    if (error) {
      console.error(`Falha ao gravar lote de ${alvo}:`, error.message);
      process.exit(1);
    }
    gravadas += fatia.length;
  }
}

console.log(`\n${gravadas} vaga(s) atualizada(s).`);
console.log(
  "Rode `SELECT public.refresh_market_views();` — as views de mercado agregam por senioridade.",
);
