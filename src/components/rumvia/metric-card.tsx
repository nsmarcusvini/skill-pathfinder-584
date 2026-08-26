import type { ReactNode } from "react";
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { Blueprint } from "./blueprint";
import { cn } from "@/lib/utils";

export interface MetricCardProps {
  /** Legenda em h6 uppercase. */
  label: string;
  /** Valor grande, em mono tabular. */
  value: string | number;
  unit?: string;
  /** Variação percentual/absoluta. Positivo = alta. */
  delta?: number;
  deltaSuffix?: string;
  hint?: string;
  icon?: ReactNode;
  className?: string;
}

export function MetricCard({
  label,
  value,
  unit,
  delta,
  deltaSuffix = "%",
  hint,
  icon,
  className,
}: MetricCardProps) {
  const dir = delta === undefined ? null : delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const DeltaIcon = dir === "up" ? ArrowUp : dir === "down" ? ArrowDown : ArrowRight;

  return (
    <Blueprint className={cn("p-4", className)}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <h6 className="min-w-0 truncate text-neutral-700">{label}</h6>
        {icon ? <span className="shrink-0 text-accent-600">{icon}</span> : null}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="num text-[32px] font-semibold leading-none">{value}</span>
        {unit ? <span className="num text-body text-neutral-600">{unit}</span> : null}
      </div>

      {dir ? (
        <div
          className={cn(
            "mt-2 inline-flex items-center gap-1 text-caption font-medium",
            dir === "up" && "text-success",
            dir === "down" && "text-danger",
            dir === "flat" && "text-neutral-600",
          )}
        >
          <DeltaIcon className="size-3.5" aria-hidden />
          <span className="num">
            {delta! > 0 ? "+" : ""}
            {delta}
            {deltaSuffix}
          </span>
        </div>
      ) : null}

      {hint ? <p className="caption mt-2">{hint}</p> : null}
    </Blueprint>
  );
}
