/**
 * Tipos da API Asaas v3 — só o subconjunto que o RUMVIA usa.
 * Arquivo sem side effects e sem segredo: pode ser importado do client.
 *
 * Doc: https://docs.asaas.com/
 *
 * ⚠️ DIFERENÇA QUE MORDE: o Asaas trabalha em REAIS (24.90), não em centavos.
 * O banco guarda `price_cents` (2490). A conversão vive em um lugar só —
 * `reaisFromCents` / `centsFromReais` neste arquivo. Nunca dividir por 100 solto.
 */

/** Ciclos de assinatura aceitos pelo Asaas. */
export type AsaasCycle =
  "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "BIMONTHLY" | "QUARTERLY" | "SEMIANNUALLY" | "YEARLY";

export type AsaasBillingType = "CREDIT_CARD" | "PIX" | "BOLETO";

/** Só `RECURRENT` interessa ao RUMVIA; `DETACHED` é cobrança avulsa. */
export type AsaasChargeType = "DETACHED" | "RECURRENT" | "INSTALLMENT";

export type AsaasCheckoutStatus = "ACTIVE" | "EXPIRED" | "CANCELLED" | "PAID";

// ─── Conversão de moeda ──────────────────────────────────────────────────────

/** 2490 (centavos, como no banco) → 24.9 (reais, como o Asaas quer). */
export function reaisFromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/** 24.9 (reais, como o Asaas devolve) → 2490 (centavos, como o banco guarda). */
export function centsFromReais(reais: number): number {
  return Math.round(reais * 100);
}

// ─── Recursos ────────────────────────────────────────────────────────────────

export interface AsaasCustomer {
  id: string; // cus_...
  name?: string | null;
  email?: string | null;
  cpfCnpj?: string | null;
  mobilePhone?: string | null;
  externalReference?: string | null;
}

/** Resposta de POST /checkouts — a sessão de pagamento hospedada. */
export interface AsaasCheckout {
  id: string; // uuid
  /** URL hospedada para onde o cliente é redirecionado. */
  link: string;
  status: AsaasCheckoutStatus | string;
  externalReference: string | null;
  billingTypes: string[];
  chargeTypes: string[];
  minutesToExpire?: number;
  items: Array<{ name?: string; description?: string; quantity: number; value: number }>;
  subscription: {
    cycle: string;
    nextDueDate: string;
    /** `null` = assinatura sem prazo. Confirmado no sandbox: é aceito. */
    endDate: string | null;
  } | null;
  customer: string | null;
  callback?: { successUrl?: string; cancelUrl?: string; expiredUrl?: string } | null;
}

/** Assinatura de verdade (sub_...), criada depois que o checkout é pago. */
export interface AsaasSubscription {
  id: string; // sub_...
  customer: string; // cus_...
  value: number; // REAIS
  cycle: string;
  status: string; // ACTIVE | EXPIRED | INACTIVE
  billingType: string;
  nextDueDate: string | null;
  externalReference: string | null;
  /**
   * uuid da sessão de checkout que originou esta assinatura — igual ao `id` que
   * POST /checkouts devolveu e que guardamos em `provider_checkout_id`.
   *
   * ⚠️ É O ÚNICO elo que sobrevive ao checkout hospedado: o `externalReference`
   * que mandamos no corpo do /checkouts NÃO desce para a assinatura nem para as
   * cobranças (verificado em 2026-09-01 com payload real — vinha `null` nos dois).
   */
  checkoutSession?: string | null;
  dateCreated?: string;
  deleted?: boolean;
}

/** Cobrança individual gerada pela assinatura. */
export interface AsaasPayment {
  id: string; // pay_...
  customer: string; // cus_...
  /** sub_... quando a cobrança nasceu de uma assinatura. */
  subscription?: string | null;
  value: number; // REAIS
  netValue?: number;
  status: string; // PENDING | CONFIRMED | RECEIVED | OVERDUE | REFUNDED | ...
  billingType: string;
  dueDate: string;
  externalReference?: string | null;
  /** Ver `AsaasSubscription.checkoutSession` — mesmo elo, e o que de fato chega. */
  checkoutSession?: string | null;
  invoiceUrl?: string | null;
  transactionReceiptUrl?: string | null;
  confirmedDate?: string | null;
  paymentDate?: string | null;
  clientPaymentDate?: string | null;
}

export interface AsaasWebhookConfig {
  id?: string;
  name: string;
  url: string;
  email: string;
  enabled: boolean;
  interrupted?: boolean;
  authToken?: string;
  sendType?: "SEQUENTIALLY" | "NON_SEQUENTIALLY";
  events: string[];
}

// ─── Webhook ─────────────────────────────────────────────────────────────────

/**
 * Eventos que o RUMVIA escuta.
 *
 * A distinção que muda o desenho: `SUBSCRIPTION_*` cobre só o ciclo de vida do
 * contrato. Quem diz que ENTROU DINHEIRO é `PAYMENT_*`, correlacionado pelo
 * campo `subscription` da cobrança.
 */
export type AsaasWebhookEvent =
  // dinheiro
  | "PAYMENT_CONFIRMED"
  | "PAYMENT_RECEIVED"
  | "PAYMENT_OVERDUE"
  | "PAYMENT_REFUNDED"
  | "PAYMENT_CHARGEBACK_REQUESTED"
  | "PAYMENT_DELETED"
  // ciclo de vida do contrato
  | "SUBSCRIPTION_CREATED"
  | "SUBSCRIPTION_UPDATED"
  | "SUBSCRIPTION_INACTIVATED"
  | "SUBSCRIPTION_DELETED";

/**
 * Payload de webhook. Propositalmente FROUXO — o Asaas adiciona campos sem
 * aviso, e validar com schema rígido quebraria a integração no dia em que
 * mudarem algo irrelevante.
 */
export interface AsaasWebhookPayload {
  /** evt_... — chave de idempotência. */
  id: string;
  event: string;
  dateCreated?: string;
  payment?: Partial<AsaasPayment> & { id?: string };
  subscription?: Partial<AsaasSubscription> & { id?: string };
  [key: string]: unknown;
}

/** Erro de chamada à API Asaas, com o status HTTP preservado. */
export class AsaasError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(`Asaas ${path} (${status}): ${message}`);
    this.name = "AsaasError";
  }
}
