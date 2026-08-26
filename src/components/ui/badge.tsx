import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/** Badge derivado da classe estrutural `.tag`. */
const badgeVariants = cva("tag", {
  variants: {
    variant: {
      default: "bg-accent-200 text-accent-900 border-accent-400",
      neutral: "bg-surface text-neutral-800 border-divider",
      outline: "bg-transparent text-text border-divider",
      success: "bg-transparent text-success border-success",
      warning: "bg-transparent text-warning border-warning",
      danger: "bg-transparent text-danger border-danger",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
