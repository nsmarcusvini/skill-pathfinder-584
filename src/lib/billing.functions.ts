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

/**
 * Domínio que está REALMENTE servindo esta requisição — não o configurado.
 *
 * A guarda de "sandbox em produção" logo abaixo não pode usar `appBaseUrl()`:
 * aquela função prioriza a variável de ambiente `APP_BASE_URL` (fixada em
 * `rumvia.com.br` até em dev local, porque também serve para montar o link de
 * callback do checkout). Usar `appBaseUrl()` aqui faria a guarda disparar
 * sempre — inclusive em localhost — bloqueando o teste de checkout em
 * sandbox que `docs/PAGAMENTOS.md` descreve como fluxo normal de dev.
 */
function isServingProductionDomain(): boolean {
  const request = getRequest();
  const host = request?.headers.get("host") ?? (request?.url ? new URL(request.url).host : "");
  return host.includes("rumvia.com.br");
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

/**
 * Método de pagamento escolhido na vitrine.
 *
 * `CARD` é assinatura de verdade: contrato RECURRENT no Asaas, renova sozinho.
 * `PIX` é PRÉ-PAGO — cobrança avulsa (DETACHED) que compra UM período. Não
 * renova: quando `current_period_end` passa, o acesso cai e a pessoa compra de
 * novo. O aviso de vencimento vive no cron `rumvia-avisa-pix-vencendo`.
 *
 * PIX não pode ser recorrente aqui por dois motivos empilhados: o Asaas recusa
 * PIX em cobrança RECURRENT, e PIX Automático (que seria o recorrente de
 * verdade) exige recebedor PJ — a conta do RUMVIA é pessoa física.
 */
export type CheckoutMethod = "CARD" | "PIX";

export interface StartCheckoutInput {
  /** `billing_plans.key` escolhido na vitrine. */
  planKey: string;
  /** Ausente = CARD, para não quebrar chamada antiga. */
  method?: CheckoutMethod;
}

export const startSubscriptionCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: StartCheckoutInput): Required<StartCheckoutInput> => {
    const planKey = typeof input?.planKey === "string" ? input.planKey.trim() : "";
    // Quem valida de verdade é o banco (existe? está ativo?). Aqui só garantimos
    // que veio algo: a lista de chaves é dado, não constante de código.
    if (!planKey) throw new Error("Escolha um plano antes de continuar.");
    const method = input?.method ?? "CARD";
    if (method !== "CARD" && method !== "PIX") {
      throw new Error(`Método de pagamento inválido: ${String(method)}.`);
    }
    return { planKey, method };
  })
  .handler(async ({ context, data }): Promise<{ url: string; reused: boolean }> => {
    // Sessão anônima não paga: a assinatura precisa sobreviver ao dispositivo.
    if (isAnonymous(context.claims as Record<string, unknown>)) {
      throw new Error("Crie uma conta permanente antes de assinar.");
    }

    const userId = context.userId;

    // Quem já teve estorno por arrependimento ou abriu chargeback não compra de
    // novo. Devolver o dinheiro foi obrigação (art. 49); vender outra vez não é
    // — e sem esta trava o ciclo "assina, usa 6 dias, estorna, repete" não
    // tinha fim. Antes de qualquer coisa cara: nada de consultar plano ou abrir
    // checkout no gateway para uma venda que já está recusada.
    const { bloqueioAtivo, mensagemDeBloqueio } = await import("@/lib/resubscribe-block.server");
    const emailDaSessao =
      typeof (context.claims as Record<string, unknown>)["email"] === "string"
        ? ((context.claims as Record<string, unknown>)["email"] as string)
        : null;
    const bloqueio = await bloqueioAtivo(userId, emailDaSessao);
    if (bloqueio) throw new Error(mensagemDeBloqueio(bloqueio.reason));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: plan, error: planError } = await supabaseAdmin
      .from("billing_plans")
      .select("id, key, name, description, price_cents, cycle, methods")
      .eq("key", data.planKey)
      .eq("is_active", true)
      .maybeSingle();
    if (planError) throw new Error(planError.message);
    if (!plan) throw new Error(`Plano "${data.planKey}" não encontrado ou inativo.`);
    // O método escolhido precisa estar habilitado no plano. `methods` é dado
    // (regra 1): ligar ou desligar PIX num plano é UPDATE, não deploy.
    if (!plan.methods.includes(data.method)) {
      throw new Error(
        `O plano "${plan.name}" não aceita ${data.method === "PIX" ? "PIX" : "cartão"}. ` +
          `Métodos habilitados: ${plan.methods.join(", ")}.`,
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
    if (isSandboxKey() && isServingProductionDomain()) {
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
      .select("id, status, checkout_url, plan_id, current_period_end, method, dev_mode")
      .eq("user_id", userId)
      .in("status", LIVE_STATUSES)
      .maybeSingle();

    // Período pré-pago (PIX) que já venceu continua `active` na tabela — nada
    // muda o status quando a data passa, porque `has_active_subscription` olha
    // `current_period_end` e o acesso cai sozinho. Só que, para COMPRAR DE
    // NOVO, essa linha atrapalha: o índice de assinatura viva recusa uma
    // segunda, e o guard abaixo diria "você já tem uma assinatura ativa" para
    // quem está justamente tentando renovar. Vencida não bloqueia — a linha é
    // reaproveitada pelo update no fim desta função.
    const periodoVencido =
      !!existing?.current_period_end && new Date(existing.current_period_end) <= new Date();

    if (
      existing &&
      (existing.status === "active" || existing.status === "past_due") &&
      !periodoVencido
    ) {
      throw new Error("Você já tem uma assinatura ativa.");
    }
    // Checkout ainda aberto PARA O MESMO PLANO, MÉTODO e AMBIENTE: devolve o
    // mesmo link em vez de criar outro.
    //
    // As três condições existem por motivos diferentes, e cada uma já causaria
    // um bug próprio:
    //
    // - PLANO: reaproveitar depois de trocar de ciclo cobraria o preço errado.
    // - MÉTODO: o link do Asaas nasce amarrado ao billingType. Sem esta
    //   checagem, quem tem um checkout de cartão pendente e clica em "Pagar com
    //   PIX" recebe de volta a tela de CARTÃO. Entrou junto com o PIX avulso e
    //   passou despercebido até aqui.
    // - AMBIENTE: link de sandbox não pode ser servido depois que a chave virou
    //   de produção. Sem isso, quem trocou a ASAAS_API_KEY e testou com uma
    //   assinatura `pending` antiga receberia o link antigo de
    //   `sandbox.asaas.com` e concluiria que a troca de chave não funcionou —
    //   quando na verdade o código só devolveu um checkout velho.
    const mesmoAmbiente = existing?.dev_mode === isSandboxKey();
    const metodoGravado = data.method === "PIX" ? "PIX" : "CREDIT_CARD";

    if (
      existing?.status === "pending" &&
      existing.checkout_url &&
      existing.plan_id === plan.id &&
      existing.method === metodoGravado &&
      mesmoAmbiente
    ) {
      return { url: existing.checkout_url, reused: true };
    }

    const base = appBaseUrl();
    const externalId = `rumvia_${userId}_${Date.now().toString(36)}`;

    const { asaas } = await import("@/lib/asaas/client.server");
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

    // PIX é pré-pago: cobrança única (DETACHED), um período por compra. Cartão
    // é contrato que renova sozinho (RECURRENT). O `billingTypes` leva só o
    // método escolhido — mandar os dois deixaria o cliente trocar na tela do
    // Asaas e cair num tipo de cobrança que não combina com o chargeType.
    const isPix = data.method === "PIX";

    let checkout;
    try {
      checkout = await asaas.createCheckout({
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
        billingTypes: [isPix ? "PIX" : "CREDIT_CARD"],
        chargeType: isPix ? "DETACHED" : "RECURRENT",
      });
    } catch (error) {
      // Cobrança PIX exige uma CHAVE PIX cadastrada na conta Asaas, e sandbox e
      // produção são contas separadas — a chave criada em homologação não vale
      // em produção (docs/PAGAMENTOS.md). Sem ela o Asaas devolve
      // "Para gerar cobranças com Pix é necessário criar uma chave Pix no Asaas".
      //
      // Essa mensagem é instrução para o DONO da conta, não para quem está
      // tentando pagar. Sem esta tradução ela cairia crua num toast na tela do
      // cliente, que não tem o que fazer com ela. Trocamos por algo acionável
      // (use cartão) e deixamos o diagnóstico no log do servidor.
      const bruto = error instanceof Error ? error.message : String(error);
      if (isPix && bruto.toLowerCase().includes("chave pix")) {
        console.error(
          `[billing] checkout PIX recusado: falta chave PIX na conta Asaas ` +
            `(${isSandboxKey() ? "sandbox" : "produção"}). Crie em Asaas → PIX → Minhas chaves. ` +
            `Mensagem do gateway: ${bruto}`,
        );
        throw new Error(
          "O pagamento por PIX está temporariamente indisponível. Use cartão de crédito " +
            "ou tente novamente mais tarde.",
        );
      }
      throw error;
    }

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
      // `method` fica gravado já no pending para a tela saber que período
      // comprado por PIX não renova sozinho — e para o cron de aviso achar
      // essas linhas sem precisar consultar o Asaas.
      method: isPix ? "PIX" : "CREDIT_CARD",
      metadata: { plan_key: plan.key, prepaid: isPix },
    };

    const { error: writeError } = existing
      ? await supabaseAdmin.from("subscriptions").update(row).eq("id", existing.id)
      : await supabaseAdmin.from("subscriptions").insert(row);
    if (writeError) throw new Error(writeError.message);

    return { url: checkout.link, reused: false };
  });

// ─── Cancelamento ────────────────────────────────────────────────────────────

/**
 * Encerra a assinatura viva do usuário: estorna se estiver no prazo do CDC,
 * cancela no Asaas e grava o estado local.
 *
 * SERVER-ONLY. Vive fora de `cancelMySubscription` porque tem DOIS chamadores,
 * e o segundo é fácil de esquecer: `deleteMyAccount`. Quem exclui a conta
 * (direito de LGPD) também precisa parar de ser cobrado — antes disso, o
 * usuário sumia do banco e a assinatura no Asaas continuava cobrando todo mês,
 * com o agravante de que o registro local ia junto: o webhook da cobrança
 * seguinte chegava, não achava a quem pertencia, e ficava `handled: false`.
 * Ninguém percebia até o cliente reclamar da fatura.
 *
 * Devolve `null` quando não há assinatura viva — para quem exclui a conta isso
 * é o caso comum, não um erro. Quem quiser tratar como erro (o botão de
 * cancelar) decide no chamador.
 */
export async function encerrarAssinaturaViva(
  userId: string,
): Promise<{ refunded: boolean } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    // Uma linha só: o supabase-js tipa a linha a partir do literal do select.
    // Concatenar com `+` faz a inferência cair para `GenericStringError` e todo
    // acesso a campo abaixo vira erro de tipo.
    // prettier-ignore
    .select(
      "id, status, provider_subscription_id, provider_payment_id, provider_customer_id, amount_cents, first_activated_at",
    )
    .eq("user_id", userId)
    .in("status", LIVE_STATUSES)
    .maybeSingle();
  if (!sub) return null;

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

  // Estorno feito = a pessoa exerceu o arrependimento e recebeu o valor cheio.
  // A partir daqui ela não contrata de novo sem liberação manual. Registrado
  // DEPOIS do estorno e nunca antes: o bloqueio é consequência do reembolso ter
  // acontecido, e `registrarBloqueio` não lança justamente para que uma falha
  // aqui não deixe a impressão de que o estorno falhou.
  if (refunded) {
    const { registrarBloqueio } = await import("@/lib/resubscribe-block.server");
    await registrarBloqueio({
      userId,
      reason: "arrependimento_cdc",
      subscriptionId: sub.id,
      providerCustomerId: sub.provider_customer_id ?? null,
      amountCents: sub.amount_cents ?? null,
    });
  }

  return { refunded };
}

export const cancelMySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Record<string, never>) => input)
  .handler(async ({ context }): Promise<{ ok: true; refunded: boolean }> => {
    const resultado = await encerrarAssinaturaViva(context.userId);
    // Aqui a ausência É erro: a pessoa clicou em "cancelar" numa tela que só
    // mostra o botão quando existe assinatura.
    if (!resultado) throw new Error("Nenhuma assinatura ativa para cancelar.");
    return { ok: true, refunded: resultado.refunded };
  });
