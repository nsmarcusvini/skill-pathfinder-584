/**
 * Replica as faixas salariais curadas de uma trilha para outra.
 *
 *   bun run scripts/replicar-salarios.ts --de=fullstack --para=backend
 *   bun run scripts/replicar-salarios.ts --de=fullstack --para=backend --apply
 *
 * Por que existe: `salary_observations` é dado curado à mão pelo admin (decisão
 * de 2026-08-28) — não é seed, então não entra em migration. Mas cadastrar 8
 * faixas uma a uma no diálogo de `/admin/salarios` a cada trilha nova é
 * trabalho manual repetido, e trilha nova sem salário deixa `/salarios` vazia.
 *
 * Faz exatamente o que `createSalaryObservation` faz (admin.functions.ts):
 * mesmo `source='admin'`, `status='aprovada'`, mesmo `country` por segmento, e
 * o mesmo `refresh_market_views()` no fim — sem o refresh a tela lê a
 * materialized view velha e nada muda.
 *
 * Convenção de período (regra 5 do CLAUDE.md — moeda e segmento nunca se
 * misturam): **BRL é mensal, USD é anual**. O período é derivado da moeda aqui
 * em vez de copiado da origem, para a regra valer mesmo se a origem divergir.
 *
 * Idempotente: pula par (senioridade × segmento) que a trilha destino já tem.
 * Nunca sobrescreve faixa existente — corrigir valor é decisão de curadoria,
 * feita no admin.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const arg = (nome: string): string | null => {
  const hit = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return hit ? hit.slice(nome.length + 3) : null;
};

const DE = arg("de") ?? "fullstack";
const PARA = arg("para") ?? "backend";
const APPLY = process.argv.includes("--apply");

if (DE === PARA) {
  console.error("Origem e destino são a mesma trilha.");
  process.exit(1);
}

/** BRL mensal, USD anual. EUR segue a mesma lógica de moeda estrangeira. */
function periodoDaMoeda(currency: string): "month" | "year" {
  return currency === "BRL" ? "month" : "year";
}

const { data: tracks, error: trackErr } = await supabaseAdmin
  .from("career_tracks")
  .select("id, key, name, is_active")
  .in("key", [DE, PARA]);

if (trackErr) {
  console.error(`Erro lendo career_tracks: ${trackErr.message}`);
  process.exit(1);
}

const origem = tracks?.find((t) => t.key === DE);
const destino = tracks?.find((t) => t.key === PARA);
if (!origem) {
  console.error(`Trilha de origem "${DE}" não existe.`);
  process.exit(1);
}
if (!destino) {
  console.error(`Trilha de destino "${PARA}" não existe.`);
  process.exit(1);
}

console.log(`Origem:  ${origem.name} (${DE})`);
console.log(`Destino: ${destino.name} (${PARA})${destino.is_active ? "" : "  ⚠ trilha INATIVA"}`);
console.log(APPLY ? "Modo:    APLICAR\n" : "Modo:    simulação (use --apply para gravar)\n");

const { data: fonte, error: fonteErr } = await supabaseAdmin
  .from("salary_observations")
  .select("seniority, market_segment, currency, amount_min, amount_max, observed_at")
  .eq("track_id", origem.id)
  .eq("status", "aprovada")
  .order("market_segment")
  .order("seniority");

if (fonteErr) {
  console.error(`Erro lendo salary_observations: ${fonteErr.message}`);
  process.exit(1);
}
if (!fonte || fonte.length === 0) {
  console.error(`A trilha "${DE}" não tem faixa aprovada para replicar.`);
  process.exit(1);
}

const { data: jaExiste, error: destErr } = await supabaseAdmin
  .from("salary_observations")
  .select("seniority, market_segment")
  .eq("track_id", destino.id);

if (destErr) {
  console.error(`Erro lendo destino: ${destErr.message}`);
  process.exit(1);
}
const ocupado = new Set((jaExiste ?? []).map((r) => `${r.market_segment}|${r.seniority}`));

const novas = [];
for (const f of fonte) {
  const chave = `${f.market_segment}|${f.seniority}`;
  const periodo = periodoDaMoeda(f.currency);
  const rotulo =
    `  ${String(f.market_segment).padEnd(14)} ${String(f.seniority).padEnd(8)} ` +
    `${f.currency} ${periodo.padEnd(5)} ${f.amount_min}–${f.amount_max}`;

  if (ocupado.has(chave)) {
    console.log(`${rotulo}   … já existe em ${PARA}, pulando`);
    continue;
  }
  console.log(rotulo);
  novas.push({
    track_id: destino.id,
    seniority: f.seniority,
    market_segment: f.market_segment,
    country: f.market_segment === "br" ? "BR" : null,
    currency: f.currency,
    period: periodo,
    amount_min: f.amount_min,
    amount_max: f.amount_max,
    source: "admin",
    status: "aprovada",
    observed_at: f.observed_at,
    reviewed_at: new Date().toISOString(),
    // Sem admin logado num script: a procedência fica no texto, não num uuid falso.
    review_note: `Replicado de ${DE} por scripts/replicar-salarios.ts`,
  });
}

console.log(`\n${novas.length} faixa(s) ${APPLY ? "a inserir" : "seriam inseridas"} em ${PARA}.`);

if (novas.length === 0) {
  console.log("Nada a fazer.");
  process.exit(0);
}
if (!APPLY) {
  console.log("Rode com --apply para gravar.");
  process.exit(0);
}

const { error: insErr } = await supabaseAdmin.from("salary_observations").insert(novas);
if (insErr) {
  console.error(`Falhou ao inserir: ${insErr.message}`);
  process.exit(1);
}
console.log("✓ inseridas");

// A tela lê a materialized view, não a tabela.
const { error: refreshErr } = await supabaseAdmin.rpc("refresh_market_views");
if (refreshErr) {
  console.error(`⚠ inseridas, mas a estatística NÃO recalculou: ${refreshErr.message}`);
  console.error("  Rode: select public.refresh_market_views();");
  process.exit(1);
}
console.log("✓ mv_salary_stats recalculada");
