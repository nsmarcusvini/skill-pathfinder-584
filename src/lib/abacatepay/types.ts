/**
 * Tipos da API AbacatePay v2 — só o subconjunto que o RUMVIA usa.
 * Arquivo sem side effects e sem segredo: pode ser importado do client.
 *
 * Referência: https://docs.abacatepay.com/llms.txt
 * Todo valor monetário é em CENTAVOS. Toda resposta vem no envelope
 * `{ data, success, error }`.
 */

export type AbacateCycle = "WEEKLY" | "MONTHLY" | "QUARTERLY" | "SEMIANNUALLY" | "ANNUALLY";
export type AbacateMethod = "PIX" | "CARD";

/** Status de checkout/assinatura devolvidos pela AbacatePay. */
export type AbacateBillStatus = "PENDING" | "EXPIRED" | "CANCELLED" | "PAID" | "REFUNDED";
export type AbacateSubscriptionStatus = "ACTIVE" | "CANCELLED" | "PAUSED";

export interface AbacateEnvelope<T> {
  data: T | null;
  success: boolean;
  error: string | null;
}

export interface AbacateProduct {
  id: string; // prod_...
  externalId: string;
  name: string;
  price: number;
  currency: string;
  cycle: AbacateCycle | null;
  trialDays?: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface AbacateCustomer {
  id: string; // cust_...
  name?: string | null;
  email?: string | null;
  cellphone?: string | null;
  taxId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Resposta de POST /subscriptions/create — é um CHECKOUT, não a assinatura. */
export interface AbacateSubscriptionCheckout {
  id: string; // bill_...
  externalId: string | null;
  url: string;
  amount: number;
  paidAmount: number | null;
  items: Array<{ id: string; quantity: number }>;
  status: AbacateBillStatus;
  devMode?: boolean;
  customerId: string | null;
  returnUrl: string | null;
  completionUrl: string | null;
  receiptUrl: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Objeto de assinatura ativa (subs_...), devolvido por list/cancel. */
export interface AbacateSubscription {
  id: string; // subs_...
  customerId: string | null;
  amount: number;
  currency?: string;
  status: AbacateSubscriptionStatus | string;
  method: AbacateMethod | string;
  frequency?: AbacateCycle;
  devMode?: boolean;
  trialDays?: number | null;
  trialEndsAt?: string | null;
  retryPolicy?: { maxRetry: number; retryEvery: number };
  canceledAt?: string | null;
  cancelPolicy?: string | null;
  cancelledDueTo?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AbacateWebhook {
  id: string; // webh_...
  name: string;
  endpoint: string;
  events: string[];
  devMode: boolean;
  v2: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Webhook (envelope v2) ───────────────────────────────────────────────────

export type AbacateWebhookEvent =
  | "checkout.completed"
  | "checkout.refunded"
  | "checkout.disputed"
  | "checkout.lost"
  | "transparent.completed"
  | "transparent.refunded"
  | "transparent.disputed"
  | "transparent.lost"
  | "subscription.completed"
  | "subscription.cancelled"
  | "subscription.renewed"
  | "subscription.trial_started"
  | "payout.completed"
  | "payout.failed"
  | "transfer.completed"
  | "transfer.failed";

/**
 * Payload comum de todo webhook v2. Propositalmente FROUXO: a doc pede para
 * não validar com schema rígido, porque campos novos aparecem sem aviso.
 */
export interface AbacateWebhookPayload {
  id: string; // log_...
  event: string;
  apiVersion?: number;
  devMode?: boolean;
  data?: {
    subscription?: Partial<AbacateSubscription> & { id?: string };
    customer?: Partial<AbacateCustomer> & { id?: string };
    payment?: {
      id?: string;
      externalId?: string | null;
      amount?: number;
      paidAmount?: number | null;
      status?: string;
      methods?: string[];
      receiptUrl?: string | null;
      createdAt?: string;
      updatedAt?: string;
    };
    payerInformation?: { method?: string } & Record<string, unknown>;
    checkout?: {
      id?: string;
      externalId?: string | null;
      url?: string;
      amount?: number;
      paidAmount?: number | null;
      frequency?: string;
      items?: Array<{ id: string; quantity: number }>;
      status?: string;
      methods?: string[];
      customerId?: string | null;
      receiptUrl?: string | null;
      createdAt?: string;
      updatedAt?: string;
    };
    installmentId?: string;
    installmentNumber?: number;
    retryNumber?: number;
  } & Record<string, unknown>;
}

/** Erro de chamada à API AbacatePay, com o status HTTP preservado. */
export class AbacatePayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(`AbacatePay ${path} (${status}): ${message}`);
    this.name = "AbacatePayError";
  }
}
