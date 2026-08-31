import * as React from "react";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AuthDialog } from "./auth-dialog";
import { useAuth } from "@/hooks/use-auth";

export interface RequireAccountProps {
  children: React.ReactNode;
  /** Título do overlay. */
  title?: string;
  description?: string;
  /** Rótulo do placeholder quando não há conteúdo real para desfocar. */
  placeholderLabel?: string;
}

/**
 * Bloqueia conteúdo para visitantes anônimos.
 * Nunca exibe dado falso: desfoca o conteúdo real (ou mostra um placeholder
 * explicitamente rotulado como bloqueado) e oferece o cadastro.
 */
export function RequireAccount({
  children,
  title = "Crie sua conta para ver isto",
  description = "Sua análise atual é preservada — o cadastro mantém tudo o que você já enviou.",
  placeholderLabel,
}: RequireAccountProps) {
  const { isAnonymous, loading } = useAuth();
  const [dialogOpen, setDialogOpen] = React.useState(false);

  if (loading || !isAnonymous) return <>{children}</>;

  return (
    <>
      <div className="relative isolate">
        <div aria-hidden inert className="pointer-events-none select-none blur-[6px] saturate-50">
          {placeholderLabel ? (
            <div className="card flex h-40 items-center justify-center">
              <span className="label-h6 text-neutral-600">{placeholderLabel}</span>
            </div>
          ) : (
            children
          )}
        </div>

        <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg/70 p-4">
          <div className="card max-w-sm text-center">
            <Lock className="mx-auto size-5 text-accent-700" aria-hidden />
            <h3 className="label-h6 mt-2 text-neutral-900">{title}</h3>
            <p className="mt-1 text-caption text-neutral-700">{description}</p>
            <Button className="mt-3 w-full" onClick={() => setDialogOpen(true)}>
              Criar conta e assinar
            </Button>
          </div>
        </div>
      </div>

      <AuthDialog open={dialogOpen} onOpenChange={setDialogOpen} defaultMode="criar" />
    </>
  );
}
