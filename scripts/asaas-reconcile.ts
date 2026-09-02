/**
 * Reconcilia `subscriptions` local com a verdade do Asaas.
 *
 *   bun run scripts/asaas-reconcile.ts          # só mostra o que faria
 *   bun run scripts/asaas-reconcile.ts --apply  # grava
 *
 * Por que existe: o webhook é a via normal, mas ele é *at least once* e
 * **não retroativo**. Um evento que chegou enquanto a correlação estava
 * quebrada (ver `checkoutSession` em webhook.server.ts) já foi consumido pela
 * idempotência de `billing_events` — reenviar não adianta, o handler devolve
 * "duplicate". Sem uma reconciliação, o usuário fica pagando e bloqueado para
 * sempre, e a única saída é UPDATE na mão.
 *
 * Também serve de rede para o caso comum de webhook perdido (fila interrompida
 * após 15 falhas, deploy fora do ar, domínio trocado).
 *
 * O elo é o `checkoutSession` do Asaas = `provider_checkout_id` local.
 */
import { asaas, isSandboxKey } from "@/lib/asaas/client.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { addCycle } from "@/lib/asaas/webhook.server";
import type { AsaasPayment, AsaasSubscription } from "@/lib/asaas/types";

const APPLY = process.argv.includes("--apply");
/** Status locais que ainda podem virar `active` — os finais não se mexem. */
const ABERTOS = ["pending", "past_due"];
/** No Asaas, dinheiro que já conta: CONFIRMED (pago) e RECEIVED (liquidado). */
const PAGO = ["CONFIRMED", "RECEIVED"];

console.log(`Ambiente: ${isSandboxKey() ? "SANDBOX" : "PRODUÇÃO"}`);
console.log(APPLY ? "Modo: APLICAR\n" : "Modo: simulação (use --apply para gravar)\n");

const { data: locais, error } = await supabaseAdmin
  .from("subscriptions")
  .select("id, user_id, status, plan_id, provider_checkout_id, provider_subscription_id")
  .in("status", ABERTOS)
  .order("created_at", { ascending: false });

if (error) {
  console.error(`Erro lendo subscriptions: ${error.message}`);
  process.exit(1);
}
if (!locais || locais.length === 0) {
  console.log("Nenhuma assinatura em aberto. Nada a reconciliar.");
  process.exit(0);
}

console.log(`${locais.length} assinatura(s) em aberto.\n`);

// Uma página de assinaturas resolve o mapa checkoutSession -> sub_...; só
// buscamos individualmente quem já tem o id gravado.
let remotas: AsaasSubscription[] = [];
try {
  remotas = (await asaas.listSubscriptions(100)).data ?? [];
} catch (e) {
  console.warn(`  ⚠ não consegui listar assinaturas: ${e instanceof Error ? e.message : e}`);
}
const porCheckout = new Map<string, AsaasSubscription>();
for (const r of remotas) {
  if (r.checkoutSession) porCheckout.set(r.checkoutSession, r);
}

let reparadas = 0;

for (const local of locais) {
  const rotulo = `${local.id} (user ${local.user_id}, ${local.status})`;

  let remota: AsaasSubscription | null = null;
  if (local.provider_subscription_id) {
    try {
      remota = await asaas.getSubscription(local.provider_subscription_id);
    } catch {
      /* cai para o mapa */
    }
  }
  if (!remota && local.provider_checkout_id) {
    remota = porCheckout.get(local.provider_checkout_id) ?? null;
  }

  if (!remota) {
    console.log(`- ${rotulo}\n    sem assinatura correspondente no Asaas — deixando como está.`);
    continue;
  }

  let pagamentos: AsaasPayment[] = [];
  try {
    pagamentos = (await asaas.listPaymentsBySubscription(remota.id)).data ?? [];
  } catch (e) {
    console.log(`- ${rotulo}\n    erro lendo cobranças: ${e instanceof Error ? e.message : e}`);
    continue;
  }

  const pago = pagamentos
    .filter((p) => PAGO.includes(p.status))
    .sort((a, b) => (a.confirmedDate ?? "").localeCompare(b.confirmedDate ?? ""))
    .pop();

  if (!pago) {
    console.log(`- ${rotulo}\n    ${remota.id}: nenhuma cobrança paga ainda — correto seguir pendente.`);
    continue;
  }

  const inicio = new Date(
    pago.confirmedDate ?? pago.paymentDate ?? pago.clientPaymentDate ?? new Date().toISOString(),
  );
  let fim: Date;
  if (remota.nextDueDate) {
    fim = new Date(remota.nextDueDate);
  } else {
    const { data: plano } = await supabaseAdmin
      .from("billing_plans")
      .select("cycle")
      .eq("id", local.plan_id)
      .maybeSingle();
    fim = addCycle(inicio, plano?.cycle ?? "MONTHLY");
  }

  const patch = {
    status: "active",
    provider_subscription_id: remota.id,
    provider_customer_id: pago.customer ?? remota.customer,
    method: pago.billingType ?? remota.billingType,
    current_period_start: inicio.toISOString(),
    current_period_end: fim.toISOString(),
    last_payment_at: inicio.toISOString(),
    last_receipt_url: pago.transactionReceiptUrl ?? null,
    cancelled_at: null,
    cancelled_due_to: null,
  };

  console.log(
    `- ${rotulo}\n    ${remota.id} tem ${pago.id} ${pago.status} (R$ ${pago.value}) em ${inicio.toISOString().slice(0, 10)}\n    -> status=active, acesso até ${fim.toISOString().slice(0, 10)}`,
  );

  if (APPLY) {
    const { error: upErr } = await supabaseAdmin
      .from("subscriptions")
      .update(patch)
      .eq("id", local.id);
    if (upErr) {
      console.error(`    !! falhou ao gravar: ${upErr.message}`);
      continue;
    }
    console.log("    ✓ gravado");
  }
  reparadas += 1;
}

console.log(
  `\n${reparadas} assinatura(s) ${APPLY ? "reparada(s)" : "seriam reparadas"}.` +
    (APPLY ? "" : "\nRode com --apply para gravar."),
);
