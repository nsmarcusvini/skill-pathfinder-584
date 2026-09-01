import * as React from "react";
import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/use-subscription";
import { TOUR_STEPS, type TourStep } from "@/lib/tour-steps";

const STEP_WRITE_DEBOUNCE_MS = 600;

export interface UseTourReturn {
  active: boolean;
  step: number;
  total: number;
  current: TourStep | null;
  isFirst: boolean;
  isLast: boolean;
  next: () => void;
  back: () => void;
  skip: () => void;
  finish: () => void;
}

/**
 * Tour guiado pós-cadastro (14 pop-ups no menu lateral). Não confundir com
 * o wizard de /onboarding (profiles.onboarding_completed) — este hook só
 * ativa DEPOIS dele, uma vez, e nunca para sessão anônima.
 */
export function useTour(): UseTourReturn {
  const { user, profile, isAuthenticated, isOnboarded, loading } = useAuth();
  const { canAccess } = useSubscription();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;

  // canAccess entra na elegibilidade porque o tour roda por cima de TUDO
  // (camada full-screen que intercepta clique). Sem essa checagem, uma
  // assinatura vencida com tour "em_andamento" abria o overlay bloqueando o
  // próprio botão "Assinar agora" em /assinatura — cliente pagante trancado
  // atrás do próprio tour. canAccess é false por padrão enquanto resolve
  // (useSubscription), então isso também evita o flash do tour antes de saber
  // se a assinatura está ativa.
  const eligible =
    !loading &&
    isAuthenticated &&
    isOnboarded &&
    canAccess &&
    Boolean(profile) &&
    (profile?.tour_status === "pendente" || profile?.tour_status === "em_andamento");

  const [step, setStep] = React.useState(0);
  const [ready, setReady] = React.useState(false);
  const initializedFor = React.useRef<string | null>(null);
  const finalized = React.useRef(false);

  React.useEffect(() => {
    if (!eligible || !userId || !profile) return;
    if (initializedFor.current === userId) return;
    initializedFor.current = userId;
    setStep(Math.min(Math.max(profile.tour_step, 0), TOUR_STEPS.length - 1));
    setReady(true);

    if (profile.tour_status === "pendente") {
      void supabase
        .from("profiles")
        .update({ tour_status: "em_andamento", tour_updated_at: new Date().toISOString() })
        .eq("id", userId)
        .then(({ error }) => {
          if (error) console.error("Tour: falha ao marcar em_andamento:", error.message);
        });
    }
  }, [eligible, userId, profile]);

  // A gravação do passo vive num efeito, nunca dentro do updater do setStep:
  // efeito colateral durante o render é descartado/duplicado pelo React e a
  // escrita simplesmente não acontecia. O cleanup cancela o timer anterior, então
  // só o último passo de uma sequência rápida chega ao banco — e o write inicial
  // com step=0 é cancelado assim que o efeito de init corrige o valor lido.
  React.useEffect(() => {
    if (!ready || !eligible || !userId || finalized.current) return;
    const timer = setTimeout(() => {
      void supabase
        .from("profiles")
        .update({ tour_step: step, tour_updated_at: new Date().toISOString() })
        .eq("id", userId)
        .then(({ error }) => {
          if (error) console.error("Tour: falha ao gravar o passo:", error.message);
        });
    }, STEP_WRITE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [step, ready, eligible, userId]);

  const finalize = React.useCallback(
    (status: "concluido" | "pulado") => {
      if (!userId) return;
      finalized.current = true;
      void (async () => {
        const { error } = await supabase
          .from("profiles")
          .update({ tour_status: status, tour_updated_at: new Date().toISOString() })
          .eq("id", userId);
        if (error) console.error("Tour: falha ao encerrar:", error.message);
        await queryClient.invalidateQueries({ queryKey: ["profile", userId] });
      })();
    },
    [userId, queryClient],
  );

  const total = TOUR_STEPS.length;

  const next = React.useCallback(() => {
    setStep((s) => Math.min(s + 1, total - 1));
  }, [total]);

  const back = React.useCallback(() => {
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  const skip = React.useCallback(() => finalize("pulado"), [finalize]);
  const finish = React.useCallback(() => finalize("concluido"), [finalize]);

  return {
    active: eligible,
    step,
    total,
    current: eligible ? (TOUR_STEPS[step] ?? null) : null,
    isFirst: step === 0,
    isLast: step === total - 1,
    next,
    back,
    skip,
    finish,
  };
}

/** Usado por /conta para reexecutar o tour do zero. */
export async function restartTour(userId: string, queryClient: QueryClient): Promise<void> {
  await supabase
    .from("profiles")
    .update({ tour_status: "pendente", tour_step: 0, tour_updated_at: new Date().toISOString() })
    .eq("id", userId);
  await queryClient.invalidateQueries({ queryKey: ["profile", userId] });
}
