/**
 * Assinatura RUMVIA Pro via Asaas.
 *
 * FONTE ÚNICA do estado de pagamento: a tabela `subscriptions`, escrita só pelo
 * webhook e por estas server functions (service_role). Nenhuma tela decide se
 * alguém é pagante — todas perguntam para `getBillingOverview` / `useSubscription`.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const PLAN_KEY = "pro_mensal";

export type SubscriptionStatus =
  "pending" | "active" | "past_due" | "cancelled" | "refunded" | "expired";

export interface BillingPlan {
  key: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  cycle: string;
  trialDays: number | null;
  methods: string[];
  /**
   * O gateway está pronto para abrir checkout. No Asaas é sempre true (não há
   * catálogo a pré-criar — o preço vai direto no checkout). A flag continua na
   * interface porque gateways com catálogo (Stripe, AbacatePay) precisam dela.
   */
  ready: boolean;
}

export interface MySubscription {
  status: SubscriptionStatus;
  amountCents: number;
  method: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  lastPaymentAt: string | null;
  lastReceiptUrl: string | null;
  cancelledAt: string | null;
  cancelledDueTo: string | null;
  /** Só preenchido enquanto status = pending: leva o usuário de volta ao pagamento. */
  checkoutUrl: string | null;
  devMode: boolean;
  createdAt: string;
}

export interface BillingOverview {
  plan: BillingPlan | null;
  subscription: MySubscription | null;
  /** "Essa pessoa PAGA?" — assinatura ativa (ou em retentativa). */
  isPro: boolean;
  isAdmin: boolean;
  /**
   * "Essa pessoa PODE ENTRAR?" — a pergunta que os guards fazem. Espelha
   * `public.can_access_paid_features`: pagante OU admin.
   */
  canAccess: boolean;
}

const LIVE_STATUSES: string[] = ["pending", "active", "past_due"];

/** Base pública do app, para completionUrl/returnUrl do checkout. */
function appBaseUrl(): string {
  const fromEnv = process.env["APP_BASE_URL"];
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  const request = getRequest();
  if (request?.url) return new URL(request.url).origin;
  throw new Error("APP_BASE_URL não configurado e origem da requisição indisponível.");
}

function isAnonymous(claims: Record<string, unknown>): boolean {
  return claims["is_anonymous"] === true || claims["is_anonymous"] === "true";
}

// ─── Leitura ─────────────────────────────────────────────────────────────────

export const getBillingOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Record<string, never>) => input)
  .handler(async ({ context }): Promise<BillingOverview> => {
    const db = context.supabase;

    const { data: profileRow } = await db
      .from("profiles")
      .select("is_admin")
      .eq("id", context.userId)
      .maybeSingle();

    const { data: planRow, error: planError } = await db
      .from("billing_plans")
      .select("key, name, description, price_cents, currency, cycle, trial_days, methods")
      .eq("key", PLAN_KEY)
      .eq("is_active", true)
      .maybeSingle();
    if (planError) throw new Error(planError.message);

    // RLS já limita a linha ao próprio usuário.
    const { data: subRow, error: subError } = await db
      .from("subscriptions")
      .select(
        "status, amount_cents, method, current_period_end, trial_ends_at, last_payment_at, last_receipt_url, cancelled_at, cancelled_due_to, checkout_url, dev_mode, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subError) throw new Error(subError.message);

    const subscription: MySubscription | null = subRow
      ? {
          status: subRow.status as SubscriptionStatus,
          amountCents: subRow.amount_cents,
          method: subRow.method ?? null,
          currentPeriodEnd: subRow.current_period_end ?? null,
          trialEndsAt: subRow.trial_ends_at ?? null,
          lastPaymentAt: subRow.last_payment_at ?? null,
          lastReceiptUrl: subRow.last_receipt_url ?? null,
          cancelledAt: subRow.cancelled_at ?? null,
          cancelledDueTo: subRow.cancelled_due_to ?? null,
          checkoutUrl: subRow.status === "pending" ? (subRow.checkout_url ?? null) : null,
          devMode: subRow.dev_mode,
          createdAt: subRow.created_at,
        }
      : null;

    const isPro =
      subscription !== null &&
      (subscription.status === "active" || subscription.status === "past_due") &&
      (subscription.currentPeriodEnd === null ||
        new Date(subscription.currentPeriodEnd).getTime() > Date.now());

    const isAdmin = profileRow?.is_admin === true;

    return {
      plan: planRow
        ? {
            key: planRow.key,
            name: planRow.name,
            description: planRow.description ?? null,
            priceCents: planRow.price_cents,
            currency: planRow.currency,
            cycle: planRow.cycle,
            trialDays: planRow.trial_days ?? null,
            methods: planRow.methods ?? ["CARD"],
            ready: true,
          }
        : null,
      subscription,
      isPro,
      isAdmin,
      canAccess: isPro || isAdmin,
    };
  });

// ─── Plano público (landing) ─────────────────────────────────────────────────

export interface PublicPlan {
  name: string;
  priceCents: number;
  currency: string;
  cycle: string;
  trialDays: number | null;
}

/**
 * Preço para a landing, sem login. Devolve só campos públicos — nada de
 * campos internos. A landing NUNCA escreve preço no JSX (regra 1): o número
 * vem de billing_plans, mesma fonte que o checkout cobra.
 */
export const getPublicPlan = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicPlan | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("billing_plans")
      .select("name, price_cents, currency, cycle, trial_days")
      .eq("key", PLAN_KEY)
      .eq("is_active", true)
      .maybeSingle();
    if (!data) return null;
    return {
      name: data.name,
      priceCents: data.price_cents,
      currency: data.currency,
      cycle: data.cycle,
      trialDays: data.trial_days ?? null,
    };
  },
);

// ─── Checkout ────────────────────────────────────────────────────────────────

export const startSubscriptionCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Record<string, never>) => input)
  .handler(async ({ context }): Promise<{ url: string; reused: boolean }> => {
    // Sessão anônima não paga: a assinatura precisa sobreviver ao dispositivo.
    if (isAnonymous(context.claims as Record<string, unknown>)) {
      throw new Error("Crie uma conta permanente antes de assinar.");
    }

    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: plan, error: planError } = await supabaseAdmin
      .from("billing_plans")
      .select("id, key, name, description, price_cents, cycle, methods")
      .eq("key", PLAN_KEY)
      .eq("is_active", true)
      .maybeSingle();
    if (planError) throw new Error(planError.message);
    if (!plan) throw new Error(`Plano "${PLAN_KEY}" não encontrado ou inativo.`);

    // Uma assinatura viva por usuário (índice único parcial garante isso).
    const { data: existing } = await supabaseAdmin
      .from("subscriptions")
      .select("id, status, checkout_url, provider_customer_id")
      .eq("user_id", userId)
      .in("status", LIVE_STATUSES)
      .maybeSingle();

    if (existing && (existing.status === "active" || existing.status === "past_due")) {
      throw new Error("Você já tem uma assinatura ativa.");
    }
    if (existing?.status === "pending" && existing.checkout_url) {
      // Checkout ainda aberto: devolve o mesmo link em vez de criar outro.
      return { url: existing.checkout_url, reused: true };
    }

    const base = appBaseUrl();
    const externalId = `rumvia_${userId}_${Date.now().toString(36)}`;

    const { asaas, isSandboxKey } = await import("@/lib/asaas/client.server");
    const { reaisFromCents } = await import("@/lib/asaas/types");

    // Não pré-criamos cliente no Asaas: a página hospedada coleta nome, e-mail e
    // CPF sozinha. Um passo a menos no funil e um dado sensível a menos sob nossa
    // guarda — o RUMVIA nunca precisa pedir CPF.
    // Data de Brasília, não UTC. O Asaas opera em horário de Brasília: mandar
    // `toISOString()` faz toda compra entre 21h e meia-noite chegar lá com a
    // data do dia seguinte, e o gateway AGENDA a primeira cobrança em vez de
    // cobrar na hora. O cliente paga e fica sem acesso até o lote do dia
    // seguinte rodar — só `PAYMENT_CONFIRMED` libera (webhook.server.ts).
    // `en-CA` é o locale que formata como YYYY-MM-DD, que é o que a API espera.
    const hoje = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date());

    const checkout = await asaas.createCheckout({
      value: reaisFromCents(plan.price_cents),
      name: plan.name,
      description: plan.description ?? plan.name,
      cycle: plan.cycle,
      nextDueDate: hoje,
      externalReference: externalId,
      successUrl: `${base}/assinatura?status=sucesso`,
      cancelUrl: `${base}/assinatura`,
      expiredUrl: `${base}/assinatura`,
      billingTypes: plan.methods.map((m) => (m === "CARD" ? "CREDIT_CARD" : m)),
    });

    const row = {
      user_id: userId,
      plan_id: plan.id,
      provider: "asaas",
      status: "pending" as const,
      external_id: externalId,
      provider_checkout_id: checkout.id,
      checkout_url: checkout.link,
      amount_cents: plan.price_cents,
      currency: "BRL",
      dev_mode: isSandboxKey(),
      metadata: { plan_key: plan.key },
    };

    const { error: writeError } = existing
      ? await supabaseAdmin.from("subscriptions").update(row).eq("id", existing.id)
      : await supabaseAdmin.from("subscriptions").insert(row);
    if (writeError) throw new Error(writeError.message);

    return { url: checkout.link, reused: false };
  });

// ─── Cancelamento ────────────────────────────────────────────────────────────

export const cancelMySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Record<string, never>) => input)
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("id, status, provider_subscription_id")
      .eq("user_id", userId)
      .in("status", LIVE_STATUSES)
      .maybeSingle();
    if (!sub) throw new Error("Nenhuma assinatura ativa para cancelar.");

    if (sub.provider_subscription_id) {
      const { asaas } = await import("@/lib/asaas/client.server");
      // Remove a assinatura no Asaas: nenhuma cobrança futura é gerada.
      await asaas.cancelSubscription(sub.provider_subscription_id);
    }

    // Grava já, sem esperar o webhook subscription.cancelled — que também chega
    // e apenas confirma o mesmo estado (o handler é idempotente).
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_due_to: "cancelled_by_user",
      })
      .eq("id", sub.id);
    if (error) throw new Error(error.message);

    return { ok: true };
  });
