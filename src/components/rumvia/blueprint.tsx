import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * <Blueprint> — contêiner base do sistema RUMVIA.
 * Borda hairline (1px, --color-divider), radius 0 e as quatro marcas de
 * registro renderizadas automaticamente. Nunca escreva os <i class="corner">
 * à mão em tela alguma.
 */
export interface BlueprintProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: "div" | "section" | "article" | "aside" | "header" | "footer";
  /** Oculta as marcas de registro (mantém hairline + canto reto). */
  marks?: boolean;
}

export const Blueprint = React.forwardRef<HTMLDivElement, BlueprintProps>(
  ({ className, children, as = "div", marks = true, ...props }, ref) => {
    const Comp = as as React.ElementType;
    return (
      <Comp ref={ref} className={cn("blueprint", className)} {...props}>
        {marks ? (
          <>
            <i aria-hidden className="corner tl" />
            <i aria-hidden className="corner tr" />
            <i aria-hidden className="corner bl" />
            <i aria-hidden className="corner br" />
          </>
        ) : null}
        {children}
      </Comp>
    );
  },
);
Blueprint.displayName = "Blueprint";

/**
 * <Duotone> — wrapper de imagem com o tratamento duotone da paleta.
 */
export interface DuotoneProps extends React.HTMLAttributes<HTMLDivElement> {
  src: string;
  alt: string;
  imgClassName?: string;
  loading?: "lazy" | "eager";
}

export const Duotone = React.forwardRef<HTMLDivElement, DuotoneProps>(
  ({ src, alt, className, imgClassName, loading = "lazy", ...props }, ref) => (
    <div ref={ref} className={cn("duotone", className)} {...props}>
      <img src={src} alt={alt} loading={loading} className={imgClassName} />
    </div>
  ),
);
Duotone.displayName = "Duotone";
