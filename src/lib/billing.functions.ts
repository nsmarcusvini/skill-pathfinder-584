/**
 * Assinatura RUMVIA Pro via Asaas.
 *
 * FONTE ÚNICA do estado de pagamento: a tabela `subscriptions`, escrita só pelo
 * webhook e por estas server functions (service_role). Nenhuma tela decide se
 * alguém é pagante — todas perguntam para `getBillingOverview` / `useSubscription`.
 *
 * CATÁLOGO: `billing_plans` tem N planos ativos (mensal, trimestral, anual). Não
 * existe plano "padrão" no código — a vitrine mostra o que estiver ativo, na
 * ordem de `sort_order`, e o checkout cobra o `planKey` que a pessoa escolheu.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SubscriptionStatus =
  "pending" | "active" | "past_due" | "cancelled" | "refunded" | "expired";

export interface BillingPlan {
  key: string;
  name: string;
  description: string | null;
  /** Cobrado de uma vez, pelo ciclo inteiro. */
  priceCents: number;
  currency: string;
  /** Vocabulário do Asaas: MONTHLY | QUARTERLY | YEARLY | … */
  cycle: string;
  /** Meses cobertos por uma cobrança. Coluna gerada a partir do ciclo. */
  months: number;
  /** `priceCents / months` — o número que permite comparar ciclos diferentes. */
  monthlyEquivalentCents: number;
  /**
   * Quanto este ciclo economiza por mês contra o ciclo mais caro por mês (na
   * prática, o mensal). Derivado do preço, nunca gravado: guardar o número
   * pronto criaria uma segunda verdade que envelhece sozinha no dia em que
   * alguém mexer só no preço. `0` no plano de referência.
   */
  discountPercent: number;
  sortOrder: number;
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
  /** Plano contratado. Pode divergir do catálogo atual — preço antigo é honrado. */
  planKey: string | null;
  planName: string | null;
  planCycle: string | null;
  /**
   * Prazo do direito de arrependimento (CDC art. 49): 7 dias corridos a
   * partir da PRIMEIRA cobrança confirmada, nunca da mais recente — trocar de
   * ciclo ou renovar não reabre o prazo. `null` enquanto não há nenhum
   * pagamento confirmado (status `pending`: nada para arrepender ainda).
   * Calculado no servidor de propósito — se o cliente decidisse a janela,
   * viraria parâmetro de quem quisesse editá-la.
   */
  withdrawalDeadline: string | null;
}

const DIAS_ARREPENDIMENTO = 7;

function calcularPrazoArrependimento(firstActivatedAt: string | null): string | null {
  if (!firstActivatedAt) return null;
  const prazo = new Date(firstActivatedAt);
  prazo.setUTCDate(prazo.getUTCDate() + DIAS_ARREPENDIMENTO);
  return prazo.toISOString();
}

export interface BillingOverview {
  /** Catálogo ativo, na ordem de exibição. Vazio = nada para vender. */
  plans: BillingPlan[];
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

const PLAN_COLUMNS =
  "key, name, description, price_cents, currency, cycle, months, sort_order, trial_days, methods";

interface PlanRow {
  key: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  cycle: string;
  months: number | null;
  sort_order: number | null;
  trial_days: number | null;
  methods: string[] | null;
}

/**
 * Enriquece as linhas de `billing_plans` com equivalente mensal e desconto.
 *
 * A referência do desconto é o MAIOR equivalente mensal do catálogo, não uma
 * chave fixa: se um dia o mensal sair de cena, a conta continua certa sozinha.
 */
function toPlans(rows: PlanRow[]): BillingPlan[] {
  const enriched = rows.map((row) => {
    // `months` é coluna gerada e nunca é nula para os ciclos permitidos; o
    // fallback existe só para não dividir por zero se o CHECK for afrouxado.
    const months = row.months && row.months > 0 ? row.months : 1;
    return { row, months, monthlyEquivalentCents: Math.round(row.price_cents / months) };
  });

  const referencia = enriched.reduce((maior, p) => Math.max(maior, p.monthlyEquivalentCents), 0);

  return enriched
    .map(({ row, months, monthlyEquivalentCents }) => ({
      key: row.key,
      name: row.name,
      description: row.description ?? null,
      priceCents: row.price_cents,
      currency: row.currency,
      cycle: row.cycle,
      months,
      monthlyEquivalentCents,
      discountPercent:
        referencia > 0 ? Math.round((1 - monthlyEquivalentCents / referencia) * 100) : 0,
      sortOrder: row.sort_order ?? 0,
      trialDays: row.trial_days ?? null,
      methods: row.methods ?? ["CARD"],
      ready: true,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.priceCents - b.priceCents);
}

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

    const { data: planRows, error: planError } = await db
      .from("billing_plans")
      .select(PLAN_COLUMNS)
      .eq("is_active", true);
    if (planError) throw new Error(planError.message);

    // RLS já limita a linha ao próprio usuário. O join traz o plano contratado,
    // que pode ser diferente de qualquer um do catálogo atual.
    const { data: subRow, error: subError } = await db
      .from("subscriptions")
      .select(
        "status, amount_cents, method, current_period_end, trial_ends_at, last_payment_at, last_receipt_url, cancelled_at, cancelled_due_to, checkout_url, dev_mode, created_at, first_activated_at, billing_plans(key, name, cycle)",
      )
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subError) throw new Error(subError.message);

    const subPlan = (subRow?.billing_plans ?? null) as {
      key: string;
      name: string;
      cycle: string;
    } | null;

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
          planKey: subPlan?.key ?? null,
          planName: subPlan?.name ?? null,
          planCycle: subPlan?.cycle ?? null,
          withdrawalDeadline: calcularPrazoArrependimento(subRow.first_activated_at ?? null),
        }
      : null;

    const isPro =
      subscription !== null &&
      (subscription.status === "active" || subscription.status === "past_due") &&
      (subscription.currentPeriodEnd === null ||
        new Date(subscription.currentPeriodEnd).getTime() > Date.now());

    const isAdmin = profileRow?.is_admin === true;

    return {
      plans: toPlans((planRows ?? []) as PlanRow[]),
      subscription,
      isPro,
      isAdmin,
      canAccess: isPro || isAdmin,
    };
  });

// ─── Catálogo público (landing) ──────────────────────────────────────────────

export interface PublicPlan {
  key: string;
  name: string;
  priceCents: number;
  currency: string;
  cycle: string;
  months: number;
  monthlyEquivalentCents: number;
  discountPercent: number;
  trialDays: number | null;
}

/**
 * Catálogo para a landing, sem login. Devolve só campos públicos — nada de
 * campo interno. A landing NUNCA escreve preço no JSX (regra 1): o número vem
 * de `billing_plans`, a mesma fonte que o checkout cobra.
 */
export const getPublicPlans = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicPlan[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("billing_plans")
      .select(PLAN_COLUMNS)
      .eq("is_active", true);
    if (!data) return [];
    return toPlans(data as PlanRow[]).map((p) => ({
      key: p.key,
      name: p.name,
      priceCents: p.priceCents,
      currency: p.currency,
      cycle: p.cycle,
      months: p.months,
      monthlyEquivalentCents: p.monthlyEquivalentCents,
      discountPercent: p.discountPercent,
      trialDays: p.trialDays,
    }));
  },
);

// ─── Checkout ────────────────────────────────────────────────────────────────

export interface StartCheckoutInput {
  /** `billing_plans.key` escolhido na vitrine. */
  planKey: string;
}

export const startSubscriptionCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: StartCheckoutInput): StartCheckoutInput => {
    const planKey = typeof input?.planKey === "string" ? input.planKey.trim() : "";
    // Quem valida de verdade é o banco (existe? está ativo?). Aqui só garantimos
    // que veio algo: a lista de chaves é dado, não constante de código.
    if (!planKey) throw new Error("Escolha um plano antes de continuar.");
    return { planKey };
  })
  .handler(async ({ context, data }): Promise<{ url: string; reused: boolean }> => {
    // Sessão anônima não paga: a assinatura precisa sobreviver ao dispositivo.
    if (isAnonymous(context.claims as Record<string, unknown>)) {
      throw new Error("Crie uma conta permanente antes de assinar.");
    }

    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: plan, error: planError } = await supabaseAdmin
      .from("billing_plans")
      .select("id, key, name, description, price_cents, cycle, methods")
      .eq("key", data.planKey)
      .eq("is_active", true)
      .maybeSingle();
    if (planError) throw new Error(planError.message);
    if (!plan) throw new Error(`Plano "${data.planKey}" não encontrado ou inativo.`);
    // O checkout usa chargeTypes: RECURRENT, e o Asaas recusa qualquer PIX
    // nele — "CREDIT_CARD é o único método permitido para operações
    // RECURRENT" (testado no sandbox, docs/PAGAMENTOS.md). Isso vale mesmo
    // com CNPJ: PIX Automático de verdade é outra API, não implementada.
    // Falhar aqui com uma mensagem clara é melhor que deixar o Asaas devolver
    // um 400 sem contexto no meio do checkout de alguém.
    if (plan.methods.includes("PIX")) {
      throw new Error(
        `O plano "${plan.name}" lista PIX nos métodos, mas o checkout recorrente do RUMVIA só ` +
          `aceita cartão de crédito — o Asaas recusa PIX em cobrança RECURRENT. Corrija ` +
          `"methods" em billing_plans ou implemente o fluxo de PIX Automático antes de ativar.`,
      );
    }

    // Chave de sandbox servindo o domínio real é o pior estado silencioso que
    // esta integração pode ter: o cliente percorre um checkout de homologação,
    // acha que pagou, e o dinheiro nunca existiu. Nada na tela denuncia — o
    // selo "sandbox" só aparece DEPOIS, numa assinatura já criada.
    //
    // Não bloqueia dev: localhost, túnel e *.vercel.app seguem livres para
    // testar com chave de homologação. O que fica proibido é exatamente a
    // combinação que só pode ser engano — sandbox atendendo rumvia.com.br.
    //
    // Em 2026-09-08 a produção estava nesse estado (webhook já cadastrado na
    // conta de produção, mas ASAAS_API_KEY ainda `_hmlg_` na Vercel). Foi
    // detectado por acaso, pelo `dev_mode` de um evento de teste — esta guarda
    // existe para que da próxima vez não dependa de sorte.
    const { isSandboxKey } = await import("@/lib/asaas/client.server");
    if (isSandboxKey() && appBaseUrl().includes("rumvia.com.br")) {
      throw new Error(
        "Checkout bloqueado: a ASAAS_API_KEY é de homologação (_hmlg_) e o app está " +
          "servindo o domínio de produção. Ninguém deve pagar num checkout de sandbox. " +
          "Troque a chave na Vercel pela de produção e faça um novo deploy — variável " +
          "nova só vale no deploy seguinte.",
      );
    }

    // Uma assinatura viva por usuário (índice único parcial garante isso).
    const { data: existing } = await supabaseAdmin
      .from("subscriptions")
      .select("id, status, checkout_url, plan_id")
      .eq("user_id", userId)
      .in("status", LIVE_STATUSES)
      .maybeSingle();

    if (existing && (existing.status === "active" || existing.status === "past_due")) {
      throw new Error("Você já tem uma assinatura ativa.");
    }
    // Checkout ainda aberto PARA O MESMO PLANO: devolve o mesmo link em vez de
    // criar outro. Se a pessoa trocou de ciclo, reaproveitar cobraria o preço
    // errado — o link antigo é descartado e um checkout novo é aberto.
    if (existing?.status === "pending" && existing.checkout_url && existing.plan_id === plan.id) {
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
      // Vai cru: `billing_plans.cycle` já está no vocabulário do Asaas.
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
  .handler(async ({ context }): Promise<{ ok: true; refunded: boolean }> => {
    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select(
        "id, status, provider_subscription_id, provider_payment_id, first_activated_at",
      )
      .eq("user_id", userId)
      .in("status", LIVE_STATUSES)
      .maybeSingle();
    if (!sub) throw new Error("Nenhuma assinatura ativa para cancelar.");

    // Direito de arrependimento (CDC art. 49): dentro de 7 dias corridos da
    // PRIMEIRA cobrança confirmada, cancelar também estorna o valor cheio —
    // nunca proporcional. Fora da janela, ou sem nenhum pagamento ainda
    // (status pending: nada a devolver), segue o cancelamento comum.
    const prazo = calcularPrazoArrependimento(sub.first_activated_at ?? null);
    const dentroDoPrazo = prazo !== null && Date.now() <= new Date(prazo).getTime();

    let refunded = false;

    if (dentroDoPrazo) {
      const { asaas } = await import("@/lib/asaas/client.server");
      const { AsaasError } = await import("@/lib/asaas/types");

      // provider_payment_id é aprendido no webhook a cada PAYMENT_* — é o
      // caminho normal. Sem ele (dado antigo, ou correlação que ainda não
      // chegou), busca na API em vez de deixar o arrependimento sem efeito:
      // o direito não pode depender de um campo estar preenchido.
      let paymentId = sub.provider_payment_id ?? null;
      if (!paymentId && sub.provider_subscription_id) {
        const { data: pagamentos } = await asaas.listPaymentsBySubscription(
          sub.provider_subscription_id,
          5,
        );
        paymentId =
          pagamentos?.find((p) => p.status === "CONFIRMED" || p.status === "RECEIVED")?.id ?? null;
      }

      if (paymentId) {
        try {
          await asaas.refundPayment(paymentId);
          refunded = true;
        } catch (error) {
          // "Não é possível cancelar a venda." é o que o Asaas devolve para
          // uma cobrança já estornada (confirmado no sandbox em 2026-09-05).
          // O dinheiro já voltou — pedir estorno de novo não pode virar erro
          // para quem clicou cancelar duas vezes.
          const jaEstornado =
            error instanceof AsaasError &&
            error.status === 400 &&
            error.message.toLowerCase().includes("não é possível cancelar a venda");
          if (!jaEstornado) throw error;
          refunded = true;
        }
      }
    }

    if (sub.provider_subscription_id) {
      const { asaas } = await import("@/lib/asaas/client.server");
      // Remove a assinatura no Asaas: nenhuma cobrança futura é gerada.
      await asaas.cancelSubscription(sub.provider_subscription_id);
    }

    // Grava já, sem esperar o webhook subscription.cancelled / PAYMENT_REFUNDED
    // — que também chegam e só confirmam o mesmo estado (idempotente). O
    // status final de um estorno é `refunded`, mas quem grava isso é o
    // webhook; aqui fica `cancelled` com o motivo específico, igual ao
    // cancelamento comum, até a confirmação chegar.
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_due_to: refunded ? "arrependimento_cdc" : "cancelled_by_user",
      })
      .eq("id", sub.id);
    if (error) throw new Error(error.message);

    return { ok: true, refunded };
  });
