import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Botão derivado da classe estrutural `.btn` do Design System RUMVIA.
 * Canto reto sempre — não adicione `rounded-*`.
 */
const buttonVariants = cva("btn [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0", {
  variants: {
    variant: {
      default:
        "bg-accent-700 text-accent-100 border-accent-700 hover:bg-accent-800 hover:border-accent-800 active:bg-accent-900 active:border-accent-900",
      outline:
        "bg-bg text-text border-divider hover:bg-neutral-200 active:bg-neutral-300 active:border-neutral-400",
      secondary:
        "bg-surface text-text border-divider hover:bg-neutral-300 active:bg-neutral-400 active:text-neutral-900",
      ghost: "bg-transparent text-text border-transparent hover:bg-neutral-200 active:bg-neutral-300",
      destructive:
        "bg-danger text-neutral-100 border-danger hover:bg-[color-mix(in_oklab,var(--color-danger)_88%,black)] active:bg-[color-mix(in_oklab,var(--color-danger)_76%,black)]",
      link: "bg-transparent border-transparent text-accent-700 underline-offset-4 hover:underline",
    },
    size: {
      default: "h-8 px-3",
      sm: "h-7 px-2 text-[13px]",
      lg: "h-10 px-6",
      icon: "h-8 w-8 px-0",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean | undefined;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size, className }));

    // Com asChild o Slot exige um único filho: nunca injetar o spinner aqui.
    if (asChild) {
      return (
        <Slot className={classes} ref={ref} aria-busy={loading || undefined} {...props}>
          {children}
        </Slot>
      );
    }

    return (
      <button
        className={classes}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
