/**
 * Cliente REST da AbacatePay v2 — ÚNICO ponto do projeto que fala com
 * api.abacatepay.com. Server-only: lê ABACATE_PAY_API_KEY de process.env
 * (CLAUDE.md, regra 8 — segredo nunca sai do servidor, nunca leva prefixo VITE_).
 *
 * Importe sempre dinamicamente de dentro de um handler:
 *   const { abacate } = await import("@/lib/abacatepay/client.server");
 *
 * Doc: https://docs.abacatepay.com/llms.txt
 */
import {
  AbacatePayError,
  type AbacateCustomer,
  type AbacateCycle,
  type AbacateEnvelope,
  type AbacateMethod,
  type AbacateProduct,
  type AbacateSubscription,
  type AbacateSubscriptionCheckout,
  type AbacateWebhook,
  type AbacateWebhookEvent,
} from "./types";

const BASE_URL = "https://api.abacatepay.com/v2";
const TIMEOUT_MS = 20_000;

function apiKey(): string {
  const key = process.env["ABACATE_PAY_API_KEY"];
  if (!key) {
    throw new Error(
      "ABACATE_PAY_API_KEY ausente. Defina no .env (dev) ou nas variáveis de ambiente da hospedagem (produção).",
    );
  }
  return key;
}

/** A chave de sandbox da AbacatePay é prefixada com `abc_dev_`. */
export function isDevModeKey(): boolean {
  return (process.env["ABACATE_PAY_API_KEY"] ?? "").startsWith("abc_dev_");
}

async function request<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  query?: Record<string, string | undefined>,
  // /webhooks/delete devolve {success:true,error:null} sem `data` nenhum —
  // diferente de todo o resto da API, que sempre embrulha em `data`.
  options?: { allowEmptyData?: boolean },
): Promise<T> {
  const url = new URL(BASE_URL + path);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, v);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      // exactOptionalPropertyTypes: `body: undefined` não compila em RequestInit.
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new AbacatePayError(reason, 0, path);
  } finally {
    clearTimeout(timer);
  }

  const raw = await response.text();
  let envelope: AbacateEnvelope<T> | undefined;
  try {
    envelope = raw ? (JSON.parse(raw) as AbacateEnvelope<T>) : undefined;
  } catch {
    // resposta não-JSON (proxy, 502 de gateway, HTML de erro)
  }

  if (!response.ok || envelope?.success === false || envelope?.error) {
    const message = envelope?.error ?? raw.slice(0, 300) ?? response.statusText;
    throw new AbacatePayError(message, response.status, path);
  }

  if (options?.allowEmptyData) {
    return envelope?.data as T;
  }

  if (!envelope || envelope.data === null || envelope.data === undefined) {
    throw new AbacatePayError("resposta sem campo `data`", response.status, path);
  }

  return envelope.data;
}

// `| undefined` explícito em todo opcional: o tsconfig liga
// exactOptionalPropertyTypes, então `{ description: undefined }` só compila assim.
export interface CreateProductInput {
  externalId: string;
  name: string;
  /** Em centavos. */
  price: number;
  description?: string | undefined;
  cycle?: AbacateCycle | undefined;
  trialDays?: number | undefined;
}

export interface CreateCustomerInput {
  email: string;
  name?: string | undefined;
  cellphone?: string | undefined;
  taxId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface CreateSubscriptionInput {
  /** prod_... — produto com `cycle` definido. Exatamente um. */
  productId: string;
  customerId?: string | undefined;
  /** Nosso id: volta em data.checkout.externalId nos webhooks. */
  externalId: string;
  completionUrl: string;
  returnUrl: string;
  methods?: AbacateMethod[] | undefined;
  metadata?: Record<string, unknown> | undefined;
  retryPolicy?: { maxRetry: number; retryEvery: number } | undefined;
}

export interface CreateWebhookInput {
  name: string;
  endpoint: string;
  secret: string;
  events: AbacateWebhookEvent[];
}

export const abacate = {
  // ─── Produtos ──────────────────────────────────────────────────────────────
  createProduct: (input: CreateProductInput) =>
    request<AbacateProduct>("POST", "/products/create", { ...input, currency: "BRL" }),

  listProducts: () => request<AbacateProduct[]>("GET", "/products/list"),

  // ─── Clientes ──────────────────────────────────────────────────────────────
  /** Idempotente por CPF/CNPJ: taxId repetido devolve o cliente existente. */
  createCustomer: (input: CreateCustomerInput) =>
    request<AbacateCustomer>("POST", "/customers/create", input),

  // ─── Assinaturas ───────────────────────────────────────────────────────────
  /**
   * Cria o CHECKOUT de assinatura. A assinatura (subs_...) só passa a existir
   * depois que o cliente paga — ouça `subscription.completed` no webhook.
   */
  createSubscription: ({ productId, ...rest }: CreateSubscriptionInput) =>
    request<AbacateSubscriptionCheckout>("POST", "/subscriptions/create", {
      items: [{ id: productId, quantity: 1 }],
      ...rest,
    }),

  /** Cancelamento é imediato e irreversível — sem período de carência. */
  cancelSubscription: (subscriptionId: string) =>
    request<AbacateSubscription>("POST", "/subscriptions/cancel", { id: subscriptionId }),

  listSubscriptions: () => request<AbacateSubscription[]>("GET", "/subscriptions/list"),

  // ─── Webhooks ──────────────────────────────────────────────────────────────
  createWebhook: (input: CreateWebhookInput) =>
    request<AbacateWebhook>("POST", "/webhooks/create", input),

  listWebhooks: () => request<AbacateWebhook[]>("GET", "/webhooks/list"),

  // A doc da AbacatePay diz que `id` vai no corpo — errado, testado na prática:
  // a API só aceita `id` como query string, e a resposta não tem `data`.
  deleteWebhook: (webhookId: string) =>
    request<void>(
      "POST",
      "/webhooks/delete",
      undefined,
      { id: webhookId },
      { allowEmptyData: true },
    ),
};
