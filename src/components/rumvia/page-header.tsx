import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  title: string;
  subtitle?: string | undefined;
  eyebrow?: string | undefined;
  actions?: ReactNode | undefined;
  className?: string | undefined;
}

export function PageHeader({ title, subtitle, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "grid grid-cols-1 items-start gap-4 border-b border-divider pb-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? <p className="label-h6 mb-1 text-neutral-600">{eyebrow}</p> : null}
        <h1 className="truncate font-heading text-h2">{title}</h1>
        {subtitle ? <p className="mt-1 text-body text-neutral-700">{subtitle}</p> : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>
      ) : null}
    </header>
  );
}
