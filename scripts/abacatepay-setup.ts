/**
 * Conecta o plano do banco à loja AbacatePay. Rode uma vez por ambiente
 * (sandbox e produção têm chaves e produtos separados).
 *
 *   bun run scripts/abacatepay-setup.ts
 *   bun run scripts/abacatepay-setup.ts --plan pro_mensal
 *
 * O que faz, de forma idempotente:
 *   1. lê o plano em `billing_plans` (preço, ciclo, trial);
 *   2. cria o produto na AbacatePay se ainda não existir (match por externalId)
 *      e grava o `prod_...` de volta em `billing_plans.abacate_product_id`;
 *   3. cadastra o webhook apontando para /api/public/abacatepay-webhook, com o
 *      `ABACATE_PAY_WEBHOOK_SECRET` na query string.
 *
 * Variáveis necessárias no .env:
 *   ABACATE_PAY_API_KEY, ABACATE_PAY_WEBHOOK_SECRET, APP_BASE_URL,
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { abacate, isDevModeKey } from "@/lib/abacatepay/client.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { AbacateCycle, AbacateWebhookEvent } from "@/lib/abacatepay/types";

const EVENTOS: AbacateWebhookEvent[] = [
  "subscription.completed",
  "subscription.renewed",
  "subscription.cancelled",
  "subscription.trial_started",
  "checkout.completed",
  "checkout.refunded",
  "checkout.disputed",
  "checkout.lost",
];

const OBRIGATORIAS = [
  "ABACATE_PAY_API_KEY",
  "ABACATE_PAY_WEBHOOK_SECRET",
  "APP_BASE_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

for (const v of OBRIGATORIAS) {
  if (!process.env[v]) {
    console.error(`Faltando ${v} no ambiente. Confira o .env.`);
    process.exit(1);
  }
}

const args = process.argv.slice(2);
const planKey = args.includes("--plan") ? args[args.indexOf("--plan") + 1]! : "pro_mensal";
const baseUrl = process.env["APP_BASE_URL"]!.replace(/\/+$/, "");
const webhookSecret = process.env["ABACATE_PAY_WEBHOOK_SECRET"]!;
const endpoint = `${baseUrl}/api/public/abacatepay-webhook?webhookSecret=${encodeURIComponent(webhookSecret)}`;

if (!baseUrl.startsWith("https://")) {
  console.error(`APP_BASE_URL precisa ser HTTPS público (recebi: ${baseUrl}).`);
  console.error("Para testar local, exponha o app com um túnel (cloudflared, ngrok).");
  process.exit(1);
}

console.log(`Ambiente: ${isDevModeKey() ? "SANDBOX (chave abc_dev_)" : "PRODUÇÃO"}`);
console.log(`Plano:    ${planKey}`);
console.log(`Webhook:  ${baseUrl}/api/public/abacatepay-webhook?webhookSecret=***\n`);

// ─── 1. plano ────────────────────────────────────────────────────────────────
const { data: plan, error: planError } = await supabaseAdmin
  .from("billing_plans")
  .select("id, key, name, description, price_cents, cycle, trial_days, abacate_product_id")
  .eq("key", planKey)
  .maybeSingle();

if (planError) {
  console.error(`Erro lendo billing_plans: ${planError.message}`);
  process.exit(1);
}
if (!plan) {
  console.error(`Plano "${planKey}" não existe. Rode a migration 20260831120000 primeiro.`);
  process.exit(1);
}

// ─── 2. produto ──────────────────────────────────────────────────────────────
const externalId = `rumvia-${plan.key}`;
let productId = plan.abacate_product_id;

if (productId) {
  console.log(`✓ produto já vinculado: ${productId}`);
} else {
  const existentes = await abacate.listProducts();
  const jaCriado = existentes.find((p) => p.externalId === externalId);

  if (jaCriado) {
    productId = jaCriado.id;
    console.log(`✓ produto encontrado na loja por externalId: ${productId}`);
  } else {
    const criado = await abacate.createProduct({
      externalId,
      name: plan.name,
      description: plan.description ?? undefined,
      price: plan.price_cents,
      cycle: plan.cycle as AbacateCycle,
      trialDays: plan.trial_days ?? undefined,
    });
    productId = criado.id;
    console.log(
      `✓ produto criado: ${productId} — ${criado.name}, ${(criado.price / 100).toFixed(2)} BRL / ${criado.cycle}`,
    );
  }

  const { error } = await supabaseAdmin
    .from("billing_plans")
    .update({ abacate_product_id: productId })
    .eq("id", plan.id);
  if (error) {
    console.error(
      `Produto criado (${productId}) mas falhou gravar em billing_plans: ${error.message}`,
    );
    process.exit(1);
  }
  console.log(`✓ billing_plans.abacate_product_id atualizado`);
}

// ─── 3. webhook ──────────────────────────────────────────────────────────────
const webhooks = await abacate.listWebhooks();
const jaExiste = webhooks.find((w) => w.endpoint === endpoint);

if (jaExiste) {
  console.log(`✓ webhook já cadastrado: ${jaExiste.id}`);
  const faltando = EVENTOS.filter((e) => !jaExiste.events.includes(e));
  if (faltando.length > 0) {
    console.warn(`  ⚠ eventos faltando nesse webhook: ${faltando.join(", ")}`);
    console.warn(`    Ajuste no dashboard da AbacatePay ou apague e rode este script de novo.`);
  }
} else {
  const criado = await abacate.createWebhook({
    name: `RUMVIA ${isDevModeKey() ? "sandbox" : "produção"}`,
    endpoint,
    secret: webhookSecret,
    events: EVENTOS,
  });
  console.log(`✓ webhook criado: ${criado.id} (${criado.events.length} eventos)`);
}

console.log("\nPronto. A tela /assinatura já consegue abrir o checkout.");
