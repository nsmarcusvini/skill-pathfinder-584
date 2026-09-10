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
  first_activated_at: string | null;
  cancelled_due_to: string | null;
  provider_customer_id: string | null;
  amount_cents: number | null;
};

// Uma linha só, por mais comprida que fique: o supabase-js infere o tipo da
// linha a partir do LITERAL da string de select. Quebrar em duas com `+` faz a
// inferência desistir e devolver `GenericStringError`, e aí todo acesso a campo
// vira erro de tipo. Não é estilo — é o que faz o tipo existir.
// prettier-ignore
const SELECT = "id, user_id, status, current_period_end, plan_id, first_activated_at, cancelled_due_to, provider_customer_id, amount_cents";

/**
 * Status que contam como "assinatura viva". Espelha exatamente o WHERE do
 * índice `uq_subscriptions_user_viva` (UNIQUE por user_id) — se um dia o índice
 * mudar, esta lista muda junto, senão a guarda em `applyEvent` para de valer.
 */
const LIVE_STATUSES = ["pending", "active", "past_due"] as const;
type LiveStatus = (typeof LIVE_STATUSES)[number];

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

  // Último recurso: pelo cliente.
  //
  // Para dinheiro ENTRANDO, só assinatura viva: casar um pagamento solto com uma
  // assinatura já cancelada a ressuscitaria, e o dono do dinheiro pode ser outro
  // contrato.
  //
  // Para estorno e chargeback é o contrário — são eventos de ENCERRAMENTO, e a
  // linha que eles procuram quase sempre já está fora do estado vivo (o usuário
  // cancelou e o estorno veio depois). Filtrar por vivo aqui fazia o estorno não
  // achar nada e o registro de `refunded`/`chargeback` se perder, justamente o
  // que a conferência de reembolso precisa enxergar. Eles não dão acesso a
  // ninguém, então ampliar o alcance não cria risco.
  if (customerId) {
    const encerramento =
      payload.event === "PAYMENT_REFUNDED" || payload.event === "PAYMENT_CHARGEBACK_REQUESTED";

    let query = supabaseAdmin.from("subscriptions").select(SELECT).eq("provider_customer_id", customerId);
    if (!encerramento) query = query.in("status", ["pending", "active", "past_due"]);

    const { data } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
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

/**
 * Pagamento chegou de um cliente que está bloqueado para recontratação.
 *
 * O checkout já recusa quem tem o mesmo user_id ou o mesmo e-mail; o que chega
 * aqui é quem trocou de conta. Só que, quando o webhook roda, o dinheiro JÁ
 * entrou — não dá para recusar a venda antes. Sobram dois caminhos honestos, e
 * qual deles vale é decisão de negócio, lida de `app_settings`:
 *
 *   'flag'   (default) — marca a assinatura e grita no log; o acesso continua.
 *                        Nada acontece com o dinheiro sem alguém olhar.
 *   'refund'           — devolve na hora e cancela. Também é honesto: a pessoa
 *                        recebe tudo de volta em minutos e a venda simplesmente
 *                        não aconteceu. Mas é dinheiro se movendo sozinho a
 *                        partir de um webhook, e um falso positivo na lista
 *                        vira estorno indevido. Só ligue depois de ver o
 *                        'flag' acertando na prática.
 *
 * Devolve o patch a mesclar, ou `null` quando não há nada a fazer.
 */
async function tratarPagamentoDeBloqueado(
  customerId: string,
  userIdDaAssinatura: string,
  paymentId: string | null,
): Promise<SubscriptionUpdate | null> {
  const { bloqueioPorCustomer } = await import("@/lib/resubscribe-block.server");
  const bloqueio = await bloqueioPorCustomer(customerId);
  if (!bloqueio) return null;

  // Mesmo usuário: não é evasão. Acontece se um bloqueio for registrado no
  // meio de um pagamento em curso — o checkout barra daqui em diante, e não há
  // motivo para mexer numa cobrança que já estava a caminho.
  if (bloqueio.user_id === userIdDaAssinatura) return null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: cfg } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "resubscribe_block_action")
    .maybeSingle();
  const acao = typeof cfg?.value === "string" ? cfg.value : "flag";

  console.error(
    `[bloqueio] pagamento de cliente bloqueado: customer=${customerId} ` +
      `(bloqueado como ${bloqueio.user_id} por ${bloqueio.reason} em ${bloqueio.created_at}) ` +
      `pagou de novo como ${userIdDaAssinatura}. Ação configurada: ${acao}.`,
  );

  // Fica NA LINHA da assinatura, não só no log: log rola para fora da tela e
  // ninguém vai reler o do mês passado. Em metadata dá para consultar.
  const marca: SubscriptionUpdate = {
    metadata: {
      resubscribe_block_hit: {
        customer_id: customerId,
        blocked_user_id: bloqueio.user_id,
        reason: bloqueio.reason,
        detected_at: new Date().toISOString(),
        action: acao,
      },
    },
  };

  if (acao !== "refund" || !paymentId) return marca;

  try {
    const { asaas } = await import("./client.server");
    await asaas.refundPayment(paymentId);
    return {
      ...marca,
      status: "refunded",
      cancelled_at: new Date().toISOString(),
      cancelled_due_to: "recontratacao_bloqueada",
    };
  } catch (erro) {
    // Estorno falhou: NÃO transforma isso em erro do webhook. O pagamento é
    // real e o resto do evento (período, recibo) precisa ser gravado do mesmo
    // jeito — senão a pessoa fica pagante sem acesso, que é o pior dos mundos.
    console.error(`[bloqueio] estorno automático de ${paymentId} falhou:`, erro);
    return marca;
  }
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
  // Aprende o pay_... da cobrança mais recente — é o que cancelMySubscription
  // usa para estornar sem precisar consultar a API na hora do pedido
  // (docs/roadmap/conformidade-cobranca.md, item 1).
  if (payment?.id) patch.provider_payment_id = payment.id;

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
      // Gravado UMA VEZ — nunca sobrescrito numa renovação. É a data que conta
      // os 7 dias do direito de arrependimento (CDC art. 49), calculada a
      // partir do primeiro pagamento, não do ciclo atual.
      if (!subscription.first_activated_at) patch.first_activated_at = start.toISOString();

      // ─── Conta nova, mesma pessoa ─────────────────────────────────────────
      // `startSubscriptionCheckout` recusa quem está bloqueado, mas só sabe
      // olhar user_id e e-mail. Quem exclui a conta e cria outra com outro
      // e-mail passa por lá — e só aqui, quando o pagamento chega, aparece o
      // `cust_...` que o CPF gerou na página hospedada do Asaas. Este é o
      // único ponto do sistema em que essa evasão é visível.
      const cliente = payment?.customer ?? remoteSub?.customer ?? null;
      if (cliente) {
        const acao = await tratarPagamentoDeBloqueado(
          cliente,
          subscription.user_id,
          payment?.id ?? null,
        );
        if (acao) Object.assign(patch, acao);
      }
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
      // Se `cancelMySubscription` já marcou o motivo como arrependimento (o
      // pedido de estorno partiu do usuário, dentro do prazo do CDC), esse
      // motivo é mais específico que "refunded" genérico — não sobrescrever.
      if (subscription.cancelled_due_to !== "arrependimento_cdc") {
        patch.cancelled_due_to = "refunded";
      }
      break;
    }

    // Chargeback: corta o acesso na hora. Reativar é decisão manual.
    case "PAYMENT_CHARGEBACK_REQUESTED": {
      patch.status = "cancelled";
      patch.cancelled_at = new Date().toISOString();
      patch.cancelled_due_to = "chargeback";

      // E não vende de novo. Chargeback é mais grave que arrependimento: no
      // arrependimento a pessoa pediu para nós e devolvemos; aqui ela pediu à
      // bandeira, o dinheiro saiu sem passar por aqui e ainda custou taxa.
      const { registrarBloqueio } = await import("@/lib/resubscribe-block.server");
      await registrarBloqueio({
        userId: subscription.user_id,
        reason: "chargeback",
        subscriptionId: subscription.id,
        providerCustomerId: payment?.customer ?? subscription.provider_customer_id ?? null,
        amountCents: subscription.amount_cents ?? null,
      });
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

  // ─── Guarda: evento atrasado não ressuscita assinatura superada ─────────────
  //
  // `uq_subscriptions_user_viva` é UNIQUE(user_id) WHERE status IN
  // ('pending','active','past_due') — uma assinatura viva por pessoa. Como o
  // INSERT do checkout já respeita esse índice, dois vivos nunca nascem juntos;
  // o que acontece é o inverso: a assinatura velha é cancelada, a pessoa assina
  // de novo, e aí chega um evento ATRASADO da velha (OVERDUE, CONFIRMED) que
  // tentaria devolvê-la para um status vivo. Isso estourava o índice, o update
  // inteiro falhava e o evento morria com `handled: false` — foi o que
  // aconteceu em 2026-09-03 ("duplicate key value violates unique constraint").
  //
  // A resposta certa NÃO é fechar a outra para abrir espaço: a vigente pode ser
  // de alguém pagando agora, e derrubá-la tiraria acesso de cliente adimplente.
  // Quem manda é a linha viva; o evento atrasado perde a parte de status e
  // mantém o resto (customer, método, sub_..., recibo), que continua sendo
  // informação boa.
  if (patch.status && LIVE_STATUSES.includes(patch.status as LiveStatus)) {
    const { data: outraViva } = await supabaseAdmin
      .from("subscriptions")
      .select("id, status")
      .eq("user_id", subscription.user_id)
      .in("status", LIVE_STATUSES as unknown as string[])
      .neq("id", subscription.id)
      .limit(1)
      .maybeSingle();

    if (outraViva) {
      const recusado = patch.status;
      delete patch.status;
      const reason =
        `${event}: status "${recusado}" recusado — o usuário já tem a assinatura ` +
        `${outraViva.id} viva (${outraViva.status}). Evento atrasado de uma ` +
        `assinatura superada; o resto do payload foi gravado.`;
      console.warn(`[asaas] ${reason} (${payload.id})`);

      if (Object.keys(patch).length > 0) {
        const { error } = await supabaseAdmin
          .from("subscriptions")
          .update(patch)
          .eq("id", subscription.id);
        if (error) throw new Error(error.message);
      }
      // `applied: false` de propósito: o efeito que o evento pedia não valeu.
      // `handled` fica false e o motivo entra em `handle_error`, para o evento
      // aparecer na conferência em vez de sumir como se tivesse dado certo.
      return { subscriptionId: subscription.id, applied: false, reason };
    }
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
