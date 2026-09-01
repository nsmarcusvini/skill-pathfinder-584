import * as React from "react";
import { Compass } from "lucide-react";

import { TourOverlay } from "@/components/rumvia/tour";
import { useLandingTour } from "@/hooks/use-landing-tour";

/**
 * Tour da landing para visitante anônimo. Nunca abre sozinho no primeiro
 * segundo — overlay automático em landing derruba conversão. Ou a pessoa
 * clica no convite discreto, ou rola até #como-funciona (sinal de interesse
 * real), o que vier primeiro.
 */
export function LandingTour() {
  const tour = useLandingTour();
  const triggeredRef = React.useRef(false);

  React.useEffect(() => {
    if (tour.seen || tour.active || triggeredRef.current) return;
    const el = document.querySelector("#como-funciona");
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !triggeredRef.current) {
          triggeredRef.current = true;
          tour.start();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [tour.seen, tour.active, tour]);

  if (tour.seen) return null;

  return (
    <>
      {!tour.active && (
        <button
          type="button"
          onClick={tour.start}
          className="fixed bottom-5 left-5 z-[60] flex items-center gap-2 border border-divider bg-surface px-3 py-2 text-caption text-neutral-700 shadow-lg hover:text-accent-700"
        >
          <Compass className="size-4" aria-hidden />
          Ver tour de 40s
        </button>
      )}
      <TourOverlay tour={tour} />
    </>
  );
}
