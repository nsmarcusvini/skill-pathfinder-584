/**
 * Processamento dos webhooks da AbacatePay. Server-only.
 *
 * Duas camadas de autenticação, como a doc manda usar as duas juntas:
 *   1. `?webhookSecret=` na query string  → comparado com ABACATE_PAY_WEBHOOK_SECRET
 *   2. header `X-Webhook-Signature`       → HMAC-SHA256(base64) do corpo cru,
 *      assinado com a chave pública da AbacatePay
 *
 * Idempotência é obrigatória: a AbacatePay reentrega em qualquer resposta que
 * não seja 200. `billing_events.event_id` é UNIQUE — reentrega cai no conflito
 * e devolve 200 sem reprocessar.
 *
 * Doc: https://docs.abacatepay.com/pages/webhooks/security
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import type { Database, Json } from "@/integrations/supabase/types";
import type { AbacateWebhookPayload } from "./types";

type SubscriptionUpdate = Database["public"]["Tables"]["subscriptions"]["Update"];

/**
 * Chave PÚBLICA da AbacatePay usada para assinar todos os payloads. É a mesma
 * para todas as lojas e está publicada na doc — não é segredo, não vai no .env.
 */
const ABACATEPAY_PUBLIC_KEY =
  "t9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9";

function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function verifySignature(rawBody: string, signatureFromHeader: string): boolean {
  const expected = createHmac("sha256", ABACATEPAY_PUBLIC_KEY)
    .update(Buffer.from(rawBody, "utf8"))
    .digest("base64");
  return safeEquals(expected, signatureFromHeader);
}

/** Soma um ciclo de cobrança a uma data. Base do current_period_end. */
export function addCycle(from: Date, cycle: string): Date {
  const next = new Date(from.getTime());
  switch (cycle) {
    case "WEEKLY":
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case "QUARTERLY":
      next.setUTCMonth(next.getUTCMonth() + 3);
      break;
    case "SEMIANNUALLY":
      next.setUTCMonth(next.getUTCMonth() + 6);
      break;
    case "ANNUALLY":
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

/**
 * Valida, registra e aplica um webhook. Devolve o status HTTP a responder.
 * Só devolve != 200 quando a AbacatePay DEVE reentregar (falha nossa) ou quando
 * a requisição não é autêntica.
 */
export async function handleAbacateWebhook(args: {
  rawBody: string;
  signature: string | null;
  secretFromQuery: string | null;
}): Promise<WebhookResult> {
  const expectedSecret = process.env["ABACATE_PAY_WEBHOOK_SECRET"];
  if (!expectedSecret) {
    console.error("[abacatepay] ABACATE_PAY_WEBHOOK_SECRET não configurado");
    return { status: 500, body: { error: "webhook não configurado" } };
  }
  if (!args.secretFromQuery || !safeEquals(args.secretFromQuery, expectedSecret)) {
    return { status: 401, body: { error: "webhookSecret inválido" } };
  }
  if (!args.signature || !verifySignature(args.rawBody, args.signature)) {
    return { status: 401, body: { error: "assinatura HMAC inválida" } };
  }

  let payload: AbacateWebhookPayload;
  try {
    payload = JSON.parse(args.rawBody) as AbacateWebhookPayload;
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
    dev_mode: payload.devMode ?? false,
    payload: payload as unknown as Json,
  });
  if (insertError) {
    if (insertError.code === "23505") {
      return { status: 200, body: { ok: true, duplicate: true } };
    }
    console.error("[abacatepay] falha ao registrar evento", insertError.message);
    return { status: 500, body: { error: "falha ao registrar evento" } };
  }

  try {
    const subscriptionId = await applyEvent(payload);
    await supabaseAdmin
      .from("billing_events")
      .update({ handled: true, subscription_id: subscriptionId })
      .eq("event_id", payload.id);
    return { status: 200, body: { ok: true } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[abacatepay] erro ao aplicar ${payload.event}:`, message);
    await supabaseAdmin
      .from("billing_events")
      .update({ handled: false, handle_error: message })
      .eq("event_id", payload.id);
    // 500 → a AbacatePay reentrega; o insert acima já foi feito, então a
    // reentrega cai no caminho `duplicate`. Reprocessar manualmente pelo log.
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

/** Localiza a assinatura local a partir do payload, do elo mais forte ao mais fraco. */
async function findSubscription(payload: AbacateWebhookPayload): Promise<SubscriptionRow | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const select = "id, user_id, status, current_period_end, plan_id";

  const candidates: Array<[column: string, value: string]> = [];
  const externalId = payload.data?.checkout?.externalId ?? payload.data?.payment?.externalId;
  if (externalId) candidates.push(["external_id", externalId]);
  const subsId = payload.data?.subscription?.id;
  if (subsId) candidates.push(["abacate_subscription_id", subsId]);
  const billId = payload.data?.checkout?.id;
  if (billId) candidates.push(["abacate_bill_id", billId]);

  for (const [column, value] of candidates) {
    const { data } = await supabaseAdmin
      .from("subscriptions")
      .select(select)
      .eq(column, value)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data as SubscriptionRow;
  }

  // Último recurso: cliente com uma assinatura viva. Só serve para renovações,
  // onde a AbacatePay não repete o externalId do checkout original.
  const customerId = payload.data?.customer?.id;
  if (customerId) {
    const { data } = await supabaseAdmin
      .from("subscriptions")
      .select(select)
      .eq("abacate_customer_id", customerId)
      .in("status", ["pending", "active", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data as SubscriptionRow;
  }

  return null;
}

/** Aplica o efeito do evento. Devolve o id da assinatura local afetada. */
async function applyEvent(payload: AbacateWebhookPayload): Promise<string | null> {
  const event = payload.event;

  // Eventos que não têm nada a ver com assinatura (payout, transfer) são
  // registrados e ignorados de propósito.
  if (!event.startsWith("subscription.") && !event.startsWith("checkout.")) return null;

  const subscription = await findSubscription(payload);
  if (!subscription) {
    console.warn(`[abacatepay] ${event} sem assinatura local correspondente (${payload.id})`);
    return null;
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const remote = payload.data?.subscription;
  const payment = payload.data?.payment;

  const patch: SubscriptionUpdate = {};
  if (remote?.id) patch.abacate_subscription_id = remote.id;
  if (remote?.method) patch.method = remote.method;
  if (payload.devMode !== undefined) patch.dev_mode = payload.devMode;
  if (payload.data?.customer?.id) patch.abacate_customer_id = payload.data.customer.id;
  if (remote?.trialEndsAt) patch.trial_ends_at = remote.trialEndsAt;

  switch (event) {
    case "subscription.completed":
    case "subscription.renewed":
    case "subscription.trial_started": {
      const paidAt = payment?.updatedAt ?? remote?.updatedAt ?? new Date().toISOString();
      const { data: plan } = await supabaseAdmin
        .from("billing_plans")
        .select("cycle")
        .eq("id", subscription.plan_id)
        .maybeSingle();
      const cycle = remote?.frequency ?? plan?.cycle ?? "MONTHLY";
      const start = new Date(paidAt);

      patch.status = "active";
      patch.current_period_start = start.toISOString();
      patch.current_period_end = (
        remote?.trialEndsAt ? new Date(remote.trialEndsAt) : addCycle(start, cycle)
      ).toISOString();
      patch.cancelled_at = null;
      patch.cancelled_due_to = null;
      if (event !== "subscription.trial_started") {
        patch.last_payment_at = paidAt;
        if (payment?.receiptUrl) patch.last_receipt_url = payment.receiptUrl;
      }
      break;
    }

    case "subscription.cancelled": {
      patch.status = "cancelled";
      patch.cancelled_at = remote?.canceledAt ?? new Date().toISOString();
      patch.cancelled_due_to = remote?.cancelledDueTo ?? "cancelled_by_request";
      break;
    }

    case "checkout.refunded":
    case "transparent.refunded": {
      patch.status = "refunded";
      patch.cancelled_at = new Date().toISOString();
      patch.cancelled_due_to = "refunded";
      break;
    }

    case "checkout.disputed":
    case "checkout.lost": {
      // Chargeback: corta o acesso na hora. Reativar é decisão manual.
      patch.status = "cancelled";
      patch.cancelled_at = new Date().toISOString();
      patch.cancelled_due_to = event === "checkout.lost" ? "dispute_lost" : "disputed";
      break;
    }

    case "checkout.completed": {
      // Uma assinatura normalmente chega por subscription.completed. Se vier
      // por aqui, não deixa a linha presa em `pending`.
      if (subscription.status === "pending") patch.status = "active";
      break;
    }

    default:
      return subscription.id;
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update(patch)
      .eq("id", subscription.id);
    if (error) throw new Error(error.message);
  }

  return subscription.id;
}
