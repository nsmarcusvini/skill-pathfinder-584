import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";

import { Blueprint } from "./blueprint";
import { LoadingState } from "./states";
import { Button } from "@/components/ui/button";
import { menorMensalidade, useSubscription } from "@/hooks/use-subscription";
import { cn } from "@/lib/utils";

/** R$ 29,90 a partir de 2990. */
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
  const { plans } = useSubscription();
  // Com três ciclos, o convite cita o MENOR preço por mês e diz que é "a partir
  // de" — prometer o número do anual sem essa ressalva seria propaganda enganosa.
  // Sem catálogo carregado, a frase some em vez de inventar valor (regra 1).
  const maisBarato = menorMensalidade(plans);

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
        {description ??
          (maisBarato
            ? `Assine a partir de ${formatCents(maisBarato.monthlyEquivalentCents, maisBarato.currency)} por mês e libere este recurso.`
            : "Assine o RUMVIA Pro para liberar este recurso.")}
      </p>
      <Button asChild>
        <Link to="/assinatura">Ver os planos</Link>
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
