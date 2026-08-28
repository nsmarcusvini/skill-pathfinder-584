/**
 * Preenche city/state das vagas já ingeridas a partir de location_raw.
 *
 *   bun run scripts/backfill-location.ts --dry   # só mostra o que faria
 *   bun run scripts/backfill-location.ts         # grava
 *
 * As colunas city e state existiam vazias na base inteira: o pipeline nunca as
 * escrevia. Sem elas não dá para filtrar vaga por localidade — só sobrava o
 * location_raw em texto livre, onde "São Paulo, São Paulo, Brazil" e
 * "São Paulo, Brazil" são valores distintos.
 *
 * Importa parseLocation de lib/ingest/normalize — a MESMA função que o pipeline
 * usa daqui em diante. Reescrever a regra em SQL faria a base velha e a nova
 * divergirem no primeiro caso de borda (CLAUDE.md, regra 4).
 *
 * Idempotente: rodar de novo sobre o mesmo dado não muda nada.
 */
import { createClient } from "@supabase/supabase-js";

import { parseLocation } from "@/lib/ingest/normalize";
import type { Database } from "@/integrations/supabase/types";

const seco = process.argv.includes("--dry");

for (const v of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[v]) {
    console.error(`Faltando ${v} no ambiente. Confira o .env.`);
    process.exit(1);
  }
}

const supabase = createClient<Database>(
  process.env["SUPABASE_URL"]!,
  process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
  { auth: { persistSession: false } },
);

const PAGINA = 500;
let offset = 0;
let lidas = 0;
let alteradas = 0;
const amostra: string[] = [];

for (;;) {
  const { data, error } = await supabase
    .from("job_postings")
    .select("id, location_raw, city, state")
    .order("id")
    .range(offset, offset + PAGINA - 1);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) break;

  for (const vaga of data) {
    lidas += 1;
    const { city, state } = parseLocation(vaga.location_raw);
    // Só escreve o que de fato muda — mantém a operação idempotente e evita
    // reescrever a tabela inteira a cada execução.
    if (city === vaga.city && state === vaga.state) continue;

    alteradas += 1;
    if (amostra.length < 10) {
      amostra.push(`${vaga.location_raw ?? "(vazio)"}  ->  ${city ?? "—"} / ${state ?? "—"}`);
    }
    if (!seco) {
      const { error: upErr } = await supabase
        .from("job_postings")
        .update({ city, state })
        .eq("id", vaga.id);
      if (upErr) console.error(`Falha em ${vaga.id}: ${upErr.message}`);
    }
  }

  offset += PAGINA;
}

console.info(`\nlidas: ${lidas}   a alterar: ${alteradas}${seco ? "   (simulação)" : ""}`);
console.info("\namostra:");
for (const l of amostra) console.info(`  ${l}`);
