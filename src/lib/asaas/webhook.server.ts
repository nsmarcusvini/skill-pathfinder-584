/**
 * Processamento dos webhooks do Asaas. Server-only.
 *
 * Autenticação: header `asaas-access-token`, comparado com ASAAS_WEBHOOK_TOKEN.
 * O Asaas NÃO assina o corpo (diferente da AbacatePay, que tinha HMAC) — é uma
 * camada a menos, então a comparação do token usa `timingSafeEqual` e a rota
 * só aceita HTTPS em produção.
 *
 * Entrega é *at least once* e a fila para após 15 falhas consecutivas. Por isso:
 * responder 200 rápido e processar de forma idempotente (`billing_events.event_id`
 * é UNIQUE sobre o `evt_...`).
 *
 * ⚠️ O MODELO MENTAL É DIFERENTE DA ABACATEPAY:
 *   SUBSCRIPTION_*  = ciclo de vida do contrato (criada, cancelada, inativada)
 *   PAYMENT_*       = dinheiro de verdade, correlacionado pelo campo `subscription`
 * Quem move `subscriptions.status` para `active` é PAYMENT_*, não SUBSCRIPTION_*.
 */
import { timingSafeEqual } from "node:crypto";

import type { Database, Json } from "@/integrations/supabase/types";
import type { AsaasWebhookPayload } from "./types";

type SubscriptionUpdate = Database["public"]["Tables"]["subscriptions"]["Update"];

function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/** Soma um ciclo de cobrança a uma data. Só usado quando o Asaas não manda `nextDueDate`. */
export function addCycle(from: Date, cycle: string): Date {
  const next = new Date(from.getTime());
  switch (cycle) {
    case "WEEKLY":
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case "BIWEEKLY":
      next.setUTCDate(next.getUTCDate() + 14);
      break;
    case "BIMONTHLY":
      next.setUTCMonth(next.getUTCMonth() + 2);
      break;
    case "QUARTERLY":
      next.setUTCMonth(next.getUTCMonth() + 3);
      break;
    case "SEMIANNUALLY":
      next.setUTCMonth(next.getUTCMonth() + 6);
      break;
    case "YEARLY":
      next.setUTCFullYear(next.getUTCFullYear() + 1);
      break;
    case "MONTHLY":
    default:
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
  }
  return next;
}

export interface WebhookResult {
  status: number;
  body: Record<string, unknown>;
}

export async function handleAsaasWebhook(args: {
  rawBody: string;
  accessToken: string | null;
}): Promise<WebhookResult> {
  const expected = process.env["ASAAS_WEBHOOK_TOKEN"];
  if (!expected) {
    console.error("[asaas] ASAAS_WEBHOOK_TOKEN não configurado");
    return { status: 500, body: { error: "webhook não configurado" } };
  }
  if (!args.accessToken || !safeEquals(args.accessToken, expected)) {
    return { status: 401, body: { error: "asaas-access-token inválido" } };
  }

  let payload: AsaasWebhookPayload;
  try {
    payload = JSON.parse(args.rawBody) as AsaasWebhookPayload;
  } catch {
    // corpo ilegível nunca vai melhorar numa reentrega
    return { status: 200, body: { ok: true, ignored: "payload não é JSON" } };
  }
  if (!payload?.id || !payload?.event) {
    return { status: 200, body: { ok: true, ignored: "payload sem id/event" } };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Idempotência: se o event_id já entrou, não reprocessa.
  const { error: insertError } = await supabaseAdmin.from("billing_events").insert({
    event_id: payload.id,
    event_type: payload.event,
    dev_mode: (process.env["ASAAS_API_KEY"] ?? "").includes("_hmlg_"),
    payload: payload as unknown as Json,
  });
  if (insertError) {
    if (insertError.code === "23505") {
      return { status: 200, body: { ok: true, duplicate: true } };
    }
    console.error("[asaas] falha ao registrar evento", insertError.message);
    return { status: 500, body: { error: "falha ao registrar evento" } };
  }

  try {
    const outcome = await applyEvent(payload);
    // `handled` reflete se o evento MUDOU alguma coisa. Marcar tudo como
    // tratado escondia o pior modo de falha que já tivemos aqui: evento
    // chegando, sendo gravado, e nada acontecendo por falta de correlação —
    // o usuário pagava e continuava bloqueado, sem nenhum sinal no banco.
    await supabaseAdmin
      .from("billing_events")
      .update({
        handled: outcome.applied,
        subscription_id: outcome.subscriptionId,
        handle_error: outcome.reason ?? null,
      })
      .eq("event_id", payload.id);
    // 200 mesmo sem aplicar: reentrega não conserta evento órfão, e devolver
    // erro só travaria a fila SEQUENTIALLY do Asaas.
    return { status: 200, body: { ok: true, applied: outcome.applied } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[asaas] erro ao aplicar ${payload.event}:`, message);
    await supabaseAdmin
      .from("billing_events")
      .update({ handled: false, handle_error: message })
      .eq("event_id", payload.id);
    return { status: 500, body: { error: message } };
  }
}

type SubscriptionRow = {
  id: string;
  user_id: string;
  status: string;
  current_period_end: string | null;
  plan_id: string;
};

const SELECT = "id, user_id, status, current_period_end, plan_id";

/**
 * Localiza a assinatura local, do elo mais forte ao mais fraco.
 *
 * ⚠️ O elo que REALMENTE chega é o `checkoutSession`, não o `externalReference`.
 * O `externalReference` que mandamos no corpo do POST /checkouts fica só na
 * sessão de checkout: nem a assinatura nem as cobranças que ela gera o herdam.
 * Verificado em 2026-09-01 com payload real de PAYMENT_CONFIRMED — vinha
 * `externalReference: null` e `checkoutSession: "<uuid do nosso checkout>"`.
 * Sem esse candidato, todo pagamento ficava órfão: o usuário pagava, o webhook
 * chegava, e a assinatura local seguia `pending` para sempre.
 *
 * O `externalReference` continua na lista porque é o elo mais explícito e pode
 * voltar a vir (cobrança avulsa, ou se o Asaas passar a propagar).
 */
async function findSubscription(payload: AsaasWebhookPayload): Promise<SubscriptionRow | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const candidates: Array<[column: string, value: string]> = [];

  const externalRef =
    payload.payment?.externalReference ?? payload.subscription?.externalReference ?? null;
  if (externalRef) candidates.push(["external_id", externalRef]);

  const checkoutSession =
    payload.payment?.checkoutSession ?? payload.subscription?.checkoutSession ?? null;
  if (checkoutSession) candidates.push(["provider_checkout_id", checkoutSession]);

  const subId = payload.payment?.subscription ?? payload.subscription?.id ?? null;
  if (subId) candidates.push(["provider_subscription_id", subId]);

  const customerId = payload.payment?.customer ?? payload.subscription?.customer ?? null;

  for (const [column, value] of candidates) {
    const { data } = await supabaseAdmin
      .from("subscriptions")
      .select(SELECT)
      .eq(column, value)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data as SubscriptionRow;
  }

  // O payload não trouxe externalReference: busca na API pela assinatura.
  if (subId) {
    try {
      const { asaas } = await import("./client.server");
      const remote = await asaas.getSubscription(subId);
      if (remote.externalReference) {
        const { data } = await supabaseAdmin
          .from("subscriptions")
          .select(SELECT)
          .eq("external_id", remote.externalReference)
          .limit(1)
          .maybeSingle();
        if (data) {
          await supabaseAdmin
            .from("subscriptions")
            .update({ provider_subscription_id: subId })
            .eq("id", (data as SubscriptionRow).id);
          return data as SubscriptionRow;
        }
      }
    } catch (error) {
      console.warn("[asaas] falha ao buscar assinatura para correlacionar:", error);
    }
  }

  // Último recurso: cliente com assinatura viva.
  if (customerId) {
    const { data } = await supabaseAdmin
      .from("subscriptions")
      .select(SELECT)
      .eq("provider_customer_id", customerId)
      .in("status", ["pending", "active", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data as SubscriptionRow;
  }

  return null;
}

interface ApplyOutcome {
  subscriptionId: string | null;
  /** Mudou estado local? `false` = evento chegou mas não teve efeito. */
  applied: boolean;
  reason?: string;
}

/** Aplica o efeito do evento. Devolve o id da assinatura local afetada. */
async function applyEvent(payload: AsaasWebhookPayload): Promise<ApplyOutcome> {
  const event = payload.event;
  if (!event.startsWith("PAYMENT_") && !event.startsWith("SUBSCRIPTION_")) {
    return { subscriptionId: null, applied: false, reason: `evento ignorado: ${event}` };
  }

  const subscription = await findSubscription(payload);
  if (!subscription) {
    const reason =
      `${event} sem assinatura local correspondente ` +
      `(checkoutSession=${payload.payment?.checkoutSession ?? payload.subscription?.checkoutSession ?? "-"}, ` +
      `sub=${payload.payment?.subscription ?? payload.subscription?.id ?? "-"}, ` +
      `customer=${payload.payment?.customer ?? payload.subscription?.customer ?? "-"})`;
    console.warn(`[asaas] ${reason} (${payload.id})`);
    return { subscriptionId: null, applied: false, reason };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const payment = payload.payment;
  const remoteSub = payload.subscription;

  const patch: SubscriptionUpdate = {};
  if (payment?.customer ?? remoteSub?.customer) {
    patch.provider_customer_id = (payment?.customer ?? remoteSub?.customer) as string;
  }
  if (payment?.billingType ?? remoteSub?.billingType) {
    patch.method = (payment?.billingType ?? remoteSub?.billingType) as string;
  }
  // Aprende o sub_... em QUALQUER evento que o traga: a primeira correlação vem
  // pelo checkoutSession, e daí em diante os eventos de renovação e cancelamento
  // acham a linha direto pelo id da assinatura.
  const learnedSubId = payment?.subscription ?? remoteSub?.id ?? null;
  if (learnedSubId) patch.provider_subscription_id = learnedSubId;

  switch (event) {
    // ─── dinheiro entrou ─────────────────────────────────────────────────────
    // CONFIRMED = pago (liquidação pendente). RECEIVED = dinheiro disponível.
    // Liberamos no CONFIRMED: segurar o acesso até a liquidação puniria o
    // usuário por um detalhe financeiro que não é problema dele.
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED": {
      const paidAt =
        payment?.confirmedDate ?? payment?.paymentDate ?? payment?.clientPaymentDate ?? null;
      const start = paidAt ? new Date(paidAt) : new Date();

      // Preferimos o nextDueDate que o Asaas calcula; só caímos no addCycle
      // se ele não vier — a fonte deles é mais confiável que a nossa aritmética.
      let periodEnd: Date | null = null;
      const subId = payment?.subscription ?? remoteSub?.id ?? null;
      if (subId) {
        try {
          const { asaas } = await import("./client.server");
          const remote = await asaas.getSubscription(subId);
          if (remote.nextDueDate) periodEnd = new Date(remote.nextDueDate);
        } catch {
          // segue para o fallback
        }
      }
      if (!periodEnd) {
        const { data: plan } = await supabaseAdmin
          .from("billing_plans")
          .select("cycle")
          .eq("id", subscription.plan_id)
          .maybeSingle();
        periodEnd = addCycle(start, plan?.cycle ?? "MONTHLY");
      }

      patch.status = "active";
      patch.current_period_start = start.toISOString();
      patch.current_period_end = periodEnd.toISOString();
      patch.last_payment_at = start.toISOString();
      patch.cancelled_at = null;
      patch.cancelled_due_to = null;
      if (payment?.transactionReceiptUrl) patch.last_receipt_url = payment.transactionReceiptUrl;
      break;
    }

    // ─── cobrança venceu sem pagamento ───────────────────────────────────────
    // `past_due` ainda conta como pagante enquanto o Asaas tenta de novo —
    // cortar no primeiro vencimento gera mais churn que fraude evitada.
    case "PAYMENT_OVERDUE": {
      patch.status = "past_due";
      break;
    }

    case "PAYMENT_REFUNDED": {
      patch.status = "refunded";
      patch.cancelled_at = new Date().toISOString();
      patch.cancelled_due_to = "refunded";
      break;
    }

    // Chargeback: corta o acesso na hora. Reativar é decisão manual.
    case "PAYMENT_CHARGEBACK_REQUESTED": {
      patch.status = "cancelled";
      patch.cancelled_at = new Date().toISOString();
      patch.cancelled_due_to = "chargeback";
      break;
    }

    // ─── ciclo de vida do contrato ───────────────────────────────────────────
    case "SUBSCRIPTION_DELETED":
    case "SUBSCRIPTION_INACTIVATED": {
      patch.status = "cancelled";
      patch.cancelled_at = new Date().toISOString();
      patch.cancelled_due_to = event === "SUBSCRIPTION_DELETED" ? "deleted" : "inactivated";
      break;
    }

    // SUBSCRIPTION_CREATED só confirma que o contrato nasceu; quem libera o
    // acesso é o pagamento. O sub_... já entrou no patch comum acima.
    case "SUBSCRIPTION_CREATED":
    case "SUBSCRIPTION_UPDATED":
      break;

    // Evento que não tratamos: ainda assim vale gravar o que aprendemos dele
    // (customer, método, sub_...), então cai no update comum em vez de sair.
    default:
      break;
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update(patch)
      .eq("id", subscription.id);
    if (error) throw new Error(error.message);
  }

  return { subscriptionId: subscription.id, applied: Object.keys(patch).length > 0 };
}
