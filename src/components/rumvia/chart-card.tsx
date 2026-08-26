import type { ReactNode } from "react";
import { Blueprint } from "./blueprint";
import { cn } from "@/lib/utils";

export interface ChartLegendItem {
  label: string;
  color: string;
}

export interface ChartCardProps {
  title: string;
  description?: string;
  /** Controle de filtro exibido no cabeçalho. */
  filter?: ReactNode;
  legend?: ChartLegendItem[];
  footnote?: string;
  children: ReactNode;
  className?: string;
}

export function ChartCard({
  title,
  description,
  filter,
  legend,
  footnote,
  children,
  className,
}: ChartCardProps) {
  return (
    <Blueprint className={cn("flex flex-col", className)}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-divider p-3">
        <div className="min-w-0">
          <h6 className="truncate text-neutral-700">{title}</h6>
          {description ? <p className="caption mt-1">{description}</p> : null}
        </div>
        {filter ? <div className="shrink-0">{filter}</div> : null}
      </div>

      <div className="p-3">{children}</div>

      {legend?.length ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-divider px-3 py-2">
          {legend.map((item) => (
            <span key={item.label} className="caption inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block size-2.5"
                style={{ backgroundColor: item.color }}
              />
              {item.label}
            </span>
          ))}
        </div>
      ) : null}

      {footnote ? <p className="caption border-t border-divider px-3 py-2">{footnote}</p> : null}
    </Blueprint>
  );
}
