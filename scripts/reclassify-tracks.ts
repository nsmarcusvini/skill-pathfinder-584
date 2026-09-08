/**
 * Reclassifica a trilha das vagas JÁ ingeridas.
 *
 *   bun run scripts/reclassify-tracks.ts            # mostra o que faria
 *   bun run scripts/reclassify-tracks.ts --apply    # grava
 *
 * Por que existe: `track_id` é gravado no momento da ingestão
 * (`pipeline.server.ts`). Quando o classificador muda — termo novo numa
 * variante, prioridade ajustada, trilha nova — as vagas antigas continuam com
 * a classificação velha até serem reingeridas. Como a ingestão é incremental
 * (upsert por `source_id` + `external_id`), uma vaga que não voltar a aparecer
 * na fonte nunca seria recorrigida.
 *
 * ⚠️ NÃO reimplementa a regra de classificação: importa `classifyTrack` e
 * `loadClassifier` do pipeline. Duplicar a lógica aqui faria a base divergir do
 * que a próxima ingestão vai gravar — o mesmo motivo pelo qual `skill-matcher`
 * é único (CLAUDE.md, regra 4).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { classifyTrack, loadClassifier } from "@/lib/ingest/pipeline.server";

const APPLY = process.argv.includes("--apply");

console.log(APPLY ? "Modo: APLICAR\n" : "Modo: simulação (use --apply para gravar)\n");

const variants = await loadClassifier();
if (variants.length === 0) {
  console.error("Nenhuma variante ativa em track_role_variants. Nada a fazer.");
  process.exit(1);
}

// Mapa id → chave legível, só para o relatório fazer sentido a olho nu.
const { data: tracks } = await supabaseAdmin.from("career_tracks").select("id, key");
const nomeDaTrilha = new Map((tracks ?? []).map((t) => [t.id, t.key]));
const rotulo = (id: string | null) => (id ? (nomeDaTrilha.get(id) ?? id.slice(0, 8)) : "—");

const PAGINA = 1000;
let offset = 0;
let lidas = 0;
const mudancas: Array<{ id: string; title: string; de: string; para: string }> = [];

for (;;) {
  const { data: vagas, error } = await supabaseAdmin
    .from("job_postings")
    .select("id, title, title_normalized, track_id, role_variant_id")
    .order("id")
    .range(offset, offset + PAGINA - 1);

  if (error) {
    console.error(`Erro lendo job_postings: ${error.message}`);
    process.exit(1);
  }
  if (!vagas || vagas.length === 0) break;

  for (const vaga of vagas) {
    lidas += 1;
    const novo = classifyTrack(vaga.title_normalized ?? "", variants);
    if (novo.track_id === vaga.track_id && novo.role_variant_id === vaga.role_variant_id) continue;
    mudancas.push({
      id: vaga.id,
      title: vaga.title,
      de: rotulo(vaga.track_id),
      para: rotulo(novo.track_id),
    });
    if (APPLY) {
      const { error: upErr } = await supabaseAdmin
        .from("job_postings")
        .update({ track_id: novo.track_id, role_variant_id: novo.role_variant_id })
        .eq("id", vaga.id);
      if (upErr) console.error(`  !! ${vaga.id}: ${upErr.message}`);
    }
  }

  offset += PAGINA;
  if (vagas.length < PAGINA) break;
}

// ─── Relatório ───────────────────────────────────────────────────────────────
const porTransicao = new Map<string, number>();
for (const m of mudancas) {
  const chave = `${m.de} → ${m.para}`;
  porTransicao.set(chave, (porTransicao.get(chave) ?? 0) + 1);
}

console.log(`${lidas} vaga(s) lidas, ${mudancas.length} mudariam de classificação.\n`);

if (porTransicao.size > 0) {
  console.log("Por transição:");
  for (const [transicao, n] of [...porTransicao.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${transicao}`);
  }
  console.log("\nExemplos:");
  for (const m of mudancas.slice(0, 15)) {
    console.log(`  [${m.de} → ${m.para}] ${m.title.slice(0, 80)}`);
  }
}

if (APPLY) {
  console.log(
    "\n✓ Gravado. As materialized views (empresas, salários, demanda) ainda\n" +
      "  refletem a classificação antiga até o próximo refresh:\n" +
      "    select public.refresh_market_views();",
  );
} else if (mudancas.length > 0) {
  console.log("\nRode com --apply para gravar.");
}
