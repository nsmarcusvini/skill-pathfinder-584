import * as React from "react";

import { cn } from "@/lib/utils";

/** Textarea derivada da classe estrutural `.field`. */
const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea className={cn("field min-h-20 resize-y", className)} ref={ref} {...props} />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
