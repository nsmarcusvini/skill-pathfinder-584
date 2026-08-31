import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";

import { Blueprint } from "./blueprint";
import { LoadingState } from "./states";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/use-subscription";
import { cn } from "@/lib/utils";

/** R$ 24,90 a partir de 2490. */
export function formatCents(cents: number, currency = "BRL"): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);
}

export interface PaywallProps {
  title?: string;
  description?: string;
  className?: string;
}

/** Cartão de upsell isolado — use quando quiser posicionar o convite à mão. */
export function PaywallCard({ title, description, className }: PaywallProps) {
  const { plan } = useSubscription();
  const preco = plan ? formatCents(plan.priceCents, plan.currency) : "R$ 24,90";

  return (
    <Blueprint
      className={cn("flex flex-col items-center gap-3 px-6 py-8 text-center", className)}
      role="region"
      aria-label="Recurso do plano Pro"
    >
      <span className="text-neutral-500">
        <Lock className="size-6" aria-hidden />
      </span>
      <h5 className="font-heading">{title ?? "Disponível no RUMVIA Pro"}</h5>
      <p className="caption max-w-md">
        {description ?? `Assine por ${preco} por mês e libere este recurso. Cancele quando quiser.`}
      </p>
      <Button asChild>
        <Link to="/assinatura">Ver o plano</Link>
      </Button>
    </Blueprint>
  );
}

/**
 * Envolve conteúdo pago. Mostra `children` só para assinante ativo.
 *
 * Isto é UX, NÃO segurança: a server function que serve o dado precisa usar
 * `requireActiveSubscription` (src/integrations/supabase/subscription-middleware.ts).
 */
export function Paywall({ children, ...props }: PaywallProps & { children: ReactNode }) {
  const { canAccess, resolvendo } = useSubscription();

  if (resolvendo) return <LoadingState rows={3} label="Verificando assinatura…" />;
  if (!canAccess) return <PaywallCard {...props} />;
  return <>{children}</>;
}
