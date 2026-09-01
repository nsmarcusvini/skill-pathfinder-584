import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, Lock } from "lucide-react";
import { toast } from "sonner";

import { Blueprint } from "@/components/rumvia/blueprint";
import { PageHeader } from "@/components/rumvia/page-header";
import { ErrorState, LoadingState } from "@/components/rumvia/states";
import { useAuth } from "@/hooks/use-auth";
import { formatCents } from "@/components/rumvia/paywall";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BILLING_QUERY_KEY,
  useCancelSubscription,
  useStartCheckout,
  useSubscription,
} from "@/hooks/use-subscription";
import type { MySubscription, SubscriptionStatus } from "@/lib/billing.functions";
import { AVISO_ACESSO_PAGO, PLANO_INCLUI } from "@/lib/plan-copy";

const CYCLE_LABEL: Record<string, string> = {
  WEEKLY: "por semana",
  MONTHLY: "por mês",
  QUARTERLY: "por trimestre",
  SEMIANNUALLY: "por semestre",
  ANNUALLY: "por ano",
};

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  pending: "Aguardando pagamento",
  active: "Ativa",
  past_due: "Pagamento pendente",
  cancelled: "Cancelada",
  refunded: "Estornada",
  expired: "Expirada",
};

function dataBR(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export const Route = createFileRoute("/_conta/assinatura")({
  // `?status=sucesso` vem do completionUrl do checkout; `?bloqueado=1` vem de
  // quem foi barrado pelo paywall. Devolver só as chaves presentes mantém os
  // dois parâmetros opcionais em todo <Link to="/assinatura">.
  validateSearch: (search: Record<string, unknown>): { status?: string; bloqueado?: string } => ({
    ...(typeof search["status"] === "string" ? { status: search["status"] } : {}),
    ...(typeof search["bloqueado"] === "string" ? { bloqueado: search["bloqueado"] } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Assinatura — RUMVIA" },
      {
        name: "description",
        content: "Gerencie o plano RUMVIA Pro: pagamento, renovação e cancelamento.",
      },
    ],
  }),
  component: AssinaturaPage,
});

function AssinaturaPage() {
  const { status: statusParam } = Route.useSearch();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { isOnboarded } = useAuth();
  const { plan, subscription, isPro, isAdmin, canAccess, isLoading, isError, refetch } =
    useSubscription();
  const checkout = useStartCheckout();
  const cancelar = useCancelSubscription();
  const [confirmarCancelamento, setConfirmarCancelamento] = React.useState("");

  // Volta do checkout: o webhook subscription.completed leva alguns segundos.
  // Repescamos o estado por ~40s antes de desistir.
  const aguardandoWebhook = statusParam === "sucesso" && !isPro;
  React.useEffect(() => {
    if (!aguardandoWebhook) return;
    let tentativas = 0;
    const timer = setInterval(() => {
      tentativas += 1;
      void queryClient.invalidateQueries({ queryKey: BILLING_QUERY_KEY });
      if (tentativas >= 13) clearInterval(timer);
    }, 3000);
    return () => clearInterval(timer);
  }, [aguardandoWebhook, queryClient]);

  // Pagamento confirmado enquanto a pessoa esperava nesta tela: segue o funil
  // sem exigir mais um clique.
  const voltandoDoCheckout = statusParam === "sucesso";
  React.useEffect(() => {
    if (!voltandoDoCheckout || !isPro) return;
    void navigate({ to: isOnboarded ? "/dashboard" : "/onboarding", replace: true });
  }, [voltandoDoCheckout, isPro, isOnboarded, navigate]);

  async function assinar() {
    try {
      await checkout.mutateAsync();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function cancelarAssinatura() {
    try {
      await cancelar.mutateAsync();
      setConfirmarCancelamento("");
      toast.success("Assinatura cancelada. O acesso Pro termina agora.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Configurações"
        title="Assinatura"
        subtitle="Plano, cobrança e cancelamento."
      />

      {isLoading ? <LoadingState rows={4} label="Carregando plano…" /> : null}
      {isError ? <ErrorState onRetry={() => void refetch()} /> : null}

      {!isLoading && !isError && !canAccess ? (
        <Blueprint className="border-danger p-5" role="alert">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
            <div>
              <h2 className="label-h6 text-danger">Sua conta está bloqueada</h2>
              <p className="mt-1 text-body text-neutral-700">
                Criar a conta não libera o acesso. O painel do RUMVIA — análise completa, plano de
                estudos, salários, empresas e progresso —{" "}
                <strong>só abre depois que a assinatura for paga</strong>. Seu currículo e suas
                skills continuam guardados aqui enquanto isso.
              </p>
            </div>
          </div>
        </Blueprint>
      ) : null}

      {!isLoading && !isError && !isPro && isAdmin ? (
        <Blueprint className="p-4">
          <p className="text-caption text-neutral-700">
            Você entra sem assinatura porque é <strong>admin</strong>. Contas comuns precisam pagar
            para acessar o painel.
          </p>
        </Blueprint>
      ) : null}

      {!isLoading && !isError ? (
        <>
          {aguardandoWebhook ? (
            <Blueprint className="border-accent p-4">
              <h2 className="label-h6 text-neutral-700">Confirmando o pagamento…</h2>
              <p className="mt-1 text-caption text-neutral-700">
                O Asaas avisa o RUMVIA assim que a cobrança é aprovada. Esta tela atualiza sozinha —
                costuma levar poucos segundos.
              </p>
            </Blueprint>
          ) : null}

          {subscription ? <StatusAtual subscription={subscription} /> : null}

          {plan ? (
            <Blueprint className="p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-heading text-h4">{plan.name}</h2>
                <p className="font-heading text-h4">
                  {formatCents(plan.priceCents, plan.currency)}
                  <span className="ml-1 text-caption text-neutral-700">
                    {CYCLE_LABEL[plan.cycle] ?? "por ciclo"}
                  </span>
                </p>
              </div>
              {plan.description ? (
                <p className="mt-1 text-caption text-neutral-700">{plan.description}</p>
              ) : null}

              <ul className="mt-4 flex flex-col gap-2">
                {PLANO_INCLUI.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-caption text-neutral-700">
                    <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                    {b}
                  </li>
                ))}
              </ul>

              <p className="mt-4 text-caption text-neutral-600">
                Pagamento processado pelo Asaas.{" "}
                {plan.methods.includes("PIX") && plan.methods.includes("CARD")
                  ? "Cartão de crédito ou PIX automático."
                  : plan.methods.includes("PIX")
                    ? "PIX automático."
                    : "Cartão de crédito."}{" "}
                {plan.trialDays ? `${plan.trialDays} dias grátis. ` : ""}
                Renova automaticamente a cada ciclo até você cancelar. {AVISO_ACESSO_PAGO}
              </p>

              {!plan.ready ? (
                <p className="mt-3 text-caption text-danger">
                  Plano ainda não conectado ao gateway. Rode <code>bun scripts/asaas-setup.ts</code>
                  .
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                {subscription?.status === "pending" && subscription.checkoutUrl ? (
                  <Button asChild>
                    <a href={subscription.checkoutUrl} target="_blank" rel="noreferrer">
                      Concluir pagamento
                      <ExternalLink className="size-4" aria-hidden />
                    </a>
                  </Button>
                ) : !isPro ? (
                  <Button
                    onClick={() => void assinar()}
                    loading={checkout.isPending}
                    disabled={!plan.ready}
                  >
                    Assinar por {formatCents(plan.priceCents, plan.currency)}/mês
                  </Button>
                ) : null}
              </div>
            </Blueprint>
          ) : (
            <ErrorState
              title="Plano indisponível"
              description="Nenhum plano ativo cadastrado em billing_plans."
            />
          )}

          {isPro ? (
            <Blueprint className="border-danger p-5">
              <h2 className="label-h6 text-danger">Cancelar assinatura</h2>
              <p className="mt-1 text-caption text-neutral-700">
                O cancelamento é <strong>imediato e irreversível</strong>: não há reembolso
                proporcional e o acesso Pro termina na hora. Digite <strong>CANCELAR</strong> para
                confirmar.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Input
                  className="max-w-48"
                  value={confirmarCancelamento}
                  onChange={(e) => setConfirmarCancelamento(e.target.value)}
                  placeholder="CANCELAR"
                  aria-label="Confirmação de cancelamento"
                />
                <Button
                  variant="destructive"
                  disabled={confirmarCancelamento !== "CANCELAR"}
                  loading={cancelar.isPending}
                  onClick={() => void cancelarAssinatura()}
                >
                  Cancelar minha assinatura
                </Button>
              </div>
            </Blueprint>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function StatusAtual({ subscription }: { subscription: MySubscription }) {
  const cobrancaFalhou = subscription.status === "past_due";
  return (
    <Blueprint className={cobrancaFalhou ? "border-danger p-5" : "p-5"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="label-h6 text-neutral-700">Situação</h2>
        <span className={cobrancaFalhou ? "label-h6 text-danger" : "label-h6"}>
          {STATUS_LABEL[subscription.status]}
          {subscription.devMode ? " · sandbox" : ""}
        </span>
      </div>

      <dl className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-caption text-neutral-600">Valor</dt>
          <dd className="font-heading">{formatCents(subscription.amountCents)}</dd>
        </div>
        <div>
          <dt className="text-caption text-neutral-600">
            {subscription.status === "cancelled" ? "Cancelada em" : "Próxima cobrança"}
          </dt>
          <dd className="font-heading">
            {subscription.status === "cancelled"
              ? dataBR(subscription.cancelledAt)
              : dataBR(subscription.currentPeriodEnd)}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-neutral-600">Método</dt>
          <dd className="font-heading">{subscription.method ?? "—"}</dd>
        </div>
      </dl>

      {subscription.cancelledDueTo === "max_payment_retries_exceeded" ? (
        <p className="mt-3 text-caption text-danger">
          A assinatura foi cancelada automaticamente após as tentativas de cobrança falharem. Assine
          de novo com outro cartão para recuperar o acesso.
        </p>
      ) : null}

      {subscription.lastReceiptUrl ? (
        <a
          className="mt-3 inline-flex items-center gap-1 text-caption underline"
          href={subscription.lastReceiptUrl}
          target="_blank"
          rel="noreferrer"
        >
          Ver último recibo
          <ExternalLink className="size-3" aria-hidden />
        </a>
      ) : null}
    </Blueprint>
  );
}
