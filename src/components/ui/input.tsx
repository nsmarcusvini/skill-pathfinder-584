import * as React from "react";

import { cn } from "@/lib/utils";

/** Input derivado da classe estrutural `.field` — canto reto, hairline. */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => (
    <input type={type} className={cn("field h-8", className)} ref={ref} {...props} />
  ),
);
Input.displayName = "Input";

export { Input };
