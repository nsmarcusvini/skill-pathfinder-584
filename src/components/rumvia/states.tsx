import type { ReactNode } from "react";
import { AlertTriangle, Inbox } from "lucide-react";
import { Blueprint } from "./blueprint";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <Blueprint className={cn("flex flex-col items-center gap-3 px-6 py-8 text-center", className)}>
      <span className="text-neutral-500">{icon ?? <Inbox className="size-6" aria-hidden />}</span>
      <h5 className="font-heading">{title}</h5>
      {description ? <p className="caption max-w-md">{description}</p> : null}
      {action}
    </Blueprint>
  );
}

export interface LoadingStateProps {
  /** Número de linhas de skeleton. */
  rows?: number;
  label?: string;
  className?: string;
}

export function LoadingState({ rows = 4, label = "Carregando…", className }: LoadingStateProps) {
  return (
    <Blueprint className={cn("p-4", className)} aria-busy="true" aria-live="polite">
      <h6 className="mb-3 text-neutral-600">{label}</h6>
      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full bg-neutral-200" style={{ opacity: 1 - i * 0.12 }} />
        ))}
      </div>
    </Blueprint>
  );
}

export interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "Não foi possível carregar",
  description = "Ocorreu um erro ao buscar os dados. Tente novamente.",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <Blueprint className={cn("flex flex-col items-center gap-3 px-6 py-8 text-center", className)}>
      <AlertTriangle className="size-6 text-danger" aria-hidden />
      <h5 className="font-heading text-danger">{title}</h5>
      <p className="caption max-w-md">{description}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Tentar novamente
        </Button>
      ) : null}
    </Blueprint>
  );
}
