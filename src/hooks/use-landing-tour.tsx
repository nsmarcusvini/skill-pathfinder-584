import * as React from "react";

import { LANDING_TOUR_STEPS } from "@/lib/landing-tour-steps";
import type { UseTourReturn } from "@/hooks/use-tour";

const KEY = "rumvia:tour-landing";
type LandingTourStatus = "concluido" | "pulado";

function readStatus(): LandingTourStatus | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw === "concluido" || raw === "pulado" ? raw : null;
  } catch {
    return null;
  }
}

function writeStatus(status: LandingTourStatus): void {
  try {
    window.localStorage.setItem(KEY, status);
  } catch {
    // localStorage indisponível (aba privada, storage bloqueado): o tour só
    // não lembra que já rodou — não é motivo pra quebrar a landing.
  }
}

export interface UseLandingTourReturn extends UseTourReturn {
  /** true se este navegador já concluiu ou pulou o tour antes. */
  seen: boolean;
  /** Abre o tour (convite discreto ou scroll até #como-funciona). */
  start: () => void;
}

/**
 * Tour da landing para visitante anônimo — mesma interface de `useTour`, mas
 * sem tocar o banco: a sessão anônima é expurgada pelo cron `rumvia-purge-anon`
 * (regra 7 do CLAUDE.md), e a landing é a página mais sensível a round-trip
 * extra. `localStorage` no mesmo padrão de `src/lib/study-plan.ts`.
 */
export function useLandingTour(): UseLandingTourReturn {
  // Começa `true` (nunca aparece) até o efeito ler o localStorage — evita um
  // flash do convite em SSR/primeira pintura, quando window ainda não existe.
  const [seen, setSeen] = React.useState(true);
  const [active, setActive] = React.useState(false);
  const [step, setStep] = React.useState(0);

  React.useEffect(() => {
    setSeen(readStatus() !== null);
  }, []);

  const total = LANDING_TOUR_STEPS.length;

  const start = React.useCallback(() => {
    setStep(0);
    setActive(true);
  }, []);

  const finalize = React.useCallback((status: LandingTourStatus) => {
    writeStatus(status);
    setSeen(true);
    setActive(false);
  }, []);

  const next = React.useCallback(() => setStep((s) => Math.min(s + 1, total - 1)), [total]);
  const back = React.useCallback(() => setStep((s) => Math.max(s - 1, 0)), []);
  const skip = React.useCallback(() => finalize("pulado"), [finalize]);
  const finish = React.useCallback(() => finalize("concluido"), [finalize]);

  return {
    active,
    step,
    total,
    current: active ? (LANDING_TOUR_STEPS[step] ?? null) : null,
    isFirst: step === 0,
    isLast: step === total - 1,
    next,
    back,
    skip,
    finish,
    seen,
    start,
  };
}
