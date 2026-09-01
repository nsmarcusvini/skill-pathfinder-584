/**
 * Conecta o RUMVIA à conta Asaas. Rode uma vez por ambiente (sandbox e produção
 * têm chaves e webhooks separados).
 *
 *   bun run scripts/asaas-setup.ts
 *
 * O que faz, de forma idempotente:
 *   1. valida a chave e confere se a conta está aprovada para cobrar;
 *   2. confere que o plano existe em `billing_plans`;
 *   3. cadastra o webhook apontando para /api/public/asaas-webhook.
 *
 * Diferente da AbacatePay, o Asaas NÃO exige catálogo de produtos — o preço vai
 * direto no checkout. Por isso não há passo de "criar produto" aqui, e
 * `billing_plans.provider_plan_ref` fica NULL de propósito.
 *
 * Variáveis necessárias no .env:
 *   ASAAS_API_KEY, ASAAS_WEBHOOK_TOKEN, APP_BASE_URL,
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { asaas, isSandboxKey } from "@/lib/asaas/client.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { AsaasWebhookEvent } from "@/lib/asaas/types";

const EVENTOS: AsaasWebhookEvent[] = [
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_OVERDUE",
  "PAYMENT_REFUNDED",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "SUBSCRIPTION_CREATED",
  "SUBSCRIPTION_UPDATED",
  "SUBSCRIPTION_INACTIVATED",
  "SUBSCRIPTION_DELETED",
];

const OBRIGATORIAS = [
  "ASAAS_API_KEY",
  "ASAAS_WEBHOOK_TOKEN",
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

const baseUrl = process.env["APP_BASE_URL"]!.replace(/\/+$/, "");
const authToken = process.env["ASAAS_WEBHOOK_TOKEN"]!;
const endpoint = `${baseUrl}/api/public/asaas-webhook`;

if (!baseUrl.startsWith("https://")) {
  console.error(`APP_BASE_URL precisa ser HTTPS público (recebi: ${baseUrl}).`);
  console.error("Para testar local, exponha o app com um túnel (cloudflared, ngrok).");
  process.exit(1);
}
if (authToken.length < 32) {
  console.error("ASAAS_WEBHOOK_TOKEN precisa ter no mínimo 32 caracteres (exigência do Asaas).");
  process.exit(1);
}

console.log(`Ambiente: ${isSandboxKey() ? "SANDBOX (chave $aact_hmlg_)" : "PRODUÇÃO"}`);
console.log(`Webhook:  ${endpoint}\n`);

// ─── 1. conta ────────────────────────────────────────────────────────────────
const conta = await asaas.myAccount();
const status = await asaas.accountStatus();

console.log(`✓ conta: ${conta.email} (${conta.personType}, ${conta.cpfCnpj})`);
console.log(
  `  comercial=${status.commercialInfo} banco=${status.bankAccountInfo} ` +
    `documentos=${status.documentation} geral=${status.general}`,
);

if (status.general !== "APPROVED") {
  console.warn(
    "\n  ⚠ A conta ainda NÃO está totalmente aprovada. O checkout pode falhar\n" +
      "    até o Asaas concluir a análise cadastral.",
  );
}

// Pessoa física não pode receber PIX Automático (regra do Banco Central: o
// recebedor precisa ser PJ). Avisa cedo em vez de deixar o erro aparecer só
// quando alguém tentar assinar.
if (conta.personType === "FISICA") {
  console.log(
    "\n  ℹ Conta pessoa física: só cartão. PIX Automático exige CNPJ (regra do\n" +
      "    Banco Central), e no Asaas o CNPJ precisa ter 6+ meses de atividade.",
  );
}

// ─── 2. plano ────────────────────────────────────────────────────────────────
const { data: plan, error: planError } = await supabaseAdmin
  .from("billing_plans")
  .select("id, key, name, price_cents, cycle, methods, is_active")
  .eq("key", "pro_mensal")
  .maybeSingle();

if (planError) {
  console.error(`Erro lendo billing_plans: ${planError.message}`);
  process.exit(1);
}
if (!plan) {
  console.error('Plano "pro_mensal" não existe. Rode as migrations primeiro.');
  process.exit(1);
}

console.log(
  `\n✓ plano: ${plan.name} — R$ ${(plan.price_cents / 100).toFixed(2)} / ${plan.cycle} ` +
    `(métodos: ${plan.methods.join(", ")})`,
);

// ─── 3. webhook ──────────────────────────────────────────────────────────────
const webhooks = await asaas.listWebhooks();
const jaExiste = webhooks.find((w) => w.url === endpoint);

if (jaExiste) {
  console.log(`\n✓ webhook já cadastrado: ${jaExiste.id}`);
  const faltando = EVENTOS.filter((e) => !jaExiste.events.includes(e));
  if (faltando.length > 0) {
    console.warn(`  ⚠ eventos faltando: ${faltando.join(", ")}`);
    console.warn(`    Ajuste no painel do Asaas ou apague o webhook e rode este script de novo.`);
  }
  if (jaExiste.interrupted) {
    console.warn(
      `  ⚠ webhook INTERROMPIDO — o Asaas para a fila após 15 falhas seguidas.\n` +
        `    Reative no painel depois de corrigir o endpoint.`,
    );
  }
} else {
  const criado = await asaas.createWebhook({
    name: `RUMVIA ${isSandboxKey() ? "sandbox" : "produção"}`,
    url: endpoint,
    email: conta.email,
    authToken,
    events: EVENTOS,
  });
  console.log(`\n✓ webhook criado: ${criado.id} (${criado.events.length} eventos)`);
}

console.log("\nPronto. A tela /assinatura já consegue abrir o checkout.");
