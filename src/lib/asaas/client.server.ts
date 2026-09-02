/**
 * Cliente REST do Asaas v3 — ÚNICO ponto do projeto que fala com a API deles.
 * Server-only: lê ASAAS_API_KEY de process.env (CLAUDE.md, regra 8).
 *
 * Importe sempre dinamicamente de dentro de um handler:
 *   const { asaas } = await import("@/lib/asaas/client.server");
 *
 * Doc: https://docs.asaas.com/
 */
import {
  AsaasError,
  type AsaasCheckout,
  type AsaasCustomer,
  type AsaasPayment,
  type AsaasSubscription,
  type AsaasWebhookConfig,
  type AsaasWebhookEvent,
} from "./types";

const SANDBOX_URL = "https://api-sandbox.asaas.com/v3";
const PRODUCTION_URL = "https://api.asaas.com/v3";
const TIMEOUT_MS = 20_000;

/**
 * Limpa corrupções conhecidas da chave. Nenhuma chave válida do Asaas começa
 * com aspas ou barra invertida, então remover isso não é ambíguo.
 *
 * Existe porque o `$` inicial já quebrou a integração DUAS vezes: no `.env`
 * local (o bun expande `$` como variável, mesmo entre aspas simples) e depois
 * na Vercel, onde o valor foi colado na forma escapada `\$aact_...` e a API
 * respondeu "A chave de API fornecida é inválida" — mensagem que não indica
 * em nada que o problema era um caractere a mais no começo.
 *
 * Avisa no log quando conserta: o objetivo é destravar, não esconder erro de
 * configuração.
 */
function normalizeKey(raw: string): string {
  let key = raw.trim();
  const consertos: string[] = [];

  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
    consertos.push("aspas em volta");
  }
  if (key.startsWith("\\")) {
    key = key.slice(1);
    consertos.push("barra invertida inicial");
  }
  // Toda chave do Asaas é `$aact_...`; sem o `$` a API devolve 401.
  if (!key.startsWith("$") && key.startsWith("aact_")) {
    key = "$" + key;
    consertos.push("`$` inicial ausente");
  }

  if (consertos.length > 0) {
    console.warn(
      `[asaas] ASAAS_API_KEY veio malformada e foi corrigida (${consertos.join(", ")}). ` +
        `Corrija o valor na hospedagem: deve ser o valor CRU, começando com "$aact_", ` +
        `sem aspas e sem escape.`,
    );
  }
  return key;
}

function apiKey(): string {
  const key = process.env["ASAAS_API_KEY"];
  if (!key) {
    throw new Error(
      "ASAAS_API_KEY ausente. Defina no .env (dev) ou nas variáveis de ambiente da hospedagem (produção).",
    );
  }
  return normalizeKey(key);
}

/**
 * A chave de sandbox do Asaas tem o prefixo `$aact_hmlg_`; a de produção não.
 *
 * ⚠️ No `.env`, a chave PRECISA estar entre aspas duplas com o `$` escapado
 * (`ASAAS_API_KEY="\$aact_..."`). Testado: o bun expande `$` como variável mesmo
 * entre aspas simples, e a chave chega vazia — falha silenciosa e confusa.
 */
export function isSandboxKey(): boolean {
  return (process.env["ASAAS_API_KEY"] ?? "").includes("_hmlg_");
}

function baseUrl(): string {
  return isSandboxKey() ? SANDBOX_URL : PRODUCTION_URL;
}

async function request<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(baseUrl() + path, {
      method,
      headers: {
        access_token: apiKey(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new AsaasError(reason, 0, path);
  } finally {
    clearTimeout(timer);
  }

  const raw = await response.text();
  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : undefined;
  } catch {
    // resposta não-JSON (proxy, 502 de gateway, HTML de erro)
  }

  if (!response.ok) {
    // O Asaas devolve erro como { errors: [{ code, description }] }
    const errors = (parsed as { errors?: Array<{ description?: string }> } | undefined)?.errors;
    const message =
      errors
        ?.map((e) => e.description)
        .filter(Boolean)
        .join("; ") || raw.slice(0, 300);
    if (response.status === 401) {
      throw new AsaasError(
        `${message || "não autorizado"} — confira ASAAS_API_KEY na hospedagem: o valor ` +
          `deve ser o CRU, começando com "$aact_", sem aspas e sem barra de escape.`,
        response.status,
        path,
      );
    }
    throw new AsaasError(message || response.statusText, response.status, path);
  }

  return parsed as T;
}

export interface CreateCheckoutInput {
  /** Em REAIS — use `reaisFromCents` na origem. */
  value: number;
  name: string;
  description: string;
  cycle: string;
  /** YYYY-MM-DD. Primeira cobrança. */
  nextDueDate: string;
  /** Nosso id: volta em `externalReference` nos webhooks. É o elo com o usuário. */
  externalReference: string;
  successUrl: string;
  cancelUrl: string;
  expiredUrl: string;
  billingTypes?: string[];
  minutesToExpire?: number;
}

export interface CreateWebhookInput {
  name: string;
  url: string;
  email: string;
  authToken: string;
  events: AsaasWebhookEvent[];
}

export const asaas = {
  // ─── Conta ─────────────────────────────────────────────────────────────────
  myAccount: () =>
    request<{ email: string; personType: string; cpfCnpj: string }>("GET", "/myAccount"),

  accountStatus: () =>
    request<{
      commercialInfo: string;
      bankAccountInfo: string;
      documentation: string;
      general: string;
    }>("GET", "/myAccount/status"),

  // ─── Checkout hospedado ────────────────────────────────────────────────────
  /**
   * Cria a sessão de checkout hospedada. O cliente digita o cartão no domínio do
   * Asaas — nada de dado sensível passa pelo nosso servidor (fora do escopo PCI).
   *
   * Não pré-criamos cliente: a própria página coleta nome/CPF/e-mail. Um passo a
   * menos no nosso funil e um dado sensível a menos sob nossa guarda.
   *
   * `endDate` fica de fora de propósito — assinatura sem prazo, confirmado no
   * sandbox que a API aceita.
   */
  createCheckout: (input: CreateCheckoutInput) =>
    request<AsaasCheckout>("POST", "/checkouts", {
      billingTypes: input.billingTypes ?? ["CREDIT_CARD"],
      chargeTypes: ["RECURRENT"],
      minutesToExpire: input.minutesToExpire ?? 60,
      externalReference: input.externalReference,
      callback: {
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        expiredUrl: input.expiredUrl,
      },
      items: [
        {
          name: input.name,
          description: input.description,
          quantity: 1,
          value: input.value,
        },
      ],
      subscription: {
        cycle: input.cycle,
        nextDueDate: input.nextDueDate,
      },
    }),

  getCheckout: (checkoutId: string) => request<AsaasCheckout>("GET", `/checkouts/${checkoutId}`),

  // ─── Assinaturas ───────────────────────────────────────────────────────────
  getSubscription: (subscriptionId: string) =>
    request<AsaasSubscription>("GET", `/subscriptions/${subscriptionId}`),

  /** Página de assinaturas, da mais recente para a mais antiga. */
  listSubscriptions: (limit = 100, offset = 0) =>
    request<{ data: AsaasSubscription[]; hasMore: boolean }>(
      "GET",
      `/subscriptions?limit=${limit}&offset=${offset}`,
    ),

  /** Remove a assinatura: nenhuma cobrança futura é gerada. */
  cancelSubscription: (subscriptionId: string) =>
    request<{ deleted: boolean; id: string }>("DELETE", `/subscriptions/${subscriptionId}`),

  // ─── Cobranças ─────────────────────────────────────────────────────────────
  getPayment: (paymentId: string) => request<AsaasPayment>("GET", `/payments/${paymentId}`),

  /** Cobranças de uma assinatura, da mais recente para a mais antiga. */
  listPaymentsBySubscription: (subscriptionId: string, limit = 100) =>
    request<{ data: AsaasPayment[]; hasMore: boolean }>(
      "GET",
      `/payments?subscription=${encodeURIComponent(subscriptionId)}&limit=${limit}`,
    ),

  // ─── Clientes ──────────────────────────────────────────────────────────────
  getCustomer: (customerId: string) => request<AsaasCustomer>("GET", `/customers/${customerId}`),

  // ─── Webhooks ──────────────────────────────────────────────────────────────
  listWebhooks: () =>
    request<{ data: AsaasWebhookConfig[] }>("GET", "/webhooks").then((r) => r.data ?? []),

  createWebhook: (input: CreateWebhookInput) =>
    request<AsaasWebhookConfig>("POST", "/webhooks", {
      name: input.name,
      url: input.url,
      email: input.email,
      enabled: true,
      interrupted: false,
      authToken: input.authToken,
      // SEQUENTIALLY: o Asaas segura a fila se falharmos, em vez de despejar
      // eventos fora de ordem. Combina com o handler idempotente.
      sendType: "SEQUENTIALLY",
      events: input.events,
    }),

  deleteWebhook: (webhookId: string) =>
    request<{ deleted: boolean; id: string }>("DELETE", `/webhooks/${webhookId}`),
};
