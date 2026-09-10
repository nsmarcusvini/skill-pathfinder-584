/**
 * Relatório de uso de uma conta — a evidência de entrega. Só lê, não grava.
 *
 *   bun run scripts/relatorio-uso.ts --email pessoa@exemplo.com
 *   bun run scripts/relatorio-uso.ts --user <uuid>
 *   bun run scripts/relatorio-uso.ts --user <uuid> --detalhe
 *   bun run scripts/relatorio-uso.ts --user <uuid> --csv uso.csv
 *
 * PARA QUE SERVE
 * Quando chega uma contestação de cartão, o Asaas pede prova de que o serviço
 * foi prestado; num Procon, a pergunta é a mesma com outro nome. Este script
 * responde com número e data: quantas vagas a pessoa abriu, quantos links de
 * candidatura ela clicou, em que dias. É a diferença entre "achamos que ele
 * usou bastante" e "nos dias 2, 3 e 4 foram 180 vagas e 140 cliques".
 *
 * TAMBÉM SERVE PARA CALIBRAR A COTA. Os tetos em `app_settings` nasceram
 * chutados e deliberadamente altos. Rode isto sobre contas normais e olhe o
 * pico real por dia: se ninguém honesto chega perto do teto, ele está certo;
 * se alguém chega, o teto é que está errado.
 *
 * `--detalhe` desce ao nível do evento (qual vaga, que hora). Use só quando
 * precisar mesmo: é o dado mais sensível que existe aqui, some com a conta e
 * expira em 90 dias (`usage_retention_days`). O agregado é o que sobrevive, e
 * na prática é o que a defesa exige.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function arg(nome: string): string | null {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

const emailArg = arg("--email");
const userArg = arg("--user");
const csvPath = arg("--csv");
const comDetalhe = process.argv.includes("--detalhe");

if (!emailArg && !userArg) {
  console.error("Informe --email <e-mail> ou --user <uuid>.");
  process.exit(1);
}

// ─── Resolve o usuário ───────────────────────────────────────────────────────
// Por e-mail exige varrer a lista do Auth: não existe busca por e-mail na API
// de admin do Supabase. Aceitável para uma base deste tamanho e para um script
// que roda sob demanda; se um dia doer, passe o uuid direto com --user.
let userId = userArg;
if (!userId && emailArg) {
  const alvo = emailArg.trim().toLowerCase();
  let pagina = 1;
  while (!userId) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page: pagina,
      perPage: 200,
    });
    if (error) {
      console.error(`Erro lendo usuários: ${error.message}`);
      process.exit(1);
    }
    const achado = data.users.find((u) => u.email?.toLowerCase() === alvo);
    if (achado) userId = achado.id;
    if (!achado && data.users.length < 200) break;
    pagina += 1;
  }
  if (!userId) {
    console.error(`Nenhuma conta com o e-mail ${emailArg}.`);
    process.exit(1);
  }
}

// ─── Contexto da assinatura ──────────────────────────────────────────────────
// O uso sozinho não conta a história: o que importa numa contestação é o uso
// DENTRO do período pago, e em relação à data do estorno.
const { data: sub } = await supabaseAdmin
  .from("subscriptions")
  .select(
    "status, amount_cents, method, first_activated_at, current_period_end, cancelled_at, cancelled_due_to, created_at",
  )
  .eq("user_id", userId as string)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

console.log(`\n=== Uso da conta ${userId} ===`);
if (emailArg) console.log(`e-mail: ${emailArg}`);

if (sub) {
  const valor = ((sub.amount_cents ?? 0) / 100).toFixed(2);
  console.log(
    `assinatura: ${sub.status} · R$ ${valor} · ${sub.method ?? "-"} · ` +
      `1ª cobrança ${sub.first_activated_at?.slice(0, 10) ?? "-"} · ` +
      `fim do período ${sub.current_period_end?.slice(0, 10) ?? "-"}`,
  );
  if (sub.cancelled_at) {
    console.log(`cancelada em ${sub.cancelled_at.slice(0, 10)} (${sub.cancelled_due_to ?? "-"})`);
  }
} else {
  console.log("assinatura: nenhuma linha encontrada.");
}

// ─── Bloqueio de recontratação ───────────────────────────────────────────────
const { data: bloqueios } = await supabaseAdmin
  .from("resubscribe_blocks")
  .select("reason, created_at, released_at, amount_cents")
  .eq("user_id", userId as string)
  .order("created_at", { ascending: false });

for (const b of bloqueios ?? []) {
  const estado = b.released_at ? `liberado em ${b.released_at.slice(0, 10)}` : "ATIVO";
  console.log(`bloqueio: ${b.reason} em ${b.created_at.slice(0, 10)} — ${estado}`);
}

// ─── Agregado por dia ────────────────────────────────────────────────────────
const { data: diario, error: erroDiario } = await supabaseAdmin
  .from("usage_daily")
  .select("day, event_type, count")
  .eq("user_id", userId as string)
  .order("day", { ascending: true });

if (erroDiario) {
  console.error(`Erro lendo usage_daily: ${erroDiario.message}`);
  process.exit(1);
}

if (!diario || diario.length === 0) {
  console.log("\nNenhum uso registrado. (A trilha começou em 2026-09-10 — contas anteriores");
  console.log("a essa data não têm histórico, e isso não significa que não usaram.)");
} else {
  const tipos = [...new Set(diario.map((d) => d.event_type))].sort();
  const porDia = new Map<string, Map<string, number>>();
  for (const linha of diario) {
    const dia = porDia.get(linha.day) ?? new Map<string, number>();
    dia.set(linha.event_type, linha.count);
    porDia.set(linha.day, dia);
  }

  const largura = Math.max(10, ...tipos.map((t) => t.length));
  console.log(`\n${"dia".padEnd(12)}${tipos.map((t) => t.padStart(largura + 2)).join("")}`);

  const totais = new Map<string, number>();
  for (const [dia, contagens] of [...porDia.entries()].sort()) {
    const celulas = tipos.map((t) => {
      const n = contagens.get(t) ?? 0;
      totais.set(t, (totais.get(t) ?? 0) + n);
      return String(n).padStart(largura + 2);
    });
    console.log(`${dia.padEnd(12)}${celulas.join("")}`);
  }

  console.log(
    `${"TOTAL".padEnd(12)}${tipos.map((t) => String(totais.get(t) ?? 0).padStart(largura + 2)).join("")}`,
  );

  // O pico é o número que mais importa para calibrar a cota: o teto tem que
  // ficar confortavelmente acima do pior dia de um usuário honesto.
  console.log("\npico em um único dia:");
  for (const t of tipos) {
    const pico = Math.max(...diario.filter((d) => d.event_type === t).map((d) => d.count));
    console.log(`  ${t.padEnd(largura)} ${pico}`);
  }

  if (csvPath) {
    const cabecalho = "dia,evento,quantidade";
    const corpo = diario.map((d) => `${d.day},${d.event_type},${d.count}`);
    await Bun.write(csvPath, [cabecalho, ...corpo].join("\n") + "\n");
    console.log(`\n✓ CSV gravado em ${csvPath}`);
  }
}

// ─── Detalhe evento a evento ─────────────────────────────────────────────────
if (comDetalhe) {
  const { data: eventos } = await supabaseAdmin
    .from("usage_events")
    .select("created_at, event_type, subject_id, ip_hash")
    .eq("user_id", userId as string)
    .order("created_at", { ascending: true })
    .limit(2000);

  console.log(`\n=== Detalhe (${eventos?.length ?? 0} eventos, máximo 2000) ===`);
  for (const e of eventos ?? []) {
    // 8 caracteres do hash bastam para ver "veio tudo da mesma rede?", que é a
    // única pergunta que o IP responde aqui. O hash inteiro só polui a linha.
    console.log(
      `${e.created_at.replace("T", " ").slice(0, 19)}  ${e.event_type.padEnd(18)}` +
        `${(e.subject_id ?? "-").padEnd(38)}rede:${(e.ip_hash ?? "-").slice(0, 8)}`,
    );
  }
}

console.log("");
